import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BookingInvitationStatus as PrismaInvitationStatus,
  BookingMode as PrismaBookingMode,
  BookingStatus as PrismaBookingStatus,
} from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type {
  AdminBookingListItem,
  AdminBookingParty,
  AdminMatchingCandidate,
  AdminPaginatedResponse,
  AdminSmartMatchingConfig,
  AdminSmartMatchingDetail,
  AdminSmartMatchingGuardrail,
  AdminSmartMatchingGuardrailResponse,
  AdminSmartMatchingHistoryItem,
  AdminSmartMatchingInvitationDetail,
  AdminSmartMatchingInvitationSummary,
  AdminSmartMatchingOverviewResponse,
  AdminSmartMatchingPolicy,
  AdminSmartMatchingPolicyResponse,
  AdminSmartMatchingScenario,
  AdminSmartMatchingScenarioResponse,
  AdminSmartMatchingSimulationResponse,
  AdminSmartMatchingTimelineEvent,
  BookingInvitationStatus as DomainInvitationStatus,
  BookingStatus as DomainBookingStatus,
  EcoPreference,
  ProviderType,
  ServiceCategory,
} from '@saubio/models';
import { SERVICE_CATALOG } from '@saubio/models';
import { BookingMatchingService } from '../bookings/booking-matching.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DateTime } from 'luxon';
import type { SmartMatchingHistoryQueryDto, SmartMatchingRangeQueryDto, SmartMatchingSimulationDto } from './dto/smart-matching.dto';
import { SmartMatchingConfigDto } from './dto/smart-matching.dto';
import { PostalCodeService } from '../geocoding/postal-code.service';

const DEFAULT_RANGE_DAYS = 30;
const ACTIVE_MATCHING_STATUSES: PrismaBookingStatus[] = [
  PrismaBookingStatus.PENDING_PROVIDER,
  PrismaBookingStatus.PENDING_CLIENT,
  PrismaBookingStatus.CONFIRMED,
  PrismaBookingStatus.IN_PROGRESS,
];

@Injectable()
export class EmployeeSmartMatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: BookingMatchingService,
    private readonly postalCodes: PostalCodeService
  ) {}

  async getOverview(query: SmartMatchingRangeQueryDto): Promise<AdminSmartMatchingOverviewResponse> {
    const { from, to } = this.resolveRange(query);
    const bookings = await this.prisma.booking.findMany({
      where: {
        mode: PrismaBookingMode.SMART_MATCH,
        createdAt: { gte: from.toJSDate(), lte: to.toJSDate() },
      },
      select: {
        id: true,
        createdAt: true,
        startAt: true,
        status: true,
        shortNotice: true,
        requiredProviders: true,
        invitations: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            respondedAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        assignments: {
          select: {
            id: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    const totalMatches = bookings.length;
    const successfulMatches = bookings.filter((booking) => booking.assignments.length > 0).length;
    const pendingMatches = bookings.filter(
      (booking) =>
        booking.assignments.length === 0 && ACTIVE_MATCHING_STATUSES.includes(booking.status as PrismaBookingStatus)
    ).length;
    const successRate = totalMatches ? successfulMatches / totalMatches : 0;

    let totalProvidersContacted = 0;
    let totalFirstResponseMinutes = 0;
    let firstResponseSamples = 0;
    let totalAssignmentMinutes = 0;
    let assignmentSamples = 0;

    const matchesByDay = new Map<string, { total: number; successful: number }>();
    const responsesByStatus = new Map<string, number>();

    for (const booking of bookings) {
      const dayKey = DateTime.fromJSDate(booking.createdAt).toISODate()!;
      const entry = matchesByDay.get(dayKey) ?? { total: 0, successful: 0 };
      entry.total += 1;
      if (booking.assignments.length) {
        entry.successful += 1;
      }
      matchesByDay.set(dayKey, entry);

      totalProvidersContacted += booking.invitations.length;

      const invitationsSorted = booking.invitations;
      if (invitationsSorted.length) {
        const firstInviteAt = DateTime.fromJSDate(invitationsSorted[0].createdAt);
        const firstResponse = invitationsSorted
          .filter((invite) => !!invite.respondedAt)
          .sort((a, b) => a.respondedAt!.getTime() - b.respondedAt!.getTime())[0];
        if (firstResponse?.respondedAt) {
          const diff = DateTime.fromJSDate(firstResponse.respondedAt).diff(firstInviteAt, 'minutes').minutes;
          if (isFinite(diff)) {
            totalFirstResponseMinutes += diff;
            firstResponseSamples += 1;
          }
        }
      }

      if (booking.assignments.length && booking.invitations.length) {
        const firstAssignmentAt = DateTime.fromJSDate(booking.assignments[0].createdAt);
        const firstInviteAt = DateTime.fromJSDate(booking.invitations[0].createdAt);
        const diff = firstAssignmentAt.diff(firstInviteAt, 'minutes').minutes;
        if (isFinite(diff)) {
          totalAssignmentMinutes += diff;
          assignmentSamples += 1;
        }
      }

      for (const invite of booking.invitations) {
        const statusKey = invite.status.toLowerCase();
        responsesByStatus.set(statusKey, (responsesByStatus.get(statusKey) ?? 0) + 1);
      }
    }

    const overview: AdminSmartMatchingOverviewResponse = {
      generatedAt: new Date().toISOString(),
      stats: {
        period: { from: from.toISO()!, to: to.toISO()! },
        totalMatches,
        successfulMatches,
        pendingMatches,
        successRate,
        avgProvidersContacted: totalMatches ? totalProvidersContacted / totalMatches : 0,
        avgFirstResponseMinutes: firstResponseSamples ? totalFirstResponseMinutes / firstResponseSamples : null,
        avgAssignmentMinutes: assignmentSamples ? totalAssignmentMinutes / assignmentSamples : null,
      },
      charts: {
        matchesByDay: Array.from(matchesByDay.entries())
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([date, data]) => ({ date, total: data.total, successful: data.successful })),
        responsesByStatus: Array.from(responsesByStatus.entries()).map(([status, value]) => ({
          status: status as DomainInvitationStatus | 'pending',
          value,
        })),
      },
      notes: totalMatches === 0 ? ['Aucune donnée Smart Match sur la période sélectionnée.'] : [],
    };

    return overview;
  }

  async listHistory(
    query: SmartMatchingHistoryQueryDto
  ): Promise<AdminPaginatedResponse<AdminSmartMatchingHistoryItem>> {
    const { from, to } = this.resolveRange(query);
    const page = Math.max(Number(query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 25, 1), 100);

    const where: Prisma.BookingWhereInput = {
      mode: PrismaBookingMode.SMART_MATCH,
      createdAt: { gte: from.toJSDate(), lte: to.toJSDate() },
    };

    if (query.service) {
      where.service = query.service;
    }
    if (query.postalCode) {
      where.addressPostalCode = { startsWith: query.postalCode };
    }
    if (query.result === 'assigned') {
      where.assignments = { some: {} };
    } else if (query.result === 'unassigned') {
      where.assignments = { none: {} };
    }
    if (query.invitationStatus) {
      where.invitations = { some: { status: query.invitationStatus.toUpperCase() as PrismaInvitationStatus } };
    }
    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { id: term },
        { client: { email: { contains: term, mode: 'insensitive' } } },
        { client: { firstName: { contains: term, mode: 'insensitive' } } },
        { client: { lastName: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [total, bookings] = await Promise.all([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          client: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        invitations: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            respondedAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
          assignments: {
            include: {
              provider: {
                select: {
                  id: true,
                  user: { select: { firstName: true, lastName: true, email: true, phone: true } },
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
    ]);

    const items: AdminSmartMatchingHistoryItem[] = bookings.map((booking) => {
      const invitationSummary = this.buildInvitationSummary(booking.invitations);
      const providerAssignment = booking.assignments[0];
      return {
        bookingId: booking.id,
        createdAt: booking.createdAt.toISOString(),
        startAt: booking.startAt.toISOString(),
        service: booking.service as ServiceCategory,
        city: booking.addressCity,
        postalCode: booking.addressPostalCode,
        status: booking.status.toLowerCase() as DomainBookingStatus,
        result: providerAssignment ? 'assigned' : 'unassigned',
        provider: providerAssignment ? this.mapParty(providerAssignment.provider.user, providerAssignment.provider.id) : null,
        invitations: invitationSummary,
        requestedProviders: booking.requiredProviders,
        shortNotice: booking.shortNotice,
        client: booking.client ? this.mapParty(booking.client, booking.client.id) : null,
        lastInvitationAt: booking.invitations.length ? booking.invitations[booking.invitations.length - 1].createdAt.toISOString() : null,
      };
    });

    return {
      items,
      page,
      pageSize,
      total,
    };
  }

  async getHistoryDetail(bookingId: string): Promise<AdminSmartMatchingDetail> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        invitations: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            respondedAt: true,
            viewedAt: true,
            metadata: true,
            provider: {
              select: {
                id: true,
                user: { select: { firstName: true, lastName: true, email: true, phone: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        assignments: {
          include: {
            provider: {
              select: {
                id: true,
                user: { select: { firstName: true, lastName: true, email: true, phone: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('BOOKING_NOT_FOUND');
    }

    const bookingItem: AdminBookingListItem = {
      id: booking.id,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      status: booking.status.toLowerCase() as DomainBookingStatus,
      mode: booking.mode === PrismaBookingMode.SMART_MATCH ? 'smart_match' : 'manual',
      service: booking.service as ServiceCategory,
      city: booking.addressCity,
      postalCode: booking.addressPostalCode,
      shortNotice: booking.shortNotice,
      matchingRetryCount: booking.matchingRetryCount,
      totalCents: booking.pricingTotalCents,
      client: booking.client ? this.mapParty(booking.client, booking.client.id) : this.fallbackClient(booking),
      provider: booking.assignments[0]
        ? this.mapParty(booking.assignments[0].provider.user, booking.assignments[0].provider.id)
        : null,
      paymentStatus: null,
    };

    const invitations: AdminSmartMatchingInvitationDetail[] = booking.invitations.map((invitation) => ({
      id: invitation.id,
      status: invitation.status.toLowerCase() as DomainInvitationStatus,
      invitedAt: invitation.createdAt.toISOString(),
      viewedAt: invitation.viewedAt?.toISOString() ?? null,
      respondedAt: invitation.respondedAt?.toISOString() ?? null,
      provider: this.mapParty(invitation.provider.user, invitation.provider.id),
      metadata: invitation.metadata as Record<string, unknown> | null,
    }));

    const summary = this.buildInvitationSummary(booking.invitations);
    const firstInvitationAt = booking.invitations[0]?.createdAt ?? null;
    const firstResponseAt = booking.invitations
      .filter((inv) => !!inv.respondedAt)
      .sort((a, b) => a.respondedAt!.getTime() - b.respondedAt!.getTime())[0]?.respondedAt;

    const timeline: AdminSmartMatchingTimelineEvent[] = [];
    for (const invitation of booking.invitations) {
      const provider = this.mapParty(invitation.provider.user, invitation.provider.id);
      timeline.push({ type: 'invited', timestamp: invitation.createdAt.toISOString(), provider });
      if (invitation.viewedAt) {
        timeline.push({ type: 'viewed', timestamp: invitation.viewedAt.toISOString(), provider });
      }
      if (invitation.respondedAt) {
        const type =
          invitation.status === PrismaInvitationStatus.ACCEPTED
            ? 'accepted'
            : invitation.status === PrismaInvitationStatus.DECLINED
              ? 'declined'
              : 'expired';
        timeline.push({ type, timestamp: invitation.respondedAt.toISOString(), provider });
      }
    }
    if (booking.assignments[0]) {
      timeline.push({
        type: 'assigned',
        timestamp: booking.assignments[0].createdAt.toISOString(),
        provider: this.mapParty(booking.assignments[0].provider.user, booking.assignments[0].provider.id),
      });
    }

    timeline.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));

    return {
      booking: bookingItem,
      summary: {
        invitations: summary,
        assignedProvider: booking.assignments[0]
          ? this.mapParty(booking.assignments[0].provider.user, booking.assignments[0].provider.id)
          : null,
        firstInvitationAt: firstInvitationAt?.toISOString() ?? null,
        firstResponseAt: firstResponseAt?.toISOString() ?? null,
        assignmentAt: booking.assignments[0]?.createdAt?.toISOString() ?? null,
      },
      invitations,
      timeline,
    };
  }

  async getConfig(): Promise<AdminSmartMatchingConfig> {
    const config = await this.matching.getMatchingConfig();
    return {
      distanceMaxKm: config.distanceMaxKm,
      weights: config.weights,
      teamBonus: config.teamBonus,
    };
  }

  async updateConfig(payload: SmartMatchingConfigDto): Promise<AdminSmartMatchingConfig> {
    const existing = await this.prisma.matchingConfig.findFirst({ orderBy: { createdAt: 'desc' } });
    if (existing) {
      await this.prisma.matchingConfig.update({
        where: { id: existing.id },
        data: {
          distanceMaxKm: payload.distanceMaxKm ?? existing.distanceMaxKm,
          weightsJson: payload.weights ?? existing.weightsJson,
          teamBonusJson: payload.teamBonus ?? existing.teamBonusJson,
        },
      });
    } else {
      await this.prisma.matchingConfig.create({
        data: {
          distanceMaxKm: payload.distanceMaxKm ?? 20,
          weightsJson: payload.weights ?? undefined,
          teamBonusJson: payload.teamBonus ?? undefined,
        },
      });
    }
    this.matching.invalidateCache();
    return this.getConfig();
  }

  async simulate(payload: SmartMatchingSimulationDto): Promise<AdminSmartMatchingSimulationResponse> {
    const start = DateTime.fromISO(payload.startAt, { zone: 'utc' });
    const durationMinutes = payload.durationMinutes ?? 120;
    const end = start.plus({ minutes: durationMinutes });
    const ecoPreference = (payload.ecoPreference ?? 'standard') as EcoPreference;
    const lookup = this.postalCodes.lookup(payload.postalCode);
    const city = payload.city ?? lookup?.city;
    const results = await this.matching.previewScores(
      {
        service: payload.service as ServiceCategory,
        ecoPreference,
        startAt: start.toJSDate(),
        endAt: end.toJSDate(),
        city: city ?? undefined,
        requiredProviders: payload.requiredProviders ?? 1,
      },
      25
    );

    const providerIds = results.map((candidate) => candidate.providerId);
    const providerMeta = providerIds.length
      ? await this.prisma.providerProfile.findMany({
          where: { id: { in: providerIds } },
          select: {
            id: true,
            serviceAreas: true,
            serviceZones: { select: { id: true, name: true, postalCode: true, city: true, district: true } },
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        })
      : [];
    const metaMap = new Map(providerMeta.map((entry) => [entry.id, entry]));

    const candidates: AdminMatchingCandidate[] = results.map((candidate) => {
      const meta = metaMap.get(candidate.providerId);
      const components = Object.fromEntries(Object.entries(candidate.components)) as Record<string, number>;
      const metadata = {
        ...candidate.metadata,
        providerType: (candidate.metadata.providerType?.toLowerCase() as ProviderType) ?? 'freelancer',
      };
      return {
        providerId: candidate.providerId,
        providerName: meta ? this.composeDisplayName(meta.user.firstName, meta.user.lastName, meta.user.email) : candidate.providerId,
        providerEmail: meta?.user.email ?? '',
        score: candidate.score,
        rank: candidate.rank,
        components,
        metadata,
        serviceAreas: meta?.serviceAreas ?? [],
        serviceZones:
          meta?.serviceZones.map((zone) => ({
            id: zone.id,
            name: zone.name,
            postalCode: zone.postalCode ?? null,
            city: zone.city ?? null,
            district: zone.district ?? null,
          })) ?? [],
      };
    });

    return {
      query: {
        postalCode: payload.postalCode,
        city: city ?? null,
        service: payload.service as ServiceCategory,
        startAt: start.toISO()!,
        endAt: end.toISO()!,
        ecoPreference,
        requiredProviders: payload.requiredProviders ?? 1,
      },
      candidates,
      summary: {
        totalCandidates: candidates.length,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  async listScenarioMetrics(query: SmartMatchingRangeQueryDto): Promise<AdminSmartMatchingScenarioResponse> {
    const { from, to } = this.resolveRange(query);
    const bookings = await this.prisma.booking.findMany({
      where: {
        mode: PrismaBookingMode.SMART_MATCH,
        createdAt: { gte: from.toJSDate(), lte: to.toJSDate() },
      },
      select: {
        id: true,
        createdAt: true,
        startAt: true,
        status: true,
        service: true,
        shortNotice: true,
        frequency: true,
        _count: { select: { invitations: true } },
      },
    });
    const successStatuses = new Set<PrismaBookingStatus>([
      PrismaBookingStatus.CONFIRMED,
      PrismaBookingStatus.IN_PROGRESS,
      PrismaBookingStatus.COMPLETED,
    ]);
    type ScenarioSource = (typeof bookings)[number];

    const specialServices = new Set<string>([
      'final',
      'construction',
      'move_out',
      'spring',
      'cluttered',
      'industrial',
      'pigeon_cleanup',
      'upholstery',
    ]);

    const scenarioDefinitions: Array<{
      id: string;
      name: string;
      description?: string;
      conditions: string;
      filter: (booking: ScenarioSource, leadHours: number) => boolean;
    }> = [
      {
        id: 'standard',
        name: 'Standard',
        description: 'Missions planifiées avec délai confortable.',
        conditions: 'Lead time ≥ 48 h',
        filter: (booking, leadHours) => !booking.shortNotice && leadHours >= 48,
      },
      {
        id: 'urgent',
        name: 'Urgent',
        description: 'Demandes à court délai ou flag short notice.',
        conditions: 'Lead time < 24 h ou shortNotice = true',
        filter: (booking, leadHours) => booking.shortNotice || leadHours < 24,
      },
      {
        id: 'recurring',
        name: 'Récurrent',
        description: 'Contrats hebdomadaires / mensuels',
        conditions: 'frequency ≠ ONCE',
        filter: (booking) => booking.frequency !== 'ONCE',
      },
      {
        id: 'special',
        name: 'Services spéciaux',
        description: 'Fin de bail, chantiers, interventions complexes.',
        conditions: `services spéciaux (${Array.from(specialServices)
          .map((serviceId) => SERVICE_CATALOG.find((service) => service.id === serviceId)?.title ?? serviceId)
          .slice(0, 4)
          .join(', ')})`,
        filter: (booking) => specialServices.has(booking.service),
      },
    ];

    const scenarios: AdminSmartMatchingScenario[] = scenarioDefinitions.map((definition) => {
      const subset = bookings.filter((booking) => definition.filter(booking, this.leadTimeHours(booking)));
      const total = subset.length;
      const successes = subset.filter((booking) => successStatuses.has(booking.status as PrismaBookingStatus)).length;
      const avgInvitations = total
        ? subset.reduce((sum, booking) => sum + (booking._count?.invitations ?? 0), 0) / total
        : null;
      const avgLeadHours = total ? subset.reduce((sum, booking) => sum + this.leadTimeHours(booking), 0) / total : null;

      return {
        id: definition.id,
        name: definition.name,
        description: definition.description,
        conditions: definition.conditions,
        stats: {
          bookings: total,
          successRate: total ? successes / total : 0,
          avgInvitations,
          avgLeadHours,
        },
        highlights: total
          ? [
              `${successes} missions terminées sur ${total}`,
              `Lead moyen ${avgLeadHours !== null ? `${avgLeadHours.toFixed(1)} h` : '—'}`,
              `Invitations ${avgInvitations !== null ? avgInvitations.toFixed(1) : '—'}`,
            ]
          : ['Aucune mission sur la période'],
      };
    });

    return {
      period: { from: from.toISO(), to: to.toISO() },
      scenarios,
    };
  }

  async listPolicyMetrics(query: SmartMatchingRangeQueryDto): Promise<AdminSmartMatchingPolicyResponse> {
    const { from, to } = this.resolveRange(query);
    const bookings = await this.prisma.booking.findMany({
      where: {
        mode: PrismaBookingMode.SMART_MATCH,
        createdAt: { gte: from.toJSDate(), lte: to.toJSDate() },
      },
      select: {
        id: true,
        startAt: true,
        addressPostalCode: true,
        addressCity: true,
        service: true,
        ecoPreference: true,
        assignments: {
          orderBy: { createdAt: 'asc' },
          select: {
            provider: {
              select: {
                id: true,
                providerType: true,
                offersEco: true,
              },
            },
          },
          take: 1,
        },
      },
    });

    const normalized = bookings.map((booking) => ({
      ...booking,
      provider: booking.assignments[0]?.provider ?? null,
    }));

    const berlinBookings = normalized.filter((booking) =>
      this.isBerlinZone(booking.addressPostalCode, booking.addressCity)
    );
    const berlinCompliant = berlinBookings.filter(
      (booking) => booking.provider?.providerType === 'COMPANY'
    ).length;

    const ecoBookings = normalized.filter((booking) => booking.ecoPreference === 'BIO');
    const ecoCompliant = ecoBookings.filter((booking) => booking.provider?.offersEco).length;

    const weekendBookings = normalized.filter(
      (booking) =>
        !!booking.provider &&
        booking.provider.providerType === 'FREELANCER' &&
        this.isWeekend(booking.startAt)
    );
    const weekendStats = new Map<string, Map<string, number>>();
    let weekendBreaches = 0;
    for (const booking of weekendBookings) {
      const providerId = booking.provider!.id;
      const dayKey = booking.startAt.toISOString().slice(0, 10);
      const providerMap = weekendStats.get(providerId) ?? new Map<string, number>();
      const nextCount = (providerMap.get(dayKey) ?? 0) + 1;
      providerMap.set(dayKey, nextCount);
      weekendStats.set(providerId, providerMap);
      if (nextCount > 2) {
        weekendBreaches += 1;
      }
    }

    const policies: AdminSmartMatchingPolicy[] = [
      {
        id: 'berlin_companies',
        name: 'Partenaires entreprises Berlin',
        description: 'Assigner des entreprises partenaires dans Berlin centre.',
        type: 'priority',
        scope: 'Berlin 10xxx',
        enabled: true,
        stats: {
          impactedBookings: berlinBookings.length,
          complianceRate: berlinBookings.length ? berlinCompliant / berlinBookings.length : null,
          breaches: berlinBookings.length ? berlinBookings.length - berlinCompliant : undefined,
        },
        highlights: berlinBookings.length
          ? [
              `${berlinCompliant} missions confiées à des entreprises`,
              `${((berlinCompliant / berlinBookings.length) * 100).toFixed(1)} % de respect`,
            ]
          : ['Aucune mission sur la zone'],
      },
      {
        id: 'eco_alignment',
        name: 'Alignement Öko Plus',
        description: 'Les missions BIO doivent être réalisées par des prestataires éco.',
        type: 'priority',
        scope: 'ecoPreference = BIO',
        enabled: true,
        stats: {
          impactedBookings: ecoBookings.length,
          complianceRate: ecoBookings.length ? ecoCompliant / ecoBookings.length : null,
          breaches: ecoBookings.length ? ecoBookings.length - ecoCompliant : undefined,
        },
        highlights: ecoBookings.length
          ? [
              `${ecoCompliant} missions Öko couvertes`,
              `${((ecoCompliant / ecoBookings.length) * 100).toFixed(1)} % de respect`,
            ]
          : ['Aucune mission Öko sur la période'],
      },
      {
        id: 'freelancer_weekend_cap',
        name: 'Limite freelances week-end',
        description: 'Limiter à 2 missions par jour les freelances le week-end.',
        type: 'limit',
        scope: 'Week-end freelancers',
        enabled: true,
        stats: {
          impactedBookings: weekendBookings.length,
          complianceRate: weekendBookings.length
            ? (weekendBookings.length - weekendBreaches) / weekendBookings.length
            : null,
          breaches: weekendBreaches,
        },
        highlights: weekendBookings.length
          ? [
              `${weekendBreaches} dépassements détectés`,
              `${weekendStats.size} freelances concernés`,
            ]
          : ['Aucune mission week-end pour des freelances'],
      },
    ];

    return {
      period: { from: from.toISO(), to: to.toISO() },
      policies,
    };
  }

  async listGuardrailMetrics(query: SmartMatchingRangeQueryDto): Promise<AdminSmartMatchingGuardrailResponse> {
    const { from, to } = this.resolveRange(query);
    const invitations = await this.prisma.bookingInvitation.groupBy({
      by: ['providerId', 'status'],
      where: {
        createdAt: { gte: from.toJSDate(), lte: to.toJSDate() },
      },
      _count: { _all: true },
    });
    const invitationStats = new Map<
      string,
      { declined: number; accepted: number; expired: number; total: number }
    >();
    for (const row of invitations) {
      const stats = invitationStats.get(row.providerId) ?? {
        declined: 0,
        accepted: 0,
        expired: 0,
        total: 0,
      };
      stats.total += row._count._all;
      if (row.status === PrismaInvitationStatus.DECLINED) {
        stats.declined += row._count._all;
      } else if (row.status === PrismaInvitationStatus.ACCEPTED) {
        stats.accepted += row._count._all;
      } else if (row.status === PrismaInvitationStatus.EXPIRED) {
        stats.expired += row._count._all;
      }
      invitationStats.set(row.providerId, stats);
    }

    const flaggedDeclines = Array.from(invitationStats.entries())
      .map(([providerId, stats]) => {
        const considered = stats.accepted + stats.declined;
        const ratio = considered ? stats.declined / considered : 0;
        return { providerId, stats, ratio };
      })
      .filter((entry) => entry.stats.declined >= 3 && entry.ratio >= 0.7);
    const providerProfiles = flaggedDeclines.length
      ? await this.prisma.providerProfile.findMany({
          where: { id: { in: flaggedDeclines.map((entry) => entry.providerId) } },
          select: { id: true, user: { select: { firstName: true, lastName: true, email: true } } },
        })
      : [];
    const providerLookup = new Map(providerProfiles.map((profile) => [profile.id, profile]));

    const providerCancels = await this.prisma.bookingAudit.findMany({
      where: {
        action: 'status_changed',
        createdAt: { gte: from.toJSDate(), lte: to.toJSDate() },
        metadata: { path: ['reason'], equals: 'provider_cancelled' },
      },
      select: {
        createdAt: true,
        booking: {
          select: {
            assignments: {
              orderBy: { createdAt: 'asc' },
              take: 1,
              select: {
                providerId: true,
                provider: {
                  select: { id: true, user: { select: { firstName: true, lastName: true, email: true } } },
                },
              },
            },
          },
        },
      },
    });
    const providerCancelMap = new Map<
      string,
      { count: number; lastEventAt: string; reference: string }
    >();
    for (const audit of providerCancels) {
      const assignment = audit.booking.assignments[0];
      if (!assignment?.providerId) continue;
      const ref = this.composeDisplayName(
        assignment.provider?.user.firstName ?? null,
        assignment.provider?.user.lastName ?? null,
        assignment.provider?.user.email ?? 'Prestataire'
      );
      const entry = providerCancelMap.get(assignment.providerId) ?? {
        count: 0,
        lastEventAt: audit.createdAt.toISOString(),
        reference: ref,
      };
      entry.count += 1;
      if (DateTime.fromISO(entry.lastEventAt) < DateTime.fromJSDate(audit.createdAt)) {
        entry.lastEventAt = audit.createdAt.toISOString();
      }
      providerCancelMap.set(assignment.providerId, entry);
    }

    const clientDraftGroups = await this.prisma.booking.groupBy({
      by: ['clientId'],
      where: {
        status: PrismaBookingStatus.DRAFT,
        createdAt: { gte: from.toJSDate(), lte: to.toJSDate() },
        clientId: { not: null },
      },
      _count: { _all: true },
    });
    const flaggedDrafts = clientDraftGroups.filter((group) => group._count._all >= 3);
    const draftClients = flaggedDrafts.length
      ? await this.prisma.user.findMany({
          where: { id: { in: flaggedDrafts.map((group) => group.clientId!) } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const draftLookup = new Map(draftClients.map((client) => [client.id, client]));

    const clientCancelAudits = await this.prisma.bookingAudit.findMany({
      where: {
        action: 'status_changed',
        createdAt: { gte: from.toJSDate(), lte: to.toJSDate() },
        metadata: { path: ['reason'], equals: 'client_cancelled' },
      },
      select: {
        createdAt: true,
        booking: {
          select: {
            clientId: true,
            client: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
    });
    const clientCancelMap = new Map<
      string,
      { count: number; lastEventAt: string; reference: string }
    >();
    for (const audit of clientCancelAudits) {
      const clientId = audit.booking.clientId;
      if (!clientId) continue;
      const reference = this.composeDisplayName(
        audit.booking.client?.firstName ?? null,
        audit.booking.client?.lastName ?? null,
        audit.booking.client?.email ?? 'Client'
      );
      const entry = clientCancelMap.get(clientId) ?? {
        count: 0,
        lastEventAt: audit.createdAt.toISOString(),
        reference,
      };
      entry.count += 1;
      if (DateTime.fromISO(entry.lastEventAt) < DateTime.fromJSDate(audit.createdAt)) {
        entry.lastEventAt = audit.createdAt.toISOString();
      }
      clientCancelMap.set(clientId, entry);
    }

    const guardrails: AdminSmartMatchingGuardrail[] = [
      {
        id: 'provider_decline_rate',
        name: 'Refus prestataires',
        target: 'provider',
        description: 'Prestataires refusant la majorité des invitations Smart Match.',
        threshold: 'Ratio refus ≥ 70 % (min 3 réponses)',
        activeCases: flaggedDeclines.length,
        examples: flaggedDeclines.slice(0, 4).map((entry) => {
          const profile = providerLookup.get(entry.providerId);
          const reference =
            profile?.user?.firstName || profile?.user?.lastName
              ? `${profile?.user?.firstName ?? ''} ${profile?.user?.lastName ?? ''}`.trim()
              : profile?.user?.email ?? entry.providerId;
          return {
            id: entry.providerId,
            reference,
            count: entry.stats.declined,
            lastEventAt: to.toISO(),
            extra: `${(entry.ratio * 100).toFixed(1)} % refus`,
          };
        }),
      },
      {
        id: 'provider_cancellations',
        name: 'Annulations prestataires',
        target: 'provider',
        description: 'Prestataires annulant après confirmation.',
        threshold: '≥ 2 annulations sur la période',
        activeCases: Array.from(providerCancelMap.values()).filter((entry) => entry.count >= 2).length,
        examples: Array.from(providerCancelMap.entries())
          .filter(([, entry]) => entry.count >= 1)
          .slice(0, 4)
          .map(([providerId, entry]) => ({
            id: providerId,
            reference: entry.reference,
            count: entry.count,
            lastEventAt: entry.lastEventAt,
          })),
      },
      {
        id: 'client_drafts',
        name: 'Brouillons non payés',
        target: 'client',
        description: 'Clients créant des brouillons récurrents.',
        threshold: '≥ 3 brouillons',
        activeCases: flaggedDrafts.length,
        examples: flaggedDrafts.slice(0, 4).map((group) => {
          const profile = draftLookup.get(group.clientId!);
          const reference =
            profile?.firstName || profile?.lastName
              ? `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim()
              : profile?.email ?? group.clientId!;
          return {
            id: group.clientId!,
            reference,
            count: group._count._all,
            lastEventAt: to.toISO(),
          };
        }),
      },
      {
        id: 'client_cancellations',
        name: 'Annulations client',
        target: 'client',
        description: 'Clients annulant fréquemment après confirmation.',
        threshold: '≥ 2 annulations client',
        activeCases: Array.from(clientCancelMap.values()).filter((entry) => entry.count >= 2).length,
        examples: Array.from(clientCancelMap.entries())
          .filter(([, entry]) => entry.count >= 1)
          .slice(0, 4)
          .map(([clientId, entry]) => ({
            id: clientId,
            reference: entry.reference,
            count: entry.count,
            lastEventAt: entry.lastEventAt,
          })),
      },
    ];

    return {
      period: { from: from.toISO(), to: to.toISO() },
      guardrails,
    };
  }

  private resolveRange(query: SmartMatchingRangeQueryDto) {
    const to = query.to ? DateTime.fromISO(query.to).toUTC() : DateTime.utc();
    const from = query.from ? DateTime.fromISO(query.from).toUTC() : to.minus({ days: DEFAULT_RANGE_DAYS });
    return { from, to };
  }

  private leadTimeHours(booking: { createdAt: Date; startAt: Date }): number {
    const diff = DateTime.fromJSDate(booking.startAt).diff(DateTime.fromJSDate(booking.createdAt), 'hours').hours;
    return Number.isFinite(diff) ? diff : 0;
  }

  private isBerlinZone(postalCode?: string | null, city?: string | null): boolean {
    if (!postalCode && !city) {
      return false;
    }
    if (city && city.toLowerCase().includes('berlin')) {
      return true;
    }
    if (!postalCode) return false;
    return postalCode.startsWith('10');
  }

  private isWeekend(date?: Date | null): boolean {
    if (!date) return false;
    const weekday = DateTime.fromJSDate(date).weekday;
    return weekday === 6 || weekday === 7;
  }

  private mapParty(user: { firstName: string | null; lastName: string | null; email: string; phone?: string | null }, id: string): AdminBookingParty {
    const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
    return {
      id,
      name,
      email: user.email,
      phone: user.phone ?? undefined,
    };
  }

  private fallbackClient(booking: {
    clientId?: string | null;
    contactFirstName?: string | null;
    contactLastName?: string | null;
    contactPhone?: string | null;
    contactCompany?: string | null;
    contactEmail?: string | null;
  }): AdminBookingParty {
    const name = `${booking.contactFirstName ?? ''} ${booking.contactLastName ?? ''}`.trim() || booking.contactCompany || 'Client';
    return {
      id: booking.clientId ?? 'client',
      name,
      email: booking.contactEmail ?? undefined,
      phone: booking.contactPhone ?? undefined,
    };
  }

  private buildInvitationSummary(
    invitations: Array<{ status: PrismaInvitationStatus }>
  ): AdminSmartMatchingInvitationSummary {
    const summary: AdminSmartMatchingInvitationSummary = {
      total: invitations.length,
      accepted: 0,
      declined: 0,
      expired: 0,
      pending: 0,
    };
    for (const invitation of invitations) {
      const status = invitation.status;
      if (status === PrismaInvitationStatus.ACCEPTED) {
        summary.accepted += 1;
      } else if (status === PrismaInvitationStatus.DECLINED) {
        summary.declined += 1;
      } else if (status === PrismaInvitationStatus.EXPIRED) {
        summary.expired += 1;
      } else {
        summary.pending += 1;
      }
    }
    return summary;
  }

  private composeDisplayName(first?: string | null, last?: string | null, fallback?: string) {
    const composed = `${first ?? ''} ${last ?? ''}`.trim();
    return composed || fallback || 'Prestataire';
  }
}
