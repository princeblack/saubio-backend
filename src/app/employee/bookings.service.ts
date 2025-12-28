import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BookingMode as PrismaBookingMode,
  BookingStatus as PrismaBookingStatus,
  PaymentStatus as PrismaPaymentStatus,
  Prisma,
  Booking as PrismaBooking,
  BookingAssignment as PrismaBookingAssignment,
  Payment as PrismaPayment,
} from '@prisma/client';
import type {
  AdminBookingDetails,
  AdminBookingListItem,
  AdminBookingOverviewResponse,
  AdminBookingPaymentSummary,
  AdminPaginatedResponse,
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
  ServiceCategory,
} from '@saubio/models';
import { PrismaService } from '../../prisma/prisma.service';
import { BookingMapper, type BookingWithRelations } from '../bookings/booking.mapper';
import { AdminBookingsQueryDto } from './dto/admin-bookings-query.dto';

type BookingListRecord = PrismaBooking & {
  client: { id: string; firstName: string | null; lastName: string | null; email: string; phone: string | null } | null;
  assignments: Array<
    PrismaBookingAssignment & {
      provider: {
        id: string;
        user: { firstName: string | null; lastName: string | null; email: string; phone: string | null };
      };
    }
  >;
  payments: Array<PrismaPayment>;
};

@Injectable()
export class EmployeeBookingsService {
  private static readonly MAX_RECENT_BOOKINGS = 8;
  private static readonly BOOKING_CHART_DAYS = 14;
  private static readonly REVENUE_CHART_WEEKS = 8;

  constructor(private readonly prisma: PrismaService) {}

  async list(params: AdminBookingsQueryDto): Promise<AdminPaginatedResponse<AdminBookingListItem>> {
    const page = Math.max(Number(params.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 25, 1), 100);
    const where = this.buildWhereClause(params);

    const [total, bookings] = await this.prisma.$transaction([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        orderBy: { startAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          client: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          assignments: {
            orderBy: { createdAt: 'asc' },
            include: {
              provider: { select: { id: true, user: { select: { firstName: true, lastName: true, email: true, phone: true } } } },
            },
          },
          payments: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
    ]);

    return {
      items: bookings.map((booking) => this.mapListItem(booking)),
      total,
      page,
      pageSize,
    };
  }

  async getOverview(rangeDays = 30): Promise<AdminBookingOverviewResponse> {
    const now = new Date();
    const startOfToday = this.startOfDay(now);
    const endOfToday = this.addDays(startOfToday, 1);
    const startOfWeek = this.startOfWeek(now);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const bookingsChartStart = this.addDays(startOfToday, -(EmployeeBookingsService.BOOKING_CHART_DAYS - 1));
    const revenueChartStart = this.addDays(this.startOfWeek(now), -(EmployeeBookingsService.REVENUE_CHART_WEEKS - 1) * 7);
    const shortNoticeStatuses = [
      PrismaBookingStatus.PENDING_PROVIDER,
      PrismaBookingStatus.PENDING_CLIENT,
      PrismaBookingStatus.CONFIRMED,
      PrismaBookingStatus.IN_PROGRESS,
    ];
    const cancelledStatuses = [PrismaBookingStatus.CANCELLED, PrismaBookingStatus.DISPUTED];
    const successPaymentStatuses = [PrismaPaymentStatus.CAPTURED, PrismaPaymentStatus.RELEASED];
    const pendingPaymentStatuses = [
      PrismaPaymentStatus.PENDING,
      PrismaPaymentStatus.REQUIRES_ACTION,
      PrismaPaymentStatus.AUTHORIZED,
      PrismaPaymentStatus.CAPTURE_PENDING,
      PrismaPaymentStatus.HELD,
    ];
    const failedPaymentStatuses = [PrismaPaymentStatus.FAILED, PrismaPaymentStatus.DISPUTED];
    const refundedPaymentStatuses = [PrismaPaymentStatus.REFUNDED];

    const [
      totalBookings,
      upcomingBookings,
      completedBookings,
      cancelledBookings,
      shortNoticeBookings,
      bookingStatusGroup,
      paymentStatusGroup,
      revenueToday,
      revenueWeek,
      revenueMonth,
      averageBasketAgg,
      bookingsChartRecords,
      revenueChartRecords,
      recentRaw,
    ] = await Promise.all([
      this.prisma.booking.count(),
      this.prisma.booking.count({
        where: {
          startAt: { gte: now },
          status: { in: shortNoticeStatuses },
        },
      }),
      this.prisma.booking.count({ where: { status: PrismaBookingStatus.COMPLETED } }),
      this.prisma.booking.count({ where: { status: { in: cancelledStatuses } } }),
      this.prisma.booking.count({ where: { shortNotice: true } }),
      this.prisma.booking.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.payment.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.payment.aggregate({
        _sum: { amountCents: true },
        where: { status: { in: successPaymentStatuses }, occurredAt: { gte: startOfToday, lt: endOfToday } },
      }),
      this.prisma.payment.aggregate({
        _sum: { amountCents: true },
        where: { status: { in: successPaymentStatuses }, occurredAt: { gte: startOfWeek } },
      }),
      this.prisma.payment.aggregate({
        _sum: { amountCents: true },
        where: { status: { in: successPaymentStatuses }, occurredAt: { gte: startOfMonth } },
      }),
      this.prisma.booking.aggregate({
        _sum: { pricingTotalCents: true },
        _count: { _all: true },
      }),
      this.prisma.booking.findMany({
        where: { startAt: { gte: bookingsChartStart } },
        select: { startAt: true },
      }),
      this.prisma.payment.findMany({
        where: { status: { in: successPaymentStatuses }, occurredAt: { gte: revenueChartStart } },
        select: { occurredAt: true, amountCents: true },
      }),
      this.prisma.booking.findMany({
        orderBy: { createdAt: 'desc' },
        take: EmployeeBookingsService.MAX_RECENT_BOOKINGS,
        include: {
          client: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          assignments: {
            orderBy: { createdAt: 'asc' },
            include: {
              provider: { select: { id: true, user: { select: { firstName: true, lastName: true, email: true, phone: true } } } },
            },
          },
          payments: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
    ]);

    const bookingsByDay = this.buildDailyChart(bookingsChartRecords, bookingsChartStart, EmployeeBookingsService.BOOKING_CHART_DAYS);
    const revenueByWeek = this.buildWeeklyRevenueChart(revenueChartRecords, revenueChartStart, EmployeeBookingsService.REVENUE_CHART_WEEKS);
    const recent = recentRaw.map((record) => this.mapListItem(record));
    const shortNoticeRatio = totalBookings > 0 ? Number(((shortNoticeBookings / totalBookings) * 100).toFixed(2)) : 0;

    return {
      totals: {
        all: totalBookings,
        upcoming: upcomingBookings,
        completed: completedBookings,
        cancelled: cancelledBookings,
        shortNotice: shortNoticeBookings,
      },
      shortNoticeRatio,
      statuses: bookingStatusGroup.map((entry) => ({
        status: BookingMapper.toDomainStatus(entry.status),
        count: entry._count._all,
      })),
      paymentStatuses: paymentStatusGroup.map((entry) => ({
        status: entry.status.toLowerCase() as PaymentStatus,
        count: entry._count._all,
      })),
      financials: {
        revenueTodayCents: revenueToday._sum.amountCents ?? 0,
        revenueWeekCents: revenueWeek._sum.amountCents ?? 0,
        revenueMonthCents: revenueMonth._sum.amountCents ?? 0,
        averageBasketCents:
          averageBasketAgg._count._all > 0
            ? Math.round((averageBasketAgg._sum.pricingTotalCents ?? 0) / averageBasketAgg._count._all)
            : 0,
      },
      charts: {
        bookingsByDay,
        revenueByWeek,
      },
      recent,
    };
  }

  async getDetails(id: string): Promise<AdminBookingDetails> {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        assignments: {
          orderBy: { createdAt: 'asc' },
          include: {
            provider: { select: { id: true, user: { select: { firstName: true, lastName: true, email: true, phone: true } } } },
          },
        },
        auditLog: true,
        attachments: true,
        fallbackTeamCandidate: { include: { members: true } },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('BOOKING_NOT_FOUND');
    }

    const domain = BookingMapper.toDomain(booking as BookingWithRelations);
    const listShape = this.mapListItem({
      ...booking,
      payments: booking.payments,
      assignments: booking.assignments,
    } as BookingListRecord);
    const payment = booking.payments[0]
      ? this.mapPayment(booking.payments[0])
      : null;

    return {
      ...listShape,
      address: domain.address,
      billingAddress: domain.billingAddress,
      contact: domain.contact,
      onsiteContact: domain.onsiteContact,
      durationHours: domain.durationHours,
      recommendedHours: domain.recommendedHours,
      frequency: domain.frequency,
      ecoPreference: domain.ecoPreference,
      notes: domain.notes,
      opsNotes: domain.opsNotes,
      providerNotes: domain.providerNotes,
      attachments: domain.attachments,
      auditLog: domain.auditLog,
      fallbackTeamCandidate: domain.fallbackTeamCandidate ?? undefined,
      assignments: booking.assignments.map((assignment) => ({
        id: assignment.id,
        provider: this.mapParty({
          id: assignment.provider.id,
          firstName: assignment.provider.user.firstName,
          lastName: assignment.provider.user.lastName,
          email: assignment.provider.user.email,
          phone: assignment.provider.user.phone,
        }),
        status: assignment.status.toLowerCase(),
        teamId: assignment.teamId ?? null,
        assignedAt: assignment.createdAt.toISOString(),
      })),
      payment,
      pricing: domain.pricing,
    };
  }

  private mapPayment(payment: PrismaPayment): AdminBookingPaymentSummary {
    return {
      id: payment.id,
      status: payment.status.toLowerCase() as PaymentStatus,
      amountCents: payment.amountCents,
      method: payment.method ? (payment.method.toLowerCase() as PaymentMethod) : null,
      occurredAt: payment.occurredAt.toISOString(),
      externalReference: payment.externalReference ?? null,
    };
  }

  private buildWhereClause(filters: AdminBookingsQueryDto): Prisma.BookingWhereInput | undefined {
    const conditions: Prisma.BookingWhereInput[] = [];
    const parseDate = (value?: string) => {
      if (!value) return undefined;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? undefined : date;
    };

    if (filters.statuses?.length) {
      conditions.push({
        status: {
          in: filters.statuses.map((status) => BookingMapper.toPrismaStatus(status)),
        },
      });
    } else if (filters.status) {
      conditions.push({ status: BookingMapper.toPrismaStatus(filters.status) });
    }

    if (filters.mode) {
      conditions.push({ mode: BookingMapper.toPrismaMode(filters.mode) });
    }

    if (typeof filters.fallbackRequested === 'boolean') {
      conditions.push({
        fallbackRequestedAt: filters.fallbackRequested ? { not: null } : { equals: null },
      });
    }

    if (typeof filters.fallbackEscalated === 'boolean') {
      conditions.push({
        fallbackEscalatedAt: filters.fallbackEscalated ? { not: null } : { equals: null },
      });
    }

    if (typeof filters.minRetryCount === 'number') {
      conditions.push({ matchingRetryCount: { gte: filters.minRetryCount } });
    }

    if (filters.service) {
      conditions.push({ service: filters.service });
    }

    if (filters.city) {
      conditions.push({ addressCity: { contains: filters.city, mode: 'insensitive' } });
    }

    if (filters.postalCode) {
      conditions.push({ addressPostalCode: { startsWith: filters.postalCode } });
    }

    const startFrom = parseDate(filters.startFrom);
    if (startFrom) {
      conditions.push({ startAt: { gte: startFrom } });
    }

    const startTo = parseDate(filters.startTo);
    if (startTo) {
      conditions.push({ startAt: { lte: startTo } });
    }

    if (typeof filters.shortNotice === 'boolean') {
      conditions.push({ shortNotice: filters.shortNotice });
    }

    if (typeof filters.hasProvider === 'boolean') {
      conditions.push(filters.hasProvider ? { assignments: { some: {} } } : { assignments: { none: {} } });
    }

    if (filters.clientId) {
      conditions.push({ clientId: filters.clientId });
    }

    if (filters.providerId) {
      conditions.push({ assignments: { some: { providerId: filters.providerId } } });
    }

    if (filters.search) {
      const term = filters.search.trim();
      if (term.length > 0) {
        conditions.push({
          OR: [
            { id: term },
            { client: { email: { contains: term, mode: 'insensitive' } } },
            { client: { firstName: { contains: term, mode: 'insensitive' } } },
            { client: { lastName: { contains: term, mode: 'insensitive' } } },
            { addressCity: { contains: term, mode: 'insensitive' } },
            { addressPostalCode: { startsWith: term } },
          ],
        });
      }
    }

    if (!conditions.length) {
      return undefined;
    }

    return conditions.length === 1 ? conditions[0] : { AND: conditions };
  }

  private mapListItem(booking: BookingListRecord): AdminBookingListItem {
    const paymentStatus = booking.payments[0]?.status
      ? (booking.payments[0]!.status.toLowerCase() as PaymentStatus)
      : null;
    const providerAssignment = booking.assignments[0];

    const clientParty =
      this.mapParty(
        booking.client
          ? {
              id: booking.client.id,
              firstName: booking.client.firstName,
              lastName: booking.client.lastName,
              email: booking.client.email,
              phone: booking.client.phone,
            }
          : null
      ) ?? {
        id: booking.clientId ?? 'unknown',
        name: 'Client inconnu',
        email: booking.client?.email ?? null,
        phone: booking.client?.phone ?? null,
      };

    return {
      id: booking.id,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      status: BookingMapper.toDomainStatus(booking.status),
      mode: BookingMapper.toDomainMode(booking.mode),
      service: booking.service as ServiceCategory,
      city: booking.addressCity,
      postalCode: booking.addressPostalCode,
      shortNotice: booking.shortNotice ?? false,
      matchingRetryCount: booking.matchingRetryCount ?? 0,
      totalCents: booking.pricingTotalCents,
      client: clientParty,
      provider: providerAssignment
        ? this.mapParty({
            id: providerAssignment.provider.id,
            firstName: providerAssignment.provider.user.firstName,
            lastName: providerAssignment.provider.user.lastName,
            email: providerAssignment.provider.user.email,
            phone: providerAssignment.provider.user.phone,
          })
        : null,
      paymentStatus,
    };
  }

  private mapParty(
    party:
      | {
          id: string;
          firstName?: string | null;
          lastName?: string | null;
          email?: string | null;
          phone?: string | null;
        }
      | null
      | undefined
  ): AdminBookingListItem['client'] | null {
    if (!party) {
      return null;
    }
    const fullName = `${party.firstName ?? ''} ${party.lastName ?? ''}`.trim();
    return {
      id: party.id,
      name: fullName.length > 0 ? fullName : party.email ?? '—',
      email: party.email ?? null,
      phone: party.phone ?? null,
    };
  }

  private startOfDay(date: Date) {
    const clone = new Date(date);
    clone.setHours(0, 0, 0, 0);
    return clone;
  }

  private startOfWeek(date: Date) {
    const clone = this.startOfDay(date);
    const day = clone.getDay();
    const diff = (day + 6) % 7;
    clone.setDate(clone.getDate() - diff);
    return clone;
  }

  private addDays(date: Date, amount: number) {
    const clone = new Date(date);
    clone.setDate(clone.getDate() + amount);
    return clone;
  }

  private buildDailyChart(records: Array<{ startAt: Date }>, start: Date, days: number) {
    const map = new Map<string, number>();
    for (let i = 0; i < days; i += 1) {
      const key = this.addDays(start, i).toISOString().split('T')[0]!;
      map.set(key, 0);
    }
    for (const record of records) {
      const key = this.startOfDay(record.startAt).toISOString().split('T')[0]!;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].map(([date, total]) => ({ date, total }));
  }

  private buildWeeklyRevenueChart(records: Array<{ occurredAt: Date; amountCents: number }>, start: Date, weeks: number) {
    const map = new Map<string, number>();
    for (let i = 0; i < weeks; i += 1) {
      const weekStart = this.addDays(start, i * 7);
      const key = `${weekStart.getFullYear()}-W${this.getWeekNumber(weekStart)}`;
      map.set(key, 0);
    }
    for (const record of records) {
      const weekStart = this.startOfWeek(record.occurredAt);
      const key = `${weekStart.getFullYear()}-W${this.getWeekNumber(weekStart)}`;
      map.set(key, (map.get(key) ?? 0) + record.amountCents);
    }
    return [...map.entries()].map(([week, totalCents]) => ({ week, totalCents }));
  }

  private getWeekNumber(date: Date) {
    const firstThursday = new Date(date.getFullYear(), 0, 4);
    const weekStart = this.startOfWeek(date);
    const diff = weekStart.getTime() - this.startOfWeek(firstThursday).getTime();
    return Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
  }
}
