import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentStatus as PrismaPaymentStatus,
  PaymentMethod as PrismaPaymentMethod,
  ProviderPayoutStatus as PrismaProviderPayoutStatus,
} from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type {
  AdminFinanceCommissionsResponse,
  AdminFinanceExportsResponse,
  AdminFinanceOverviewResponse,
  AdminFinancePaymentItem,
  AdminFinancePayoutItem,
  AdminFinanceSettingsResponse,
  AdminFinanceInvoicesResponse,
  AdminFinanceInvoiceRecord,
  AdminFinanceStatementRecord,
  AdminPaginatedResponse,
  PaymentMethod,
  PaymentStatus,
  ProviderPayoutStatus,
} from '@saubio/models';
import { PrismaService } from '../../prisma/prisma.service';
import type { AppEnvironmentConfig } from '../config/configuration';
import {
  FinanceCommissionsQueryDto,
  FinancePaymentsQueryDto,
  FinancePayoutsQueryDto,
  FinanceRangeQueryDto,
  FinanceInvoicesQueryDto,
} from './dto/admin-finance-query.dto';

type PaymentWithRelations = Prisma.PaymentGetPayload<{ include: { client: true; booking: true } }>;
type ProviderPayoutWithRelations = Prisma.ProviderPayoutGetPayload<{
  include: { provider: { select: { id: true; payoutActivationStatus: true; payoutIbanMasked: true; user: true } } };
}>;

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;

@Injectable()
export class EmployeeFinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private resolveRange(query: FinanceRangeQueryDto) {
    const now = new Date();
    const to = query.to ? new Date(query.to) : now;
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);
    return { from, to };
  }

  private paginate<T>(items: T[], total: number, page: number, pageSize: number): AdminPaginatedResponse<T> {
    return { items, total, page, pageSize };
  }

  private normalizePaymentStatus(status: PrismaPaymentStatus): PaymentStatus {
    return status.toLowerCase() as PaymentStatus;
  }

  private normalizePaymentMethod(method?: PrismaPaymentMethod | null): PaymentMethod | null {
    return method ? (method.toLowerCase() as PaymentMethod) : null;
  }

  private normalizePayoutStatus(status: PrismaProviderPayoutStatus): ProviderPayoutStatus {
    return status.toLowerCase() as ProviderPayoutStatus;
  }

  private formatPaymentRecord(record: PaymentWithRelations): AdminFinancePaymentItem {
    return {
      id: record.id,
      bookingId: record.bookingId,
      occurredAt: record.occurredAt.toISOString(),
      amountCents: record.amountCents,
      platformFeeCents: record.platformFeeCents,
      currency: record.currency,
      status: this.normalizePaymentStatus(record.status),
      method: this.normalizePaymentMethod(record.method),
      provider: record.provider,
      externalReference: record.externalReference ?? null,
      metadataPurpose: undefined,
      service: record.booking?.service ?? undefined,
      city: record.booking?.addressCity ?? undefined,
      postalCode: record.booking?.addressPostalCode ?? undefined,
      client: {
        id: record.client.id,
        name: `${record.client.firstName ?? ''} ${record.client.lastName ?? ''}`.trim() || record.client.email,
        email: record.client.email,
      },
    };
  }

  private formatPayoutRecord(record: ProviderPayoutWithRelations): AdminFinancePayoutItem {
    let missions: AdminFinancePayoutItem['missions'] = [];
    if (Array.isArray(record.missions)) {
      missions = record.missions as AdminFinancePayoutItem['missions'];
    } else if (record.missions) {
      try {
        const parsed = typeof record.missions === 'string' ? JSON.parse(record.missions) : record.missions;
        if (Array.isArray(parsed)) {
          missions = parsed;
        }
      } catch {
        missions = [];
      }
    }
    return {
      id: record.id,
      provider: {
        id: record.provider.id,
        name: `${record.provider.user.firstName ?? ''} ${record.provider.user.lastName ?? ''}`.trim() || record.provider.user.email,
        email: record.provider.user.email,
        ibanMasked: record.provider.payoutIbanMasked ?? null,
        payoutActivationStatus: record.provider.payoutActivationStatus ?? null,
      },
      amountCents: record.amountCents,
      currency: record.currency,
      status: this.normalizePayoutStatus(record.status),
      createdAt: record.createdAt.toISOString(),
      scheduledAt: record.availableOn ? record.availableOn.toISOString() : null,
      releasedAt: record.releasedAt ? record.releasedAt.toISOString() : null,
      externalReference: record.externalReference ?? null,
      missions,
    };
  }

  private formatInvoiceRecord(record: PaymentWithRelations): AdminFinanceInvoiceRecord {
    return {
      id: record.id,
      bookingId: record.bookingId,
      client: {
        id: record.client.id,
        name: `${record.client.firstName ?? ''} ${record.client.lastName ?? ''}`.trim() || record.client.email,
        email: record.client.email,
      },
      issuedAt: record.occurredAt.toISOString(),
      amountCents: record.amountCents,
      taxCents: record.booking?.pricingTaxCents ?? null,
      currency: record.currency,
      status: this.normalizePaymentStatus(record.status),
      method: this.normalizePaymentMethod(record.method),
      downloadUrl: null,
    };
  }

  private formatStatementRecord(record: ProviderPayoutWithRelations): AdminFinanceStatementRecord {
    return {
      id: record.id,
      provider: {
        id: record.provider.id,
        name: `${record.provider.user.firstName ?? ''} ${record.provider.user.lastName ?? ''}`.trim() || record.provider.user.email,
        email: record.provider.user.email,
      },
      amountCents: record.amountCents,
      commissionCents: null,
      netAmountCents: record.amountCents,
      periodStart: record.availableOn ? record.availableOn.toISOString() : null,
      periodEnd: record.releasedAt ? record.releasedAt.toISOString() : null,
      currency: record.currency,
      status: this.normalizePayoutStatus(record.status),
      releasedAt: record.releasedAt ? record.releasedAt.toISOString() : null,
    };
  }

  async getOverview(query: FinanceRangeQueryDto): Promise<AdminFinanceOverviewResponse> {
    const { from, to } = this.resolveRange(query);
    const paymentsWhere = { occurredAt: { gte: from, lte: to } };

    const successStatuses = [PrismaPaymentStatus.CAPTURED, PrismaPaymentStatus.RELEASED];
    const successStatusesLower = successStatuses.map((status) => status.toLowerCase() as PaymentStatus);
    const pendingStatuses = [
      PrismaPaymentStatus.PENDING,
      PrismaPaymentStatus.REQUIRES_ACTION,
      PrismaPaymentStatus.AUTHORIZED,
      PrismaPaymentStatus.CAPTURE_PENDING,
      PrismaPaymentStatus.HELD,
    ];
    const pendingStatusesLower = pendingStatuses.map((status) => status.toLowerCase() as PaymentStatus);
    const failedStatuses = [PrismaPaymentStatus.FAILED, PrismaPaymentStatus.DISPUTED];
    const failedStatusesLower = failedStatuses.map((status) => status.toLowerCase() as PaymentStatus);
    const refundedStatuses = [PrismaPaymentStatus.REFUNDED];
    const refundedStatusesLower = refundedStatuses.map((status) => status.toLowerCase() as PaymentStatus);

    const [
      successAgg,
      platformFeeAgg,
      failedAgg,
      refundedAgg,
      paymentCounts,
      paymentChartRecords,
      recentPaymentsRaw,
      payoutsPaidAgg,
      payoutsPendingAgg,
      payoutChartRecords,
      recentPayoutsRaw,
    ] = await Promise.all([
      this.prisma.payment.aggregate({
        _sum: { amountCents: true },
        where: { ...paymentsWhere, status: { in: successStatuses } },
      }),
      this.prisma.payment.aggregate({
        _sum: { platformFeeCents: true },
        where: { ...paymentsWhere, status: { in: successStatuses } },
      }),
      this.prisma.payment.aggregate({
        _sum: { amountCents: true },
        where: { ...paymentsWhere, status: { in: failedStatuses } },
      }),
      this.prisma.payment.aggregate({
        _sum: { amountCents: true },
        where: { ...paymentsWhere, status: { in: refundedStatuses } },
      }),
      this.prisma.payment.groupBy({
        by: ['status'],
        _count: { _all: true },
        where: paymentsWhere,
      }),
      this.prisma.payment.findMany({
        where: paymentsWhere,
        select: { occurredAt: true, amountCents: true, platformFeeCents: true, status: true },
      }),
      this.prisma.payment.findMany({
        where: paymentsWhere,
        orderBy: { occurredAt: 'desc' },
        take: 5,
        include: { client: true, booking: true },
      }),
      this.prisma.providerPayout.aggregate({
        _sum: { amountCents: true },
        where: { createdAt: { gte: from, lte: to }, status: PrismaProviderPayoutStatus.PAID },
      }),
      this.prisma.providerPayout.aggregate({
        _sum: { amountCents: true },
        where: { createdAt: { gte: from, lte: to }, status: { in: [PrismaProviderPayoutStatus.PENDING, PrismaProviderPayoutStatus.PROCESSING] } },
      }),
      this.prisma.providerPayout.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { createdAt: true, amountCents: true },
      }),
      this.prisma.providerPayout.findMany({
        where: { createdAt: { gte: from, lte: to } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { provider: { select: { id: true, payoutIbanMasked: true, payoutActivationStatus: true, user: true } } },
      }),
    ]);

    const paymentsByDayMap = new Map<string, { gross: number; net: number; failed: number }>();
    for (const record of paymentChartRecords) {
      const dayKey = record.occurredAt.toISOString().split('T')[0];
      if (!paymentsByDayMap.has(dayKey)) {
        paymentsByDayMap.set(dayKey, { gross: 0, net: 0, failed: 0 });
      }
      const bucket = paymentsByDayMap.get(dayKey)!;
      bucket.gross += record.amountCents;
      bucket.net += record.platformFeeCents;
      const normalizedStatus = (record.status as string).toLowerCase() as PaymentStatus;
      if (failedStatusesLower.includes(normalizedStatus)) {
        bucket.failed += record.amountCents;
      }
    }
    const paymentsByDay = [...paymentsByDayMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, values]) => ({ date, grossCents: values.gross, netCents: values.net, failedCents: values.failed }));

    const payoutsByWeekMap = new Map<string, number>();
    for (const record of payoutChartRecords) {
      const weekStart = this.startOfWeek(record.createdAt);
      const key = weekStart.toISOString().split('T')[0];
      payoutsByWeekMap.set(key, (payoutsByWeekMap.get(key) ?? 0) + record.amountCents);
    }
    const payoutsByWeek = [...payoutsByWeekMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, amountCents]) => ({ week, amountCents }));

    const totals = {
      grossRevenueCents: successAgg._sum.amountCents ?? 0,
      netRevenueCents: platformFeeAgg._sum.platformFeeCents ?? 0,
      commissionCents: platformFeeAgg._sum.platformFeeCents ?? 0,
      payoutPaidCents: payoutsPaidAgg._sum.amountCents ?? 0,
      payoutPendingCents: payoutsPendingAgg._sum.amountCents ?? 0,
      failedAmountCents: failedAgg._sum.amountCents ?? 0,
      refundedAmountCents: refundedAgg._sum.amountCents ?? 0,
    };

    const counts = {
      paymentsSuccess:
        paymentCounts
          .filter((entry) => successStatusesLower.includes((entry.status as string).toLowerCase() as PaymentStatus))
          .reduce((acc, entry) => acc + entry._count._all, 0),
      paymentsPending: paymentCounts
        .filter((entry) => pendingStatusesLower.includes((entry.status as string).toLowerCase() as PaymentStatus))
        .reduce((acc, entry) => acc + entry._count._all, 0),
      paymentsFailed:
        paymentCounts
          .filter((entry) => failedStatusesLower.includes((entry.status as string).toLowerCase() as PaymentStatus))
          .reduce((acc, entry) => acc + entry._count._all, 0),
      paymentsRefunded:
        paymentCounts
          .filter((entry) => refundedStatusesLower.includes((entry.status as string).toLowerCase() as PaymentStatus))
          .reduce((acc, entry) => acc + entry._count._all, 0),
    };

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      totals,
      counts,
      charts: {
        paymentsByDay,
        payoutsByWeek,
      },
      recent: {
        payments: recentPaymentsRaw.map((payment) => this.formatPaymentRecord(payment)),
        payouts: recentPayoutsRaw.map((payout) => this.formatPayoutRecord(payout)),
      },
    };
  }

  async listPayments(query: FinancePaymentsQueryDto): Promise<AdminPaginatedResponse<AdminFinancePaymentItem>> {
    const { from, to } = this.resolveRange(query);
    const page = Math.max(Number(query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 25, 1), 100);
    const skip = (page - 1) * pageSize;

    const where: Parameters<typeof this.prisma.payment.findMany>[0]['where'] = {
      occurredAt: { gte: from, lte: to },
    };

    if (query.status) {
      const statusKey = query.status.toUpperCase() as PrismaPaymentStatus;
      where.status = statusKey;
    }

    if (query.method) {
      where.method = query.method.toUpperCase() as PrismaPaymentMethod;
    }

    if (query.bookingId) {
      where.bookingId = query.bookingId;
    }

    if (query.clientEmail) {
      where.client = { email: { contains: query.clientEmail, mode: 'insensitive' } };
    }

    const bookingWhere: Prisma.BookingWhereInput = {};

    if (query.city) {
      bookingWhere.addressCity = { contains: query.city, mode: 'insensitive' };
    }

    if (query.service) {
      bookingWhere.service = { equals: query.service, mode: 'insensitive' };
    }

    if (Object.keys(bookingWhere).length > 0) {
      where.booking = { is: bookingWhere };
    }

    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { id: { contains: term, mode: 'insensitive' } },
        { externalReference: { contains: term, mode: 'insensitive' } },
        { booking: { id: { contains: term, mode: 'insensitive' } } },
        { client: { email: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [total, payments] = await this.prisma.$transaction([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip,
        take: pageSize,
        include: { client: true, booking: true },
      }),
    ]);

    return this.paginate(payments.map((payment) => this.formatPaymentRecord(payment)), total, page, pageSize);
  }

  async listPayouts(query: FinancePayoutsQueryDto): Promise<AdminPaginatedResponse<AdminFinancePayoutItem>> {
    const { from, to } = this.resolveRange(query);
    const page = Math.max(Number(query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 25, 1), 100);
    const skip = (page - 1) * pageSize;

    const where: Parameters<typeof this.prisma.providerPayout.findMany>[0]['where'] = {
      createdAt: { gte: from, lte: to },
    };

    if (query.status) {
      where.status = query.status.toUpperCase() as PrismaProviderPayoutStatus;
    }

    if (query.providerId) {
      where.providerId = query.providerId;
    }

    if (query.search) {
      const term = query.search.trim();
      if (term) {
        where.OR = [
          { id: { contains: term, mode: 'insensitive' } },
          { externalReference: { contains: term, mode: 'insensitive' } },
          {
            provider: {
              OR: [
                { payoutIbanMasked: { contains: term, mode: 'insensitive' } },
                { user: { email: { contains: term, mode: 'insensitive' } } },
                { user: { firstName: { contains: term, mode: 'insensitive' } } },
                { user: { lastName: { contains: term, mode: 'insensitive' } } },
              ],
            },
          },
        ];
      }
    }

    const [total, payouts] = await this.prisma.$transaction([
      this.prisma.providerPayout.count({ where }),
      this.prisma.providerPayout.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          provider: { select: { id: true, payoutIbanMasked: true, payoutActivationStatus: true, user: true } },
        },
      }),
    ]);

    return this.paginate(payouts.map((payout) => this.formatPayoutRecord(payout)), total, page, pageSize);
  }

  async getCommissions(query: FinanceCommissionsQueryDto): Promise<AdminFinanceCommissionsResponse> {
    const { from, to } = this.resolveRange(query);
    const where: Parameters<typeof this.prisma.booking.findMany>[0]['where'] = {
      startAt: { gte: from, lte: to },
    };

    if (query.service) {
      where.service = { equals: query.service, mode: 'insensitive' };
    }

    if (query.city) {
      where.addressCity = { contains: query.city, mode: 'insensitive' };
    }

    const bookings = await this.prisma.booking.findMany({
      where,
      orderBy: { startAt: 'desc' },
      include: {
        payments: {
          orderBy: { occurredAt: 'desc' },
          take: 1,
        },
      },
    });

    const rows = bookings.map((booking) => {
      const payment = booking.payments[0];
      const providerShare = payment ? payment.amountCents - payment.platformFeeCents : booking.pricingTotalCents;
      const commission = payment ? payment.platformFeeCents : booking.pricingTotalCents - providerShare;
      return {
        bookingId: booking.id,
        service: booking.service,
        city: booking.addressCity,
        startAt: booking.startAt.toISOString(),
        totalCents: booking.pricingTotalCents,
        providerShareCents: providerShare,
        commissionCents: commission,
        taxCents: booking.pricingTaxCents,
      };
    });

    const totals = rows.reduce(
      (acc, row) => {
        acc.commissionCents += row.commissionCents;
        acc.providerShareCents += row.providerShareCents;
        acc.taxCents += row.taxCents;
        acc.bookings += 1;
        return acc;
      },
      { commissionCents: 0, providerShareCents: 0, taxCents: 0, bookings: 0 }
    );

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      totals,
      rows,
    };
  }

  async getInvoices(query: FinanceInvoicesQueryDto): Promise<AdminFinanceInvoicesResponse> {
    const { from, to } = this.resolveRange(query);
    const paymentsWhere: Prisma.PaymentWhereInput = {
      occurredAt: { gte: from, lte: to },
    };

    if (query.clientId) {
      paymentsWhere.clientId = query.clientId;
    }

    if (query.search) {
      const term = query.search.trim();
      if (term) {
        paymentsWhere.OR = [
          { id: { contains: term, mode: 'insensitive' } },
          { externalReference: { contains: term, mode: 'insensitive' } },
          { booking: { id: { contains: term, mode: 'insensitive' } } },
          { client: { email: { contains: term, mode: 'insensitive' } } },
        ];
      }
    }

    const payoutsWhere: Prisma.ProviderPayoutWhereInput = {
      createdAt: { gte: from, lte: to },
    };

    if (query.providerId) {
      payoutsWhere.providerId = query.providerId;
    }

    if (query.search) {
      const term = query.search.trim();
      if (term) {
        payoutsWhere.OR = [
          { id: { contains: term, mode: 'insensitive' } },
          { externalReference: { contains: term, mode: 'insensitive' } },
          {
            provider: {
              OR: [
                { user: { email: { contains: term, mode: 'insensitive' } } },
                { user: { firstName: { contains: term, mode: 'insensitive' } } },
                { user: { lastName: { contains: term, mode: 'insensitive' } } },
              ],
            },
          },
        ];
      }
    }

    const [payments, payouts] = await Promise.all([
      this.prisma.payment.findMany({
        where: paymentsWhere,
        orderBy: { occurredAt: 'desc' },
        include: { booking: true, client: true },
        take: 100,
      }),
      this.prisma.providerPayout.findMany({
        where: payoutsWhere,
        orderBy: { createdAt: 'desc' },
        include: { provider: { select: { id: true, payoutActivationStatus: true, payoutIbanMasked: true, user: true } } },
        take: 100,
      }),
    ]);

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      clientInvoices: payments.map((payment) => this.formatInvoiceRecord(payment)),
      providerStatements: payouts.map((payout) => this.formatStatementRecord(payout)),
    };
  }

  async getExports(query: FinanceRangeQueryDto): Promise<AdminFinanceExportsResponse> {
    const { from, to } = this.resolveRange(query);
    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      available: [
        { type: 'payments', label: 'Comptabilité (CSV)', description: 'Paiements clients + TVA', formats: ['csv'], enabled: false },
        { type: 'payouts', label: 'Payouts prestataires', description: 'Montants net/brut par prestataire', formats: ['xlsx'], enabled: false },
        { type: 'invoices', label: 'Factures clients', description: 'Export PDF compressé', formats: ['zip'], enabled: false },
      ],
      recent: [],
    };
  }

  async getSettings(): Promise<AdminFinanceSettingsResponse> {
    const config = this.configService.get<AppEnvironmentConfig>('app');
    const provider = config?.mollieApiKey ? 'mollie' : 'none';
    const mode = config?.nodeEnv ?? 'development';
    const webhookUrl = config?.paymentsWebhookUrl ?? null;

    const [events, mandates] = await Promise.all([
      this.prisma.paymentEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, type: true, createdAt: true },
      }),
      this.prisma.paymentMandate.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: { client: { select: { id: true, email: true, firstName: true, lastName: true } } },
      }),
    ]);

    return {
      provider,
      mode,
      webhookUrl,
      webhookHealthy: events.length > 0 ? true : null,
      recentEvents: events.map((event) => ({
        id: event.id,
        type: event.type,
        status: 'received',
        createdAt: event.createdAt.toISOString(),
      })),
      mandates: mandates.map((mandate) => ({
        id: mandate.id,
        providerId: mandate.clientId,
        providerName: `${mandate.client.firstName ?? ''} ${mandate.client.lastName ?? ''}`.trim() || mandate.client.email,
        status: mandate.status,
        updatedAt: mandate.updatedAt.toISOString(),
      })),
    };
  }

  private startOfWeek(date: Date) {
    const clone = new Date(date);
    const day = clone.getUTCDay();
    const diff = clone.getUTCDate() - day + (day === 0 ? -6 : 1);
    clone.setUTCDate(diff);
    clone.setUTCHours(0, 0, 0, 0);
    return clone;
  }
}
