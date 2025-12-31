import { Injectable } from '@nestjs/common';
import {
  Prisma,
  BookingStatus as PrismaBookingStatus,
  PaymentStatus as PrismaPaymentStatus,
  SupportStatus as PrismaSupportStatus,
} from '@prisma/client';
import type {
  AdminAnalyticsCohortResponse,
  AdminAnalyticsFunnelResponse,
  AdminAnalyticsOpsResponse,
  AdminAnalyticsOverviewResponse,
  AdminAnalyticsZonesResponse,
} from '@saubio/models';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AnalyticsCohortQueryDto,
  AnalyticsFunnelQueryDto,
  AnalyticsOpsQueryDto,
  AnalyticsRangeQueryDto,
  AnalyticsZonesQueryDto,
} from './dto/admin-analytics.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const SUCCESS_PAYMENT_STATUSES = [PrismaPaymentStatus.CAPTURED, PrismaPaymentStatus.RELEASED];
const PENDING_PAYMENT_STATUSES = [
  PrismaPaymentStatus.PENDING,
  PrismaPaymentStatus.REQUIRES_ACTION,
  PrismaPaymentStatus.AUTHORIZED,
  PrismaPaymentStatus.CAPTURE_PENDING,
  PrismaPaymentStatus.HELD,
];
const RESOLVED_TICKET_STATUSES = new Set<PrismaSupportStatus>([
  PrismaSupportStatus.RESOLVED,
  PrismaSupportStatus.CLOSED,
]);
const CANCELLATION_REASONS = ['client_cancelled', 'provider_cancelled', 'admin_cancelled'];
const CONFIRMED_BOOKING_STATUSES = new Set<PrismaBookingStatus>([
  PrismaBookingStatus.CONFIRMED,
  PrismaBookingStatus.IN_PROGRESS,
  PrismaBookingStatus.COMPLETED,
]);

@Injectable()
export class EmployeeAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(query: AnalyticsRangeQueryDto): Promise<AdminAnalyticsOverviewResponse> {
    const range = this.resolveRange(query);
    const bookingFilter = this.buildBookingFilter(query);
    const bookingEventFilter: Prisma.BookingWhereInput = {
      ...bookingFilter,
      OR: [
        { createdAt: { gte: range.from, lte: range.to } },
        { endAt: { gte: range.from, lte: range.to } },
        { updatedAt: { gte: range.from, lte: range.to } },
      ],
    };

    const [bookings, payments, clientSignups, providerActivations, cancellationAudits] =
      await this.prisma.$transaction([
        this.prisma.booking.findMany({
          where: bookingEventFilter,
          select: {
            id: true,
            createdAt: true,
            updatedAt: true,
            endAt: true,
            startAt: true,
            status: true,
            mode: true,
            shortNotice: true,
            pricingTotalCents: true,
          },
        }),
        this.prisma.payment.findMany({
          where: {
            status: { in: SUCCESS_PAYMENT_STATUSES },
            occurredAt: { gte: range.from, lte: range.to },
            booking: bookingFilter,
          },
          select: {
            amountCents: true,
            platformFeeCents: true,
            occurredAt: true,
            bookingId: true,
          },
        }),
        this.prisma.clientProfile.count({
          where: { createdAt: { gte: range.from, lte: range.to } },
        }),
        this.prisma.providerProfile.findMany({
          where: {
            onboardingStatus: 'ready',
            OR: [
              { profileCompletedAt: { gte: range.from, lte: range.to } },
              { profileCompletedAt: null, createdAt: { gte: range.from, lte: range.to } },
            ],
          },
          select: {
            id: true,
            createdAt: true,
            profileCompletedAt: true,
            identityCompletedAt: true,
          },
        }),
        this.prisma.bookingAudit.findMany({
          where: {
            action: 'status_changed',
            createdAt: { gte: range.from, lte: range.to },
            booking: bookingFilter,
            OR: CANCELLATION_REASONS.map((reason) => ({
              metadata: {
                path: ['reason'],
                equals: reason,
              },
            })),
          },
          select: { metadata: true },
        }),
      ]);

    const bookingsCreated = bookings.filter((booking) => this.isWithin(booking.createdAt, range));
    const bookingsCompleted = bookings.filter(
      (booking) => booking.status === PrismaBookingStatus.COMPLETED && booking.endAt && this.isWithin(booking.endAt, range)
    );
    const bookingsCancelled = bookings.filter(
      (booking) => booking.status === PrismaBookingStatus.CANCELLED && this.isWithin(booking.updatedAt ?? booking.createdAt, range)
    );
    const bookingsConfirmed = bookingsCreated.filter((booking) =>
      CONFIRMED_BOOKING_STATUSES.has(booking.status as PrismaBookingStatus)
    );

    const smartMatchCount = bookingsCreated.filter((booking) => booking.mode === 'SMART_MATCH').length;
    const shortNoticeCount = bookingsCreated.filter((booking) => booking.shortNotice).length;

    const paymentGross = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
    const paymentFees = payments.reduce((sum, payment) => sum + payment.platformFeeCents, 0);
    const paymentSuccessCount = payments.length;

    const bookingTrend = this.generateDateBuckets(range).map((date) => ({
      date,
      created: bookingsCreated.filter((booking) => this.dateKey(booking.createdAt) === date).length,
      completed: bookingsCompleted.filter((booking) => booking.endAt && this.dateKey(booking.endAt) === date).length,
      cancelled: bookingsCancelled.filter(
        (booking) => this.dateKey(booking.updatedAt ?? booking.createdAt) === date
      ).length,
    }));

    const revenueTrend = this.generateDateBuckets(range).map((date) => ({
      date,
      grossCents: payments
        .filter((payment) => this.dateKey(payment.occurredAt) === date)
        .reduce((sum, payment) => sum + payment.amountCents, 0),
      commissionCents: payments
        .filter((payment) => this.dateKey(payment.occurredAt) === date)
        .reduce((sum, payment) => sum + payment.platformFeeCents, 0),
    }));

    const providerTrend = this.generateDateBuckets(range).map((date) => ({
      date,
      activated: providerActivations.filter((provider) => this.dateKey(this.getProviderActivationDate(provider)) === date).length,
    }));

    const cancellationSummary = this.countCancellations(cancellationAudits);
    const overview: AdminAnalyticsOverviewResponse = {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      bookings: {
        created: bookingsCreated.length,
        paid: paymentSuccessCount,
        confirmed: bookingsConfirmed.length,
        completed: bookingsCompleted.length,
        cancelled: bookingsCancelled.length,
        cancellationRate: {
          overall: bookingsCreated.length
            ? Number((bookingsCancelled.length / bookingsCreated.length).toFixed(4))
            : 0,
          client: bookingsCreated.length ? Number((cancellationSummary.client / bookingsCreated.length).toFixed(4)) : 0,
          provider: bookingsCreated.length ? Number((cancellationSummary.provider / bookingsCreated.length).toFixed(4)) : 0,
        },
        smartMatchShare: bookingsCreated.length ? Number((smartMatchCount / bookingsCreated.length).toFixed(4)) : 0,
        shortNoticeShare: bookingsCreated.length ? Number((shortNoticeCount / bookingsCreated.length).toFixed(4)) : 0,
      },
      payments: {
        grossCents: paymentGross,
        commissionCents: paymentFees,
        averageOrderValueCents: paymentSuccessCount ? Math.round(paymentGross / paymentSuccessCount) : null,
      },
      customers: {
        newClients: clientSignups,
        newProviders: providerActivations.length,
      },
      trends: {
        bookings: bookingTrend,
        revenue: revenueTrend,
        providers: providerTrend,
      },
    };

    return overview;
  }

  async getFunnel(query: AnalyticsFunnelQueryDto): Promise<AdminAnalyticsFunnelResponse> {
    const range = this.resolveRange(query);
    const bookingFilter = this.buildBookingFilter(query);
    const [leads, drafts, pending, paymentsInitiated, paymentsCaptured, assignments, completed] = await this.prisma.$transaction([
      this.prisma.postalFollowUpRequest.count({
        where: {
          createdAt: { gte: range.from, lte: range.to },
          ...(query.city
            ? { normalizedCity: { equals: query.city, mode: 'insensitive' as Prisma.QueryMode } }
            : {}),
        },
      }),
      this.prisma.booking.count({
        where: {
          ...bookingFilter,
          createdAt: { gte: range.from, lte: range.to },
          status: PrismaBookingStatus.DRAFT,
        },
      }),
      this.prisma.booking.count({
        where: {
          ...bookingFilter,
          createdAt: { gte: range.from, lte: range.to },
          status: { in: [PrismaBookingStatus.PENDING_CLIENT, PrismaBookingStatus.PENDING_PROVIDER] },
        },
      }),
      this.prisma.payment.count({
        where: {
          createdAt: { gte: range.from, lte: range.to },
          status: { in: [...SUCCESS_PAYMENT_STATUSES, ...PENDING_PAYMENT_STATUSES] },
          booking: bookingFilter,
        },
      }),
      this.prisma.payment.count({
        where: {
          occurredAt: { gte: range.from, lte: range.to },
          status: { in: SUCCESS_PAYMENT_STATUSES },
          booking: bookingFilter,
        },
      }),
      this.prisma.bookingAssignment.findMany({
        where: {
          createdAt: { gte: range.from, lte: range.to },
          booking: bookingFilter,
        },
        select: { bookingId: true },
        distinct: ['bookingId'],
      }),
      this.prisma.booking.count({
        where: {
          ...bookingFilter,
          endAt: { gte: range.from, lte: range.to },
          status: PrismaBookingStatus.COMPLETED,
        },
      }),
    ]);

    const stages = [
      { id: 'leads', label: 'Codes postaux validés', value: leads },
      { id: 'drafts', label: 'Formulaire rempli', value: drafts },
      { id: 'pending', label: 'Demandes en attente', value: pending },
      { id: 'payments_started', label: 'Paiements initiés', value: paymentsInitiated },
      { id: 'payments_captured', label: 'Paiements réussis', value: paymentsCaptured },
      { id: 'matched', label: 'Prestataire assigné', value: assignments.length },
      { id: 'completed', label: 'Missions complétées', value: completed },
    ].map((stage, index, array) => ({
      ...stage,
      conversionRate:
        index === 0 || array[index - 1].value === 0
          ? null
          : Number((stage.value / array[index - 1].value).toFixed(4)),
    }));

    return { range: { from: range.from.toISOString(), to: range.to.toISOString() }, steps: stages };
  }

  async getCohorts(query: AnalyticsCohortQueryDto): Promise<AdminAnalyticsCohortResponse> {
    const range = this.resolveRange(query);
    const type = query.type ?? 'client';
    if (type === 'provider') {
      return this.computeProviderCohorts(range);
    }
    return this.computeClientCohorts(range);
  }

  async getZonePerformance(query: AnalyticsZonesQueryDto): Promise<AdminAnalyticsZonesResponse> {
    const range = this.resolveRange(query);
    const bookingFilter = this.buildBookingFilter(query);
    const bookings = await this.prisma.booking.findMany({
      where: {
        ...bookingFilter,
        startAt: { gte: range.from, lte: range.to },
      },
      select: {
        id: true,
        addressCity: true,
        addressPostalCode: true,
        pricingTotalCents: true,
        status: true,
        createdAt: true,
      },
    });
    const bookingIds = bookings.map((booking) => booking.id);
    const assignmentsPromise = bookingIds.length
      ? this.prisma.bookingAssignment.findMany({
          where: { bookingId: { in: bookingIds } },
          select: { bookingId: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve<{ bookingId: string; createdAt: Date }[]>([]);
    const providersPromise = this.prisma.providerProfile.findMany({
      where: { addressCity: { not: null }, user: { isActive: true } },
      select: { addressCity: true },
    });
    const [assignments, providers] = await Promise.all([assignmentsPromise, providersPromise]);

    const zoneMap = new Map<
      string,
      {
        demand: number;
        providerCount: number;
        prices: number[];
        matches: number;
        totalDelayMinutes: number;
      }
    >();

    const providerByCity = providers.reduce<Record<string, number>>((acc, provider) => {
      if (!provider.addressCity) return acc;
      const key = provider.addressCity.toLowerCase();
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    const assignmentMap = new Map<string, Date>();
    assignments.forEach((assignment) => {
      if (!assignmentMap.has(assignment.bookingId)) {
        assignmentMap.set(assignment.bookingId, assignment.createdAt);
      }
    });

    bookings.forEach((booking) => {
      const cityKey = (booking.addressCity ?? 'Autre').toLowerCase();
      const mapKey = `${cityKey}::${booking.addressPostalCode ?? '00000'}`;
      const entry = zoneMap.get(mapKey) ?? {
        demand: 0,
        providerCount: providerByCity[cityKey] ?? 0,
        prices: [] as number[],
        matches: 0,
        totalDelayMinutes: 0,
      };
      entry.demand += 1;
      entry.prices.push(booking.pricingTotalCents);
      const assignedAt = assignmentMap.get(booking.id);
      if (assignedAt) {
        entry.matches += 1;
        entry.totalDelayMinutes += Math.max(
          0,
          Math.round((assignedAt.getTime() - booking.createdAt.getTime()) / 60000)
        );
      }
      zoneMap.set(mapKey, entry);
    });

    const rows = Array.from(zoneMap.entries()).map(([key, entry]) => {
      const [cityKey, postalCode] = key.split('::');
      return {
        city: cityKey.charAt(0).toUpperCase() + cityKey.slice(1),
        postalCode: postalCode === '00000' ? null : postalCode,
        demand: entry.demand,
        providerCount: entry.providerCount,
        matchRate: entry.demand ? Number((entry.matches / entry.demand).toFixed(4)) : 0,
        avgMatchDelayMinutes: entry.matches ? Math.round(entry.totalDelayMinutes / entry.matches) : null,
        priceMinCents: entry.prices.length ? Math.min(...entry.prices) : 0,
        priceAvgCents: entry.prices.length ? Math.round(entry.prices.reduce((a, b) => a + b, 0) / entry.prices.length) : 0,
        priceMaxCents: entry.prices.length ? Math.max(...entry.prices) : 0,
        tensionIndex:
          entry.providerCount === 0
            ? entry.demand
            : Number((entry.demand / Math.max(entry.providerCount, 1)).toFixed(2)),
      };
    });

    const topCities = Object.entries(
      rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.city] = (acc[row.city] ?? 0) + row.demand;
        return acc;
      }, {})
    )
      .map(([city, demand]) => ({ city, demand }))
      .sort((a, b) => b.demand - a.demand)
      .slice(0, 10);

    return { range: { from: range.from.toISOString(), to: range.to.toISOString() }, rows, topCities };
  }

  async getOperations(query: AnalyticsOpsQueryDto): Promise<AdminAnalyticsOpsResponse> {
    const range = this.resolveRange(query);
    const bookingFilter = this.buildBookingFilter(query);
    const [cancellationAudits, disputes, tickets, invitations, reviews] = await this.prisma.$transaction([
      this.prisma.bookingAudit.findMany({
        where: {
          action: 'status_changed',
          createdAt: { gte: range.from, lte: range.to },
          booking: bookingFilter,
          OR: CANCELLATION_REASONS.map((reason) => ({
            metadata: {
              path: ['reason'],
              equals: reason,
            },
          })),
        },
        select: { createdAt: true, metadata: true },
      }),
      this.prisma.dispute.findMany({
        where: {
          createdAt: { gte: range.from, lte: range.to },
          booking: bookingFilter,
        },
        select: {
          id: true,
          status: true,
          refundAmountCents: true,
          resolvedAt: true,
          createdAt: true,
        },
      }),
      this.prisma.supportTicket.findMany({
        where: {
          createdAt: { gte: range.from, lte: range.to },
        },
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          status: true,
        },
      }),
      this.prisma.bookingInvitation.findMany({
        where: {
          createdAt: { gte: range.from, lte: range.to },
          booking: { ...bookingFilter, mode: 'SMART_MATCH' },
        },
        select: {
          respondedAt: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.review.aggregate({
        where: {
          createdAt: { gte: range.from, lte: range.to },
          booking: bookingFilter,
        },
        _avg: { score: true },
        _count: { _all: true },
      }),
    ]);

    const cancellationSummary = this.countCancellations(cancellationAudits);
    const cancellationTrend = this.generateDateBuckets(range).map((date) => ({
      date,
      total: cancellationAudits.filter((audit) => this.dateKey(audit.createdAt) === date).length,
    }));

    const disputesOpened = disputes.length;
    const disputesResolved = disputes.filter(
      (dispute) => dispute.resolvedAt && this.isWithin(dispute.resolvedAt, range)
    ).length;
    const refundCents = disputes.reduce((sum, dispute) => sum + (dispute.refundAmountCents ?? 0), 0);

    const ticketsOpened = tickets.length;
    const resolvedTickets = tickets.filter((ticket) =>
      RESOLVED_TICKET_STATUSES.has(ticket.status as PrismaSupportStatus)
    );
    const avgResolutionHours =
      resolvedTickets.length > 0
        ? Number(
            (
              resolvedTickets.reduce((sum, ticket) => sum + (ticket.updatedAt.getTime() - ticket.createdAt.getTime()), 0) /
              resolvedTickets.length /
              3600000
            ).toFixed(2)
          )
        : null;

    const invitationCount = invitations.length;
    const acceptedInvitations = invitations.filter((invite) => invite.status === 'ACCEPTED');
    const respondedInvitations = invitations.filter((invite) => invite.respondedAt);
    const avgResponseMinutes =
      respondedInvitations.length > 0
        ? Math.round(
            respondedInvitations.reduce((sum, invite) => sum + (invite.respondedAt!.getTime() - invite.createdAt.getTime()), 0) /
              respondedInvitations.length /
              60000
          )
        : null;

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      cancellations: {
        total: cancellationAudits.length,
        client: cancellationSummary.client,
        provider: cancellationSummary.provider,
        admin: cancellationSummary.admin,
        trend: cancellationTrend,
      },
      disputes: {
        opened: disputesOpened,
        resolved: disputesResolved,
        refundCents,
      },
      support: {
        ticketsOpened,
        ticketsResolved: resolvedTickets.length,
        avgResolutionHours,
      },
      smartMatch: {
        invitations: invitationCount,
        acceptanceRate: invitationCount ? Number((acceptedInvitations.length / invitationCount).toFixed(4)) : 0,
        avgResponseMinutes,
      },
      quality: {
        averageRating: reviews._avg.score ? Number(reviews._avg.score.toFixed(2)) : null,
        incidentCount: disputesOpened,
      },
    };
  }

  private async computeClientCohorts(range: { from: Date; to: Date }): Promise<AdminAnalyticsCohortResponse> {
    const clients = await this.prisma.clientProfile.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      select: { id: true, userId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!clients.length) {
      return {
        type: 'client',
        range: { from: range.from.toISOString(), to: range.to.toISOString() },
        cohorts: [],
      };
    }
    const clientIds = clients.map((client) => client.userId);
    const bookingRecords = await this.prisma.booking.findMany({
      where: {
        clientId: { in: clientIds },
        createdAt: { gte: range.from, lte: new Date(range.to.getTime() + 90 * DAY_MS) },
      },
      select: { clientId: true, createdAt: true },
    });

    const bookingsByClient = bookingRecords.reduce<Record<string, Date[]>>((acc, booking) => {
      if (!booking.clientId) return acc;
      acc[booking.clientId] = acc[booking.clientId] ?? [];
      acc[booking.clientId].push(booking.createdAt);
      return acc;
    }, {});

    const cohortsMap = new Map<
      string,
      { start: Date; members: { clientId: string; createdAt: Date }[] }
    >();
    clients.forEach((client) => {
      const bucket = this.startOfISOWeek(client.createdAt);
      const key = this.dateKey(bucket);
      const entry = cohortsMap.get(key) ?? { start: bucket, members: [] };
      entry.members.push({ clientId: client.userId, createdAt: client.createdAt });
      cohortsMap.set(key, entry);
    });

    const cohorts = Array.from(cohortsMap.entries())
      .sort(([a], [b]) => (a > b ? 1 : -1))
      .map(([key, data]) => {
        const size = data.members.length;
        const retention = { seven: 0, thirty: 0, ninety: 0 };
        data.members.forEach((member) => {
          const purchases = bookingsByClient[member.clientId] ?? [];
          if (purchases.some((date) => date.getTime() - member.createdAt.getTime() <= 7 * DAY_MS)) {
            retention.seven += 1;
          }
          if (purchases.some((date) => date.getTime() - member.createdAt.getTime() <= 30 * DAY_MS)) {
            retention.thirty += 1;
          }
          if (purchases.some((date) => date.getTime() - member.createdAt.getTime() <= 90 * DAY_MS)) {
            retention.ninety += 1;
          }
        });
        return {
          cohort: key,
          cohortStart: data.start.toISOString(),
          size,
          retention7: size ? Number((retention.seven / size).toFixed(4)) : 0,
          retention30: size ? Number((retention.thirty / size).toFixed(4)) : 0,
          retention90: size ? Number((retention.ninety / size).toFixed(4)) : 0,
        };
      });

    return { type: 'client', range: { from: range.from.toISOString(), to: range.to.toISOString() }, cohorts };
  }

  private async computeProviderCohorts(range: { from: Date; to: Date }): Promise<AdminAnalyticsCohortResponse> {
    const providers = await this.prisma.providerProfile.findMany({
      where: {
        onboardingStatus: 'ready',
        OR: [
          { profileCompletedAt: { gte: range.from, lte: range.to } },
          { profileCompletedAt: null, createdAt: { gte: range.from, lte: range.to } },
        ],
      },
      select: {
        id: true,
        createdAt: true,
        profileCompletedAt: true,
        identityCompletedAt: true,
        userId: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!providers.length) {
      return {
        type: 'provider',
        range: { from: range.from.toISOString(), to: range.to.toISOString() },
        cohorts: [],
      };
    }
    const providerIds = providers.map((provider) => provider.id);
    const assignmentRecords = await this.prisma.bookingAssignment.findMany({
      where: {
        providerId: { in: providerIds },
        booking: {
          status: { in: [PrismaBookingStatus.CONFIRMED, PrismaBookingStatus.IN_PROGRESS, PrismaBookingStatus.COMPLETED] },
          startAt: { gte: range.from, lte: new Date(range.to.getTime() + 90 * DAY_MS) },
        },
      },
      select: {
        providerId: true,
        booking: { select: { startAt: true } },
      },
    });
    const assignmentsByProvider = assignmentRecords.reduce<Record<string, Date[]>>((acc, record) => {
      if (!record.booking?.startAt) return acc;
      acc[record.providerId] = acc[record.providerId] ?? [];
      acc[record.providerId].push(record.booking.startAt);
      return acc;
    }, {});

    const cohortsMap = new Map<
      string,
      { start: Date; members: { providerId: string; activation: Date }[] }
    >();
    providers.forEach((provider) => {
      const activation = this.getProviderActivationDate(provider);
      const bucket = this.startOfISOWeek(activation);
      const key = this.dateKey(bucket);
      const entry = cohortsMap.get(key) ?? { start: bucket, members: [] };
      entry.members.push({ providerId: provider.id, activation });
      cohortsMap.set(key, entry);
    });

    const cohorts = Array.from(cohortsMap.entries())
      .sort(([a], [b]) => (a > b ? 1 : -1))
      .map(([key, data]) => {
        const size = data.members.length;
        const progression = { seven: 0, thirty: 0, ninety: 0 };
        data.members.forEach((member) => {
          const missions = assignmentsByProvider[member.providerId] ?? [];
          if (missions.some((date) => date.getTime() - member.activation.getTime() <= 7 * DAY_MS)) {
            progression.seven += 1;
          }
          if (missions.some((date) => date.getTime() - member.activation.getTime() <= 30 * DAY_MS)) {
            progression.thirty += 1;
          }
          if (missions.some((date) => date.getTime() - member.activation.getTime() <= 90 * DAY_MS)) {
            progression.ninety += 1;
          }
        });
        return {
          cohort: key,
          cohortStart: data.start.toISOString(),
          size,
          retention7: size ? Number((progression.seven / size).toFixed(4)) : 0,
          retention30: size ? Number((progression.thirty / size).toFixed(4)) : 0,
          retention90: size ? Number((progression.ninety / size).toFixed(4)) : 0,
        };
      });

    return { type: 'provider', range: { from: range.from.toISOString(), to: range.to.toISOString() }, cohorts };
  }

  private countCancellations(audits: Array<{ metadata: Prisma.JsonValue }>) {
    const summary = { client: 0, provider: 0, admin: 0 };
    audits.forEach((audit) => {
      const reason = this.extractReason(audit.metadata);
      if (reason === 'provider_cancelled') {
        summary.provider += 1;
      } else if (reason === 'admin_cancelled') {
        summary.admin += 1;
      } else {
        summary.client += 1;
      }
    });
    return summary;
  }

  private extractReason(metadata: Prisma.JsonValue): string | null {
    if (!metadata || typeof metadata !== 'object') {
      return null;
    }
    if ('reason' in metadata && typeof metadata.reason === 'string') {
      return metadata.reason;
    }
    return null;
  }

  private resolveRange(query: AnalyticsRangeQueryDto) {
    const now = new Date();
    const to = query.to ? new Date(query.to) : now;
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * DAY_MS);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return { from: new Date(now.getTime() - 30 * DAY_MS), to: now };
    }
    if (from > to) {
      return { from: new Date(to.getTime() - 7 * DAY_MS), to };
    }
    return { from, to };
  }

  private buildBookingFilter(query: AnalyticsRangeQueryDto): Prisma.BookingWhereInput {
    const filter: Prisma.BookingWhereInput = {};
    if (query.service) {
      filter.service = { equals: query.service, mode: Prisma.QueryMode.insensitive };
    }
    if (query.city) {
      filter.addressCity = { equals: query.city, mode: Prisma.QueryMode.insensitive };
    }
    return filter;
  }

  private generateDateBuckets(range: { from: Date; to: Date }) {
    const buckets: string[] = [];
    const cursor = new Date(range.from);
    while (cursor <= range.to) {
      buckets.push(this.dateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return buckets;
  }

  private dateKey(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private isWithin(date: Date, range: { from: Date; to: Date }) {
    return date >= range.from && date <= range.to;
  }

  private startOfISOWeek(date: Date) {
    const clone = new Date(date);
    const day = clone.getUTCDay() || 7;
    if (day !== 1) {
      clone.setUTCDate(clone.getUTCDate() - day + 1);
    }
    clone.setUTCHours(0, 0, 0, 0);
    return clone;
  }

  private getProviderActivationDate(provider: {
    profileCompletedAt: Date | null;
    identityCompletedAt: Date | null;
    createdAt: Date;
  }) {
    return provider.profileCompletedAt ?? provider.identityCompletedAt ?? provider.createdAt;
  }
}
