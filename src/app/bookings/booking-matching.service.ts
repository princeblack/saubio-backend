import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { BookingStatus as PrismaBookingStatus, ProviderType } from '@prisma/client';
import { EcoPreference, ServiceCategory } from '@saubio/models';
import { PrismaService } from '../../prisma/prisma.service';
import { DateTime } from 'luxon';

export interface BookingMatchingCriteria {
  service: ServiceCategory;
  ecoPreference: EcoPreference;
  startAt: Date;
  endAt: Date;
  city?: string;
  excludeBookingId?: string;
  clientId?: string;
  priceCeilingCents?: number;
  requiredProviders?: number;
}

interface ProviderCandidate {
  id: string;
  providerType: ProviderType;
  serviceAreas: string[];
  serviceZones: Array<{
    name: string;
    city?: string | null;
    district?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    radiusKm?: number | null;
  }>;
  offersEco: boolean;
  hourlyRateCents: number;
  ratingAverage: number | null;
  ratingCount: number | null;
  availabilityTier: number;
  loadScore: number;
}

interface MatchingConfigShape {
  weights: Record<string, number>;
  distanceMaxKm: number;
  teamBonus: {
    two?: number;
    threePlus?: number;
  };
}

interface ProviderMetrics {
  assignmentsRecent: number;
  cancellationsRecent: number;
  assignmentsTotal: number;
  clientAssignments: number;
}

interface MatchingScoreComponents {
  distance: number;
  rating: number;
  reliability: number;
  experience: number;
  eco: number;
  availability: number;
  loyalty: number;
}

export interface MatchingScoreResult {
  providerId: string;
  score: number;
  rank: number;
  components: MatchingScoreComponents;
  metadata: {
    ratingAverage: number | null;
    ratingCount: number | null;
    distanceKm: number;
    priceEstimateCents: number | null;
     priceScore: number | null;
    hourlyRateCents: number;
    providerType: ProviderType;
    reliabilityRecent: number;
  };
}

const DEFAULT_WEIGHTS: MatchingScoreComponents & { price?: number } = {
  distance: 0.2,
  rating: 0.2,
  reliability: 0.15,
  experience: 0.1,
  eco: 0.15,
  availability: 0.15,
  loyalty: 0.05,
};

const DEFAULT_TEAM_BONUS = {
  two: 0.02,
  threePlus: 0.05,
};

const CONFIG_CACHE_TTL_MS = 60_000;
const DEFAULT_DISTANCE_MAX_KM = 20;

const BLOCKING_STATUSES: PrismaBookingStatus[] = [
  PrismaBookingStatus.DRAFT,
  PrismaBookingStatus.PENDING_PROVIDER,
  PrismaBookingStatus.PENDING_CLIENT,
  PrismaBookingStatus.CONFIRMED,
  PrismaBookingStatus.IN_PROGRESS,
];

@Injectable()
export class BookingMatchingService {
  private matchingConfigCache: { expiresAt: number; value: MatchingConfigShape } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async matchProviders(
    criteria: BookingMatchingCriteria,
    limit = 3
  ): Promise<string[]> {
    const scored = await this.scoreProviders(criteria, limit);
    return scored.map((entry) => entry.providerId);
  }

  async previewScores(
    criteria: BookingMatchingCriteria,
    limit = 10
  ): Promise<MatchingScoreResult[]> {
    return this.scoreProviders(criteria, limit);
  }

  async matchTeam(
    criteria: BookingMatchingCriteria,
    requiredMembers: number
  ): Promise<{ teamId: string; memberIds: string[] } | null> {
    if (requiredMembers <= 1) {
      return null;
    }
    const candidates = await this.getEligibleProviders(criteria);
    if (!candidates.length) {
      return null;
    }
    const loadMap = new Map(candidates.map((candidate) => [candidate.id, candidate.loadScore]));
    const eligibleIds = new Set(loadMap.keys());

    const teams = await this.prisma.providerTeam.findMany({
      where: {
        isActive: true,
        OR: [
          { serviceCategories: { isEmpty: true } },
          { serviceCategories: { has: criteria.service } },
        ],
      },
      include: {
        members: {
          select: {
            providerId: true,
            isLead: true,
            orderIndex: true,
          },
        },
      },
    });

    let bestTeam: { teamId: string; memberIds: string[]; totalLoad: number } | null = null;

    for (const team of teams) {
      const orderedMembers = team.members
        .slice()
        .sort((a, b) => {
          if (a.isLead !== b.isLead) {
            return a.isLead ? -1 : 1;
          }
          return a.orderIndex - b.orderIndex;
        })
        .map((member) => member.providerId);
      const eligibleMembers = orderedMembers.filter((providerId) => eligibleIds.has(providerId));
      if (eligibleMembers.length < requiredMembers) {
        continue;
      }
      const memberSlice = eligibleMembers.slice(0, requiredMembers);
      const totalLoad = memberSlice.reduce(
        (sum, providerId) => sum + (loadMap.get(providerId) ?? 0),
        0
      );
      if (!bestTeam || totalLoad < bestTeam.totalLoad) {
        bestTeam = {
          teamId: team.id,
          memberIds: memberSlice,
          totalLoad,
        };
      }
    }

    if (!bestTeam) {
      return null;
    }

    return {
      teamId: bestTeam.teamId,
      memberIds: bestTeam.memberIds,
    };
  }

  private async scoreProviders(
    criteria: BookingMatchingCriteria,
    limit?: number
  ): Promise<MatchingScoreResult[]> {
    const config = await this.loadMatchingConfig();
    const candidates = await this.getEligibleProviders(criteria);
    if (!candidates.length) {
      return [];
    }
    const providerIds = candidates.map((candidate) => candidate.id);
    const metricsMap = await this.fetchProviderMetrics(providerIds, criteria.clientId);
    const weights = this.resolveWeights(config.weights, criteria.ecoPreference === 'bio');

    const durationMinutes = Math.max(
      15,
      Math.round((criteria.endAt.getTime() - criteria.startAt.getTime()) / 60000)
    );
    const durationHours = durationMinutes / 60;
    const priceCeiling = criteria.priceCeilingCents ?? null;

    const scored = candidates
      .map((candidate) => {
        const metrics =
          metricsMap.get(candidate.id) ?? {
            assignmentsRecent: 0,
            cancellationsRecent: 0,
            assignmentsTotal: 0,
            clientAssignments: 0,
          };
        const distanceKm = this.computeDistanceKm(candidate, criteria.city, config.distanceMaxKm);
        const distanceScore = 1 - Math.min(distanceKm / config.distanceMaxKm, 1);
        const ratingScore = Math.max(
          0,
          Math.min((candidate.ratingAverage ?? 0) / 5, 1)
        );
        const reliabilityScore =
          metrics.assignmentsRecent > 0
            ? Math.max(0, 1 - metrics.cancellationsRecent / metrics.assignmentsRecent)
            : 1;
        const experienceScore = Math.min(metrics.assignmentsTotal / 200, 1);
        const ecoScore =
          criteria.ecoPreference === 'bio' ? (candidate.offersEco ? 1 : 0) : 1;
        const availabilityScore = candidate.availabilityTier;
        const loyaltyScore = metrics.clientAssignments > 0 ? 0.5 : 0;

        const priceEstimateCents =
          candidate.hourlyRateCents && candidate.hourlyRateCents > 0
            ? Math.round(candidate.hourlyRateCents * durationHours)
            : null;
        let priceScore: number | null = null;
        if (priceCeiling && priceCeiling > 0 && priceEstimateCents !== null) {
          priceScore = Math.max(
            0,
            Math.min((priceCeiling - priceEstimateCents) / priceCeiling, 1)
          );
        }

        const components: MatchingScoreComponents = {
          distance: distanceScore,
          rating: ratingScore,
          reliability: reliabilityScore,
          experience: experienceScore,
          eco: ecoScore,
          availability: availabilityScore,
          loyalty: loyaltyScore,
        };

        let totalScore =
          weights.distance * distanceScore +
          weights.rating * ratingScore +
          weights.reliability * reliabilityScore +
          weights.experience * experienceScore +
          weights.eco * ecoScore +
          weights.availability * availabilityScore +
          weights.loyalty * loyaltyScore;

        if (
          criteria.requiredProviders &&
          candidate.providerType === ProviderType.COMPANY
        ) {
          if (criteria.requiredProviders >= 3) {
            totalScore += config.teamBonus.threePlus ?? DEFAULT_TEAM_BONUS.threePlus;
          } else if (criteria.requiredProviders === 2) {
            totalScore += config.teamBonus.two ?? DEFAULT_TEAM_BONUS.two;
          }
        }

        return {
          providerId: candidate.id,
          score: totalScore,
          rank: 0,
          components,
          metadata: {
            ratingAverage: candidate.ratingAverage,
            ratingCount: candidate.ratingCount,
            distanceKm,
            priceEstimateCents,
            priceScore,
            hourlyRateCents: candidate.hourlyRateCents,
            providerType: candidate.providerType,
            reliabilityRecent: reliabilityScore,
          },
        };
      })
      .filter(
        (entry) =>
          entry.components.availability > 0 &&
          (criteria.ecoPreference !== 'bio' || entry.components.eco > 0)
      )
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        const availabilityDiff = b.components.availability - a.components.availability;
        if (Math.abs(availabilityDiff) > 0.0001) {
          return availabilityDiff > 0 ? 1 : -1;
        }
        const ratingDiff = b.components.rating - a.components.rating;
        if (Math.abs(ratingDiff) > 0.0001) {
          return ratingDiff > 0 ? 1 : -1;
        }
        const reliabilityDiff = b.components.reliability - a.components.reliability;
        if (Math.abs(reliabilityDiff) > 0.0001) {
          return reliabilityDiff > 0 ? 1 : -1;
        }
        const distanceDiff = a.metadata.distanceKm - b.metadata.distanceKm;
        if (Math.abs(distanceDiff) > 0.0001) {
          return distanceDiff < 0 ? -1 : 1;
        }
        const priceScoreA = a.metadata.priceScore ?? 0;
        const priceScoreB = b.metadata.priceScore ?? 0;
        if (Math.abs(priceScoreB - priceScoreA) > 0.0001) {
          return priceScoreB - priceScoreA;
        }
        return a.providerId.localeCompare(b.providerId);
      });

    const sliced = typeof limit === 'number' ? scored.slice(0, limit) : scored;
    return sliced.map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
  }

  private async loadMatchingConfig(): Promise<MatchingConfigShape> {
    if (this.matchingConfigCache && this.matchingConfigCache.expiresAt > Date.now()) {
      return this.matchingConfigCache.value;
    }
    const record = await this.prisma.matchingConfig.findFirst({
      orderBy: { updatedAt: 'desc' },
    });
    const weights =
      (record?.weightsJson as Record<string, number> | null) ?? { ...DEFAULT_WEIGHTS };
    const teamBonus =
      (record?.teamBonusJson as { two?: number; threePlus?: number } | null) ??
      DEFAULT_TEAM_BONUS;
    const value: MatchingConfigShape = {
      weights,
      distanceMaxKm: record?.distanceMaxKm ?? DEFAULT_DISTANCE_MAX_KM,
      teamBonus: {
        two: teamBonus.two ?? DEFAULT_TEAM_BONUS.two,
        threePlus: teamBonus.threePlus ?? DEFAULT_TEAM_BONUS.threePlus,
      },
    };
    this.matchingConfigCache = {
      value,
      expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
    };
    return value;
  }

  private resolveWeights(
    weights: Record<string, number>,
    includeEco: boolean
  ): MatchingScoreComponents {
    const merged: Record<string, number> = { ...DEFAULT_WEIGHTS, ...weights };
    if (!includeEco) {
      const ecoWeight = merged.eco ?? 0;
      merged.eco = 0;
      const othersSum = Object.entries(merged)
        .filter(([key]) => key !== 'eco')
        .reduce((sum, [, value]) => sum + value, 0);
      if (othersSum > 0 && ecoWeight > 0) {
        for (const key of Object.keys(merged)) {
          if (key === 'eco') {
            continue;
          }
          merged[key] = merged[key] + (merged[key] / othersSum) * ecoWeight;
        }
      }
    }
    const total = Object.values(merged).reduce((sum, value) => sum + value, 0);
    if (total > 0) {
      for (const key of Object.keys(merged)) {
        merged[key] = merged[key] / total;
      }
    }
    const normalized: MatchingScoreComponents = {
      distance: merged.distance ?? 0,
      rating: merged.rating ?? 0,
      reliability: merged.reliability ?? 0,
      experience: merged.experience ?? 0,
      eco: merged.eco ?? 0,
      availability: merged.availability ?? 0,
      loyalty: merged.loyalty ?? 0,
    };
    return normalized;
  }

  private async fetchProviderMetrics(
    providerIds: string[],
    clientId?: string
  ): Promise<Map<string, ProviderMetrics>> {
    const map = new Map<string, ProviderMetrics>();
    if (!providerIds.length) {
      return map;
    }
    const now = Date.now();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [recentAssignments, recentCancellations, totalAssignments, clientAssignments] =
      await Promise.all([
        this.prisma.bookingAssignment.groupBy({
          by: ['providerId'],
          _count: { providerId: true },
          where: {
            providerId: { in: providerIds },
            booking: {
              startAt: { gte: thirtyDaysAgo },
            },
          },
        }),
        this.prisma.bookingAssignment.groupBy({
          by: ['providerId'],
          _count: { providerId: true },
          where: {
            providerId: { in: providerIds },
            booking: {
              status: PrismaBookingStatus.CANCELLED,
              updatedAt: { gte: thirtyDaysAgo },
            },
          },
        }),
        this.prisma.bookingAssignment.groupBy({
          by: ['providerId'],
          _count: { providerId: true },
          where: {
            providerId: { in: providerIds },
          },
        }),
        clientId
          ? this.prisma.bookingAssignment.groupBy({
              by: ['providerId'],
              _count: { providerId: true },
              where: {
                providerId: { in: providerIds },
                booking: { clientId },
              },
            })
          : Promise.resolve([]),
      ]);

    for (const id of providerIds) {
      map.set(id, {
        assignmentsRecent: 0,
        cancellationsRecent: 0,
        assignmentsTotal: 0,
        clientAssignments: 0,
      });
    }

    for (const entry of recentAssignments) {
      const metric = map.get(entry.providerId);
      if (metric) {
        metric.assignmentsRecent = entry._count.providerId;
      }
    }

    for (const entry of recentCancellations) {
      const metric = map.get(entry.providerId);
      if (metric) {
        metric.cancellationsRecent = entry._count.providerId;
      }
    }

    for (const entry of totalAssignments) {
      const metric = map.get(entry.providerId);
      if (metric) {
        metric.assignmentsTotal = entry._count.providerId;
      }
    }

    for (const entry of clientAssignments) {
      const metric = map.get(entry.providerId);
      if (metric) {
        metric.clientAssignments = entry._count.providerId;
      }
    }

    return map;
  }

  private computeDistanceKm(
    candidate: ProviderCandidate,
    city?: string,
    maxDistance = DEFAULT_DISTANCE_MAX_KM
  ): number {
    if (!city) {
      return 0;
    }
    const normalizedCity = city.toLowerCase().trim();
    const matchesZone = candidate.serviceZones?.some((zone) =>
      [zone.city, zone.district, zone.name]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedCity))
    );
    if (matchesZone) {
      return 0;
    }
    if (
      candidate.serviceAreas?.some((area) => area.toLowerCase().includes(normalizedCity))
    ) {
      return Math.min(maxDistance / 2, maxDistance);
    }
    return maxDistance;
  }

  async ensureTeamEligible(
    teamId: string,
    criteria: BookingMatchingCriteria,
    requiredMembers: number
  ): Promise<string[]> {
    const team = await this.prisma.providerTeam.findUnique({
      where: { id: teamId },
      include: {
        members: {
          select: {
            providerId: true,
            isLead: true,
            orderIndex: true,
          },
          orderBy: {
            orderIndex: 'asc',
          },
        },
      },
    });

    if (!team || !team.isActive) {
      throw new NotFoundException('TEAM_NOT_FOUND');
    }

    if (
      team.serviceCategories.length &&
      !team.serviceCategories.includes(criteria.service)
    ) {
      throw new BadRequestException('TEAM_SERVICE_MISMATCH');
    }

    const memberIds = team.members.map((member) => member.providerId);
    if (!memberIds.length) {
      throw new BadRequestException('TEAM_HAS_NO_MEMBERS');
    }

    const candidates = await this.getEligibleProviders(criteria, {
      restrictTo: memberIds,
    });
    const eligibleSet = new Set(candidates.map((candidate) => candidate.id));

    const ordered = team.members
      .slice()
      .sort((a, b) => {
        if (a.isLead !== b.isLead) {
          return a.isLead ? -1 : 1;
        }
        return a.orderIndex - b.orderIndex;
      })
      .map((member) => member.providerId)
      .filter((providerId) => eligibleSet.has(providerId));

    if (ordered.length < requiredMembers) {
      throw new BadRequestException('TEAM_MEMBERS_UNAVAILABLE');
    }

    return ordered.slice(0, requiredMembers);
  }

  async ensureProvidersEligible(
    providerIds: string[],
    criteria: BookingMatchingCriteria
  ): Promise<void> {
    if (!providerIds.length) {
      return;
    }

    const candidates = await this.getEligibleProviders(criteria, {
      restrictTo: providerIds,
      includeUnavailable: true,
    });

    const eligibleIds = new Set(
      candidates
        .filter(
          (candidate) =>
            candidate.loadScore !== Number.POSITIVE_INFINITY && candidate.availabilityTier > 0
        )
        .map((candidate) => candidate.id)
    );

    const ineligible = providerIds.filter((id) => !eligibleIds.has(id));

    if (ineligible.length) {
      throw new BadRequestException('PROVIDERS_NOT_ELIGIBLE');
    }
  }

  private async getEligibleProviders(
    criteria: BookingMatchingCriteria,
    options: { restrictTo?: string[]; includeUnavailable?: boolean } = {}
  ): Promise<ProviderCandidate[]> {
    const baseWhere: Prisma.ProviderProfileWhereInput = {
      serviceCategories: { has: criteria.service },
      user: { isActive: true },
      ...(criteria.ecoPreference === 'bio' ? { offersEco: true } : {}),
    };

    if (options.restrictTo?.length) {
      baseWhere.id = { in: options.restrictTo };
    }

    const providerRows = await this.prisma.providerProfile.findMany({
      where: baseWhere,
      select: {
        id: true,
        providerType: true,
        serviceAreas: true,
        serviceZones: {
          select: {
            name: true,
            city: true,
            district: true,
            latitude: true,
            longitude: true,
            radiusKm: true,
          },
        },
        offersEco: true,
        hourlyRateCents: true,
        ratingAverage: true,
        ratingCount: true,
        availabilitySlots: {
          where: { isActive: true },
          select: {
            weekday: true,
            startMinutes: true,
            endMinutes: true,
            timezone: true,
          },
        },
        timeOffPeriods: {
          where: {
            startAt: { lt: criteria.endAt },
            endAt: { gt: criteria.startAt },
          },
          select: {
            startAt: true,
            endAt: true,
          },
        },
      },
    });

    if (!providerRows.length) {
      return [];
    }

    const city = criteria.city?.toLowerCase().trim();
    const filteredByArea = providerRows.filter((provider) => {
      if (!city) {
        return true;
      }
      const zones = provider.serviceZones ?? [];
      if (zones.length) {
        return zones.some((zone) =>
          [zone.city, zone.district, zone.name]
            .filter(Boolean)
            .some((value) => value?.toLowerCase().includes(city))
        );
      }
      if (!provider.serviceAreas?.length) {
        return true;
      }
      return provider.serviceAreas.some((area) => area.toLowerCase().trim() === city);
    });

    if (!filteredByArea.length) {
      return [];
    }

    const providerIds = filteredByArea.map((provider) => provider.id);

    const conflictingAssignments = await this.prisma.bookingAssignment.findMany({
      where: {
        providerId: { in: providerIds },
        booking: {
          id: criteria.excludeBookingId
            ? { not: criteria.excludeBookingId }
            : undefined,
          status: { in: BLOCKING_STATUSES },
          startAt: { lt: criteria.endAt },
          endAt: { gt: criteria.startAt },
        },
      },
      select: { providerId: true },
    });

    const busyProviders = new Set(conflictingAssignments.map((item) => item.providerId));

    const loadIndicators = await this.prisma.bookingAssignment.groupBy({
      by: ['providerId'],
      _count: { providerId: true },
      where: {
        providerId: { in: providerIds },
        booking: {
          status: { in: BLOCKING_STATUSES },
          startAt: { gte: new Date() },
        },
      },
    });

    const loadMap = new Map<string, number>();
    for (const item of loadIndicators) {
      loadMap.set(item.providerId, item._count.providerId);
    }

    return filteredByArea
      .map<ProviderCandidate>((provider) => {
        const availabilitySignals = this.evaluateAvailabilitySignals(provider, criteria);
        const hasTimeOff = this.hasBlockingTimeOff(provider, criteria);
        const isBusy = busyProviders.has(provider.id);
        const loadScore =
          availabilitySignals.loadIndicator === Number.POSITIVE_INFINITY || hasTimeOff || isBusy
            ? Number.POSITIVE_INFINITY
            : loadMap.get(provider.id) ?? 0;

        return {
          id: provider.id,
          providerType: provider.providerType,
          serviceAreas: provider.serviceAreas,
          serviceZones: provider.serviceZones,
          offersEco: provider.offersEco,
          hourlyRateCents: provider.hourlyRateCents,
          ratingAverage: provider.ratingAverage,
          ratingCount: provider.ratingCount,
          loadScore,
          availabilityTier: availabilitySignals.tier,
        };
      })
      .filter(
        (candidate) =>
          options.includeUnavailable ||
          (candidate.loadScore !== Number.POSITIVE_INFINITY && candidate.availabilityTier > 0)
      );
  }

  private evaluateAvailabilitySignals(
    provider: {
      availabilitySlots: Array<{
        weekday: number;
        startMinutes: number;
        endMinutes: number;
        timezone?: string | null;
      }>;
    },
    criteria: BookingMatchingCriteria
  ): { tier: number; loadIndicator: number } {
    const activeSlots = provider.availabilitySlots ?? [];
    if (!activeSlots.length) {
      return { tier: 0, loadIndicator: Number.POSITIVE_INFINITY };
    }

    const jobStart = DateTime.fromJSDate(criteria.startAt);
    const jobEnd = DateTime.fromJSDate(criteria.endAt);
    const jobDurationMinutes = Math.max(
      15,
      Math.round((criteria.endAt.getTime() - criteria.startAt.getTime()) / 60000)
    );

    const weeklyCapacityMinutes = activeSlots.reduce(
      (sum, slot) => sum + (slot.endMinutes - slot.startMinutes),
      0
    );

    const bufferMinutes = 60;

    for (const slot of activeSlots) {
      const timezone = slot.timezone || 'Europe/Berlin';
      const localizedStart = jobStart.setZone(timezone);
      const localizedEnd = jobEnd.setZone(timezone);
      const weekdayIndex = this.normalizeWeekday(localizedStart.weekday);
      if (weekdayIndex !== slot.weekday) {
        continue;
      }
      const startMinutes = localizedStart.hour * 60 + localizedStart.minute;
      const endMinutes = localizedEnd.hour * 60 + localizedEnd.minute;
      const loadRatio = weeklyCapacityMinutes
        ? jobDurationMinutes / weeklyCapacityMinutes
        : 1;
      const loadIndicator = loadRatio * 100 + startMinutes / 1000;

      if (startMinutes >= slot.startMinutes && endMinutes <= slot.endMinutes) {
        return { tier: 1, loadIndicator };
      }

      if (
        startMinutes >= slot.startMinutes - bufferMinutes &&
        endMinutes <= slot.endMinutes + bufferMinutes
      ) {
        return { tier: 0.7, loadIndicator: loadIndicator + 1 };
      }
    }

    return { tier: 0, loadIndicator: Number.POSITIVE_INFINITY };
  }

  private hasBlockingTimeOff(
    provider: {
      timeOffPeriods?: Array<{ startAt: Date; endAt: Date }>;
    },
    criteria: BookingMatchingCriteria
  ): boolean {
    if (!provider.timeOffPeriods?.length) {
      return false;
    }
    return provider.timeOffPeriods.some(
      (period) => period.startAt < criteria.endAt && period.endAt > criteria.startAt
    );
  }

  private normalizeWeekday(luxonWeekday: number): number {
    if (luxonWeekday === 7) {
      return 0;
    }
    return luxonWeekday;
  }
}
