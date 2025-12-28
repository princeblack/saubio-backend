import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  ReviewStatus as PrismaReviewStatus,
  DisputeStatus as PrismaDisputeStatus,
  Dispute as PrismaDispute,
  ProviderProfile as PrismaProviderProfile,
} from '@prisma/client';
import type {
  AdminPaginatedResponse,
  AdminQualityAlert,
  AdminQualityAlertsResponse,
  AdminQualityIncidentItem,
  AdminQualityOverviewResponse,
  AdminQualityProgramProviderItem,
  AdminQualityProgramResponse,
  AdminQualityProviderDetail,
  AdminQualityProviderListItem,
  AdminQualityReviewDetail,
  AdminQualityReviewListItem,
  AdminQualitySatisfactionResponse,
  BookingStatus,
  ReviewStatus,
  ServiceCategory,
} from '@saubio/models';
import { PrismaService } from '../../prisma/prisma.service';
import {
  QualityIncidentQueryDto,
  QualityIncidentUpdateDto,
  QualityProgramQueryDto,
  QualityProviderListQueryDto,
  QualityRangeQueryDto,
  QualityReviewListQueryDto,
  QualityReviewStatusDto,
  QualitySatisfactionQueryDto,
} from './dto/admin-quality.dto';

const INCIDENT_OPEN_STATUSES: PrismaDisputeStatus[] = ['OPEN', 'UNDER_REVIEW', 'ACTION_REQUIRED'];
const DEFAULT_PAGE_SIZE = 25;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SATISFACTION_RANGE_DAYS = 90;
const DEFAULT_PROGRAM_RANGE_DAYS = 90;
const PROGRAM_LOW_SCORE_THRESHOLD = 3.8;
const PROGRAM_TOP_SCORE_THRESHOLD = 4.7;
const PROGRAM_INCIDENT_THRESHOLD = 2;

const REVIEW_STATUS_MAP: Record<PrismaReviewStatus, ReviewStatus> = {
  PUBLISHED: 'published',
  HIDDEN: 'hidden',
  FLAGGED: 'flagged',
};

type ReviewWithRelations = Prisma.ReviewGetPayload<{
  include: {
    booking: {
      select: {
        id: true;
        service: true;
        startAt: true;
        addressCity: true;
        addressPostalCode: true;
        status: true;
      };
    };
    author: { select: { id: true; firstName: true; lastName: true; email: true } };
    targetProvider: {
      select: {
        id: true;
        user: { select: { firstName: true; lastName: true; email: true } };
        addressCity: true;
      };
    };
  };
}>;

@Injectable()
export class EmployeeQualityService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(query: QualityRangeQueryDto): Promise<AdminQualityOverviewResponse> {
    const now = new Date();
    const last7 = new Date(now.getTime() - 7 * DAY_MS);
    const last30 = new Date(now.getTime() - 30 * DAY_MS);
    const last90 = new Date(now.getTime() - 90 * DAY_MS);

    const [globalAggregate, last7Count, last30Count, openIncidents, recentReviews, breakdownSource, topProviders, atRiskProviders] =
      await this.prisma.$transaction([
        this.prisma.review.aggregate({
          where: { status: { not: PrismaReviewStatus.HIDDEN } },
          _avg: { score: true },
          _count: { _all: true },
        }),
        this.prisma.review.count({
          where: { createdAt: { gte: last7 }, status: { not: PrismaReviewStatus.HIDDEN } },
        }),
        this.prisma.review.count({
          where: { createdAt: { gte: last30 }, status: { not: PrismaReviewStatus.HIDDEN } },
        }),
        this.prisma.dispute.count({
          where: { status: { in: INCIDENT_OPEN_STATUSES } },
        }),
        this.prisma.review.findMany({
          where: { status: { not: PrismaReviewStatus.HIDDEN } },
          include: this.reviewInclude(),
          orderBy: { createdAt: 'desc' },
          take: 8,
        }),
        this.prisma.review.findMany({
          where: { createdAt: { gte: last90 }, status: { not: PrismaReviewStatus.HIDDEN } },
          select: {
            score: true,
            booking: { select: { service: true, addressCity: true } },
          },
        }),
        this.prisma.providerProfile.findMany({
          where: { ratingCount: { gte: 3 }, ratingAverage: { not: null } },
          select: {
            id: true,
            ratingAverage: true,
            ratingCount: true,
            addressCity: true,
            user: { select: { firstName: true, lastName: true, email: true } },
          },
          orderBy: { ratingAverage: 'desc' },
          take: 5,
        }),
        this.prisma.providerProfile.findMany({
          where: {
            ratingCount: { gte: 3 },
            OR: [{ ratingAverage: { lt: 3.5 } }, { ratingAverage: null }],
          },
          select: {
            id: true,
            ratingAverage: true,
            ratingCount: true,
            addressCity: true,
            user: { select: { firstName: true, lastName: true, email: true } },
          },
          orderBy: [{ ratingAverage: 'asc' }, { ratingCount: 'desc' }],
          take: 5,
        }),
      ]);

    const serviceMap = new Map<string, { total: number; count: number }>();
    const cityMap = new Map<string, { total: number; count: number }>();

    breakdownSource.forEach((review) => {
      const service = review.booking?.service ?? 'autres';
      const city = review.booking?.addressCity ?? 'Autre';
      const serviceEntry = serviceMap.get(service) ?? { total: 0, count: 0 };
      serviceEntry.total += review.score;
      serviceEntry.count += 1;
      serviceMap.set(service, serviceEntry);

      const cityEntry = cityMap.get(city) ?? { total: 0, count: 0 };
      cityEntry.total += review.score;
      cityEntry.count += 1;
      cityMap.set(city, cityEntry);
    });

    return {
      stats: {
        globalAverage: globalAggregate._avg.score ? Number(globalAggregate._avg.score.toFixed(2)) : null,
        reviewCount: globalAggregate._count._all ?? 0,
        reviewCountLast7: last7Count,
        reviewCountLast30: last30Count,
        openIncidents,
      },
      serviceBreakdown: Array.from(serviceMap.entries()).map(([service, stats]) => ({
        service,
        average: stats.count ? Number((stats.total / stats.count).toFixed(2)) : null,
        count: stats.count,
      })),
      cityBreakdown: Array.from(cityMap.entries()).map(([city, stats]) => ({
        city,
        average: stats.count ? Number((stats.total / stats.count).toFixed(2)) : null,
        count: stats.count,
      })),
      topProviders: topProviders.map((provider) => ({
        id: provider.id,
        name: this.formatName(provider.user),
        email: provider.user.email,
        city: provider.addressCity ?? null,
        ratingAverage: provider.ratingAverage ?? null,
        ratingCount: provider.ratingCount ?? 0,
      })),
      atRiskProviders: atRiskProviders.map((provider) => ({
        id: provider.id,
        name: this.formatName(provider.user),
        email: provider.user.email,
        city: provider.addressCity ?? null,
        ratingAverage: provider.ratingAverage ?? null,
        ratingCount: provider.ratingCount ?? 0,
      })),
      recentReviews: recentReviews.map((review) => this.mapReview(review)),
    };
  }

  async getSatisfactionOverview(
    query: QualitySatisfactionQueryDto
  ): Promise<AdminQualitySatisfactionResponse> {
    const range = this.resolveRange(query, DEFAULT_SATISFACTION_RANGE_DAYS);
    const where = this.buildSatisfactionWhere(query, range);

    const [aggregates, samples, recentReviews] = await this.prisma.$transaction([
      this.prisma.review.aggregate({
        where,
        _avg: { score: true },
        _count: { _all: true },
      }),
      this.prisma.review.findMany({
        where,
        select: {
          score: true,
          createdAt: true,
          booking: { select: { service: true, addressCity: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.review.findMany({
        where,
        include: this.reviewInclude(),
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const promoterThreshold = 4;
    const detractorThreshold = 2;
    const totalSamples = samples.length;
    const promoters = samples.filter((sample) => sample.score >= promoterThreshold).length;
    const detractors = samples.filter((sample) => sample.score <= detractorThreshold).length;

    const serviceMap = new Map<string, { total: number; count: number }>();
    const cityMap = new Map<string, { total: number; count: number }>();
    const timeMap = new Map<string, { total: number; count: number }>();

    samples.forEach((sample) => {
      const service = sample.booking?.service ?? 'Autre';
      const city = sample.booking?.addressCity ?? 'Autre';
      const serviceEntry = serviceMap.get(service) ?? { total: 0, count: 0 };
      serviceEntry.total += sample.score;
      serviceEntry.count += 1;
      serviceMap.set(service, serviceEntry);

      const cityEntry = cityMap.get(city) ?? { total: 0, count: 0 };
      cityEntry.total += sample.score;
      cityEntry.count += 1;
      cityMap.set(city, cityEntry);

      const periodKey = this.formatPeriodKey(sample.createdAt);
      const timeEntry = timeMap.get(periodKey) ?? { total: 0, count: 0 };
      timeEntry.total += sample.score;
      timeEntry.count += 1;
      timeMap.set(periodKey, timeEntry);
    });

    return {
      stats: {
        averageScore: aggregates._avg.score ? Number(aggregates._avg.score.toFixed(2)) : null,
        totalReviews: aggregates._count._all ?? 0,
        promoterRate: totalSamples ? Number((promoters / totalSamples).toFixed(3)) : 0,
        detractorRate: totalSamples ? Number((detractors / totalSamples).toFixed(3)) : 0,
        nps: totalSamples ? Math.round(((promoters - detractors) / totalSamples) * 100) : null,
      },
      timeseries: Array.from(timeMap.entries())
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([period, stats]) => ({
          period,
          averageScore: stats.count ? Number((stats.total / stats.count).toFixed(2)) : null,
          reviewCount: stats.count,
        })),
      serviceBreakdown: Array.from(serviceMap.entries()).map(([service, stats]) => ({
        service,
        averageScore: stats.count ? Number((stats.total / stats.count).toFixed(2)) : null,
        reviewCount: stats.count,
      })),
      cityBreakdown: Array.from(cityMap.entries()).map(([city, stats]) => ({
        city,
        averageScore: stats.count ? Number((stats.total / stats.count).toFixed(2)) : null,
        reviewCount: stats.count,
      })),
      recentReviews: recentReviews.map((review) => this.mapReview(review)),
    };
  }

  async listReviews(
    query: QualityReviewListQueryDto
  ): Promise<AdminPaginatedResponse<AdminQualityReviewListItem>> {
    const { page, pageSize, skip, take } = this.resolvePagination(query);
    const where = this.buildReviewWhere(query);

    const [total, reviews] = await this.prisma.$transaction([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        include: this.reviewInclude(),
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return {
      items: reviews.map((review) => this.mapReview(review)),
      total,
      page,
      pageSize,
    };
  }

  async updateReviewStatus(
    id: string,
    dto: QualityReviewStatusDto,
    userId: string
  ): Promise<AdminQualityReviewDetail> {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: this.reviewInclude(),
    });
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    const updated = await this.prisma.review.update({
      where: { id },
      data: {
        status: dto.status ? this.mapStatus(dto.status) : undefined,
        moderationNotes: dto.moderationNotes ?? undefined,
        moderatedById: dto.status || dto.moderationNotes ? userId : review.moderatedById,
        moderatedAt: dto.status || dto.moderationNotes ? new Date() : review.moderatedAt,
      },
      include: this.reviewInclude(),
    });

    return {
      ...this.mapReview(updated),
      moderationNotes: updated.moderationNotes ?? null,
      moderatedAt: updated.moderatedAt?.toISOString() ?? null,
    };
  }

  async listProviders(
    query: QualityProviderListQueryDto
  ): Promise<AdminPaginatedResponse<AdminQualityProviderListItem>> {
    const { page, pageSize, skip, take } = this.resolvePagination(query);
    const providerWhere: Prisma.ProviderProfileWhereInput = {};

    if (query.search) {
      providerWhere.OR = [
        { user: { firstName: { contains: query.search, mode: 'insensitive' } } },
        { user: { lastName: { contains: query.search, mode: 'insensitive' } } },
        { user: { email: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    if (query.city) {
      providerWhere.addressCity = { contains: query.city, mode: 'insensitive' };
    }

    if (query.service) {
      providerWhere.serviceCategories = { has: query.service };
    }

    if (query.focus === 'top') {
      providerWhere.ratingAverage = { gt: 4.5 };
    } else if (query.focus === 'at_risk') {
      providerWhere.ratingAverage = { lt: 3.5 };
      providerWhere.ratingCount = { gte: 3 };
    }

    if (query.minReviews) {
      providerWhere.ratingCount = { gte: query.minReviews };
    }

    const [total, providers] = await this.prisma.$transaction([
      this.prisma.providerProfile.count({ where: providerWhere }),
      this.prisma.providerProfile.findMany({
        where: providerWhere,
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
        },
        orderBy: [
          { ratingAverage: query.focus === 'at_risk' ? 'asc' : 'desc' },
          { updatedAt: 'desc' },
        ],
        skip,
        take,
      }),
    ]);

    const providerIds = providers.map((provider) => provider.id);
    const last30 = new Date(Date.now() - 30 * DAY_MS);

    const [reviewAggs, recentReviewAggs, bookingAggs, incidentRecords] = providerIds.length
      ? await this.prisma.$transaction([
          (this.prisma.review.groupBy as unknown as any)({
            by: ['targetProviderId'],
            where: { targetProviderId: { in: providerIds }, status: { not: PrismaReviewStatus.HIDDEN } },
            _count: { _all: true },
          }),
          (this.prisma.review.groupBy as unknown as any)({
            by: ['targetProviderId'],
            where: {
              targetProviderId: { in: providerIds },
              status: { not: PrismaReviewStatus.HIDDEN },
              createdAt: { gte: last30 },
            },
            _count: { _all: true },
          }),
          (this.prisma.bookingAssignment.groupBy as unknown as any)({
            by: ['providerId'],
            where: {
              providerId: { in: providerIds },
              booking: { startAt: { gte: last30 } },
            },
            _count: { bookingId: true },
          }),
          this.prisma.dispute.findMany({
            where: {
              booking: { assignments: { some: { providerId: { in: providerIds } } } },
              status: { in: INCIDENT_OPEN_STATUSES },
            },
            select: {
              id: true,
              bookingId: true,
              booking: {
                select: {
                  assignments: {
                    select: { providerId: true },
                    where: { providerId: { in: providerIds } },
                  },
                },
              },
            },
          }),
        ])
      : [[], [], [], []];

    const reviewCountMap = new Map<string, number>();
    reviewAggs.forEach((agg) => reviewCountMap.set(agg.targetProviderId, agg._count._all));

    const recentReviewCountMap = new Map<string, number>();
    recentReviewAggs.forEach((agg) => recentReviewCountMap.set(agg.targetProviderId, agg._count._all));

    const bookingCountMap = new Map<string, number>();
    bookingAggs.forEach((agg) => bookingCountMap.set(agg.providerId, agg._count.bookingId));

    const incidentCountMap = new Map<string, number>();
    incidentRecords.forEach((incident) => {
      const providerIdsForIncident = incident.booking.assignments?.map((assignment) => assignment.providerId) ?? [];
      providerIdsForIncident.forEach((providerId) => {
        incidentCountMap.set(providerId, (incidentCountMap.get(providerId) ?? 0) + 1);
      });
    });

    return {
      items: providers.map((provider) => ({
        id: provider.id,
        name: this.formatName(provider.user),
        email: provider.user.email,
        city: provider.addressCity ?? null,
        serviceCategories: (provider.serviceCategories ?? []) as ServiceCategory[],
        ratingAverage: provider.ratingAverage ?? null,
        ratingCount: provider.ratingCount ?? 0,
        totalReviews: reviewCountMap.get(provider.id) ?? provider.ratingCount ?? 0,
        reviewsLast30Days: recentReviewCountMap.get(provider.id) ?? 0,
        bookingsLast30Days: bookingCountMap.get(provider.id) ?? 0,
        incidentsOpen: incidentCountMap.get(provider.id) ?? 0,
      })),
      total,
      page,
      pageSize,
    };
  }

  async listIncidents(
    query: QualityIncidentQueryDto
  ): Promise<AdminPaginatedResponse<AdminQualityIncidentItem>> {
    const { page, pageSize, skip, take } = this.resolvePagination(query);
    const where = this.buildIncidentWhere(query);

    const [total, incidents] = await this.prisma.$transaction([
      this.prisma.dispute.count({ where }),
      this.prisma.dispute.findMany({
        where,
        include: {
          booking: {
            select: {
              id: true,
              service: true,
              addressCity: true,
              startAt: true,
              client: { select: { id: true, firstName: true, lastName: true, email: true } },
              assignments: {
                select: {
                  providerId: true,
                  provider: { select: { user: { select: { firstName: true, lastName: true, email: true } } } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return {
      items: incidents.map((incident) => this.mapIncident(incident)),
      total,
      page,
      pageSize,
    };
  }

  async updateIncident(
    id: string,
    dto: QualityIncidentUpdateDto
  ): Promise<AdminQualityIncidentItem> {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
      include: {
        booking: {
          select: {
            id: true,
            service: true,
            addressCity: true,
            startAt: true,
            client: { select: { id: true, firstName: true, lastName: true, email: true } },
            assignments: {
              select: {
                providerId: true,
                provider: { select: { user: { select: { firstName: true, lastName: true, email: true } } } },
              },
            },
          },
        },
      },
    });

    if (!dispute) {
      throw new NotFoundException('Incident not found');
    }

    const updated = await this.prisma.dispute.update({
      where: { id },
      data: {
        status: dto.status ? this.mapIncidentStatus(dto.status) : undefined,
        resolution: dto.resolution ?? undefined,
        adminNotes: dto.adminNotes ?? undefined,
      },
      include: {
        booking: {
          select: {
            id: true,
            service: true,
            addressCity: true,
            startAt: true,
            client: { select: { id: true, firstName: true, lastName: true, email: true } },
            assignments: {
              select: {
                providerId: true,
                provider: { select: { user: { select: { firstName: true, lastName: true, email: true } } } },
              },
            },
          },
        },
      },
    });

    return this.mapIncident(updated);
  }

  async getAlerts(): Promise<AdminQualityAlertsResponse> {
    const thresholds = {
      providerLowScore: 3.5,
      providerMinReviews: 3,
      criticalReviewScore: 2,
      clientDisputeThreshold: 3,
    };
    const last30 = new Date(Date.now() - 30 * DAY_MS);
    const last90 = new Date(Date.now() - 90 * DAY_MS);

    const [atRiskProviders, criticalReviews, clientDisputes] = await this.prisma.$transaction([
      this.prisma.providerProfile.findMany({
        where: {
          ratingAverage: { lt: thresholds.providerLowScore },
          ratingCount: { gte: thresholds.providerMinReviews },
        },
        select: {
          id: true,
          ratingAverage: true,
          ratingCount: true,
          addressCity: true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      }),
      this.prisma.review.findMany({
        where: {
          score: { lte: thresholds.criticalReviewScore },
          createdAt: { gte: last30 },
          status: { not: PrismaReviewStatus.HIDDEN },
        },
        include: this.reviewInclude(),
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      (this.prisma.dispute.groupBy as unknown as any)({
        by: ['openedById'],
        where: {
          openedById: { not: null },
          createdAt: { gte: last90 },
        },
        _count: { _all: true },
      }),
    ]);

    const openByIds = clientDisputes
      .filter((group) => group.openedById && group._count._all >= thresholds.clientDisputeThreshold)
      .map((group) => group.openedById!) ;

    const clients =
      openByIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: openByIds } },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : [];

    const alerts: AdminQualityAlert[] = [];

    atRiskProviders.forEach((provider) => {
      alerts.push({
        id: `provider-${provider.id}`,
        type: 'provider_low_score',
        title: `Prestataire ${this.formatName(provider.user)} en-dessous du seuil`,
        description: `Note moyenne ${provider.ratingAverage?.toFixed(2) ?? 'n/a'} (${provider.ratingCount ?? 0} avis)`,
        createdAt: new Date().toISOString(),
        metadata: {
          providerId: provider.id,
          email: provider.user.email,
          city: provider.addressCity,
        },
      });
    });

    criticalReviews.forEach((review) => {
      alerts.push({
        id: `review-${review.id}`,
        type: 'critical_review',
        title: `Avis ${review.score}/5 pour booking ${review.booking.id}`,
        description: review.comment ?? 'Avis critique reçu',
        createdAt: review.createdAt.toISOString(),
        metadata: {
          bookingId: review.booking.id,
          providerId: review.targetProviderId,
        },
      });
    });

    clients.forEach((client) => {
      const group = clientDisputes.find((entry) => entry.openedById === client.id);
      if (group && group._count._all >= thresholds.clientDisputeThreshold) {
        alerts.push({
          id: `client-${client.id}`,
          type: 'client_risk',
          title: `Client ${this.formatName(client)} à risque`,
          description: `${group._count._all} litiges ouverts sur 90 jours`,
          createdAt: new Date().toISOString(),
          metadata: {
            clientId: client.id,
            email: client.email,
          },
        });
      }
    });

    return {
      alerts,
      thresholds: {
        providerLowScore: thresholds.providerLowScore,
        providerMinReviews: thresholds.providerMinReviews,
        criticalReviewScore: thresholds.criticalReviewScore,
        clientDisputeThreshold: thresholds.clientDisputeThreshold,
      },
    };
  }

  async getQualityProgramSummary(
    query: QualityProgramQueryDto
  ): Promise<AdminQualityProgramResponse> {
    const range = this.resolveRange(query, DEFAULT_PROGRAM_RANGE_DAYS);
    const baseWhere = this.buildProgramProviderWhere(query);
    const minReviews = query.minReviews ?? 3;
    const lowScoreThreshold = query.maxRating ?? PROGRAM_LOW_SCORE_THRESHOLD;
    const topScoreThreshold = query.minRating ?? PROGRAM_TOP_SCORE_THRESHOLD;
    const last30 = new Date(Date.now() - 30 * DAY_MS);

    const [totalProviders, atRiskProviders, topProviders, incidentsLast30] = await this.prisma.$transaction([
      this.prisma.providerProfile.count({ where: baseWhere }),
      this.prisma.providerProfile.findMany({
        where: {
          ...baseWhere,
          ratingCount: { gte: minReviews },
          OR: [{ ratingAverage: { lt: lowScoreThreshold } }, { ratingAverage: null }],
        },
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
        orderBy: [{ ratingAverage: 'asc' }, { updatedAt: 'desc' }],
        take: 25,
      }),
      this.prisma.providerProfile.findMany({
        where: {
          ...baseWhere,
          ratingCount: { gte: minReviews },
          ratingAverage: { gte: topScoreThreshold },
        },
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
        orderBy: [{ ratingAverage: 'desc' }, { ratingCount: 'desc' }],
        take: 25,
      }),
      this.prisma.dispute.count({
        where: { createdAt: { gte: last30 }, status: { in: INCIDENT_OPEN_STATUSES } },
      }),
    ]);

    const providerIds = Array.from(new Set([...atRiskProviders, ...topProviders].map((provider) => provider.id)));
    const metrics = await this.collectProgramMetrics(providerIds, range);

    return {
      summary: {
        totalProviders,
        atRiskCount: atRiskProviders.length,
        topCount: topProviders.length,
        incidentsLast30Days: incidentsLast30,
      },
      atRiskProviders: atRiskProviders.map((provider) =>
        this.mapProgramProviderItem(provider, {
          bookingCount: metrics.bookingCountMap.get(provider.id) ?? 0,
          incidentCount: metrics.incidentTotals.get(provider.id)?.total ?? 0,
          incidentOpenCount: metrics.incidentTotals.get(provider.id)?.open ?? 0,
          recentAverage: metrics.recentAvgMap.get(provider.id) ?? null,
          recentReviewCount: metrics.recentReviewCountMap.get(provider.id) ?? 0,
          lastReviewAt: metrics.lastReviewMap.get(provider.id) ?? null,
        })
      ),
      topProviders: topProviders.map((provider) =>
        this.mapProgramProviderItem(provider, {
          bookingCount: metrics.bookingCountMap.get(provider.id) ?? 0,
          incidentCount: metrics.incidentTotals.get(provider.id)?.total ?? 0,
          incidentOpenCount: metrics.incidentTotals.get(provider.id)?.open ?? 0,
          recentAverage: metrics.recentAvgMap.get(provider.id) ?? null,
          recentReviewCount: metrics.recentReviewCountMap.get(provider.id) ?? 0,
          lastReviewAt: metrics.lastReviewMap.get(provider.id) ?? null,
        })
      ),
    };
  }

  async getQualityProgramProvider(providerId: string): Promise<AdminQualityProviderDetail> {
    const provider = await this.prisma.providerProfile.findUnique({
      where: { id: providerId },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });
    if (!provider) {
      throw new NotFoundException('Provider not found');
    }

    const metrics = await this.collectProgramMetrics([providerId]);
    const last90 = new Date(Date.now() - 90 * DAY_MS);

    const [reviewAggregate, reviewsLast90, openIncidents, incidentsLast90, recentReviews, incidentItems] =
      await this.prisma.$transaction([
        this.prisma.review.aggregate({
          where: { targetProviderId: providerId, status: { not: PrismaReviewStatus.HIDDEN } },
          _avg: { score: true },
          _count: { _all: true },
        }),
        this.prisma.review.count({
          where: {
            targetProviderId: providerId,
            status: { not: PrismaReviewStatus.HIDDEN },
            createdAt: { gte: last90 },
          },
        }),
        this.prisma.dispute.count({
          where: {
            booking: { assignments: { some: { providerId } } },
            status: { in: INCIDENT_OPEN_STATUSES },
          },
        }),
        this.prisma.dispute.count({
          where: {
            booking: { assignments: { some: { providerId } } },
            createdAt: { gte: last90 },
          },
        }),
        this.prisma.review.findMany({
          where: { targetProviderId: providerId, status: { not: PrismaReviewStatus.HIDDEN } },
          include: this.reviewInclude(),
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.dispute.findMany({
          where: { booking: { assignments: { some: { providerId } } } },
          include: {
            booking: {
              select: {
                id: true,
                service: true,
                addressCity: true,
                startAt: true,
                client: { select: { id: true, firstName: true, lastName: true, email: true } },
                assignments: {
                  select: {
                    providerId: true,
                    provider: { select: { user: { select: { firstName: true, lastName: true, email: true } } } },
                  },
                  where: { providerId },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ]);

    const profile = this.mapProgramProviderItem(provider, {
      bookingCount: metrics.bookingCountMap.get(providerId) ?? 0,
      incidentCount: metrics.incidentTotals.get(providerId)?.total ?? 0,
      incidentOpenCount: metrics.incidentTotals.get(providerId)?.open ?? 0,
      recentAverage: metrics.recentAvgMap.get(providerId) ?? null,
      recentReviewCount: metrics.recentReviewCountMap.get(providerId) ?? 0,
      lastReviewAt: metrics.lastReviewMap.get(providerId) ?? null,
    });

    return {
      profile,
      stats: {
        averageScore: reviewAggregate._avg.score ? Number(reviewAggregate._avg.score.toFixed(2)) : null,
        totalReviews: reviewAggregate._count._all ?? 0,
        reviewsLast90Days: reviewsLast90,
        incidentsOpen: openIncidents,
        incidentsLast90Days: incidentsLast90,
      },
      recentReviews: recentReviews.map((review) => this.mapReview(review)),
      recentIncidents: incidentItems.map((incident) => this.mapIncident(incident)),
    };
  }

  private reviewInclude() {
    return {
      booking: {
        select: {
          id: true,
          service: true,
          startAt: true,
          addressCity: true,
          addressPostalCode: true,
          status: true,
        },
      },
      author: { select: { id: true, firstName: true, lastName: true, email: true } },
      targetProvider: {
        select: {
          id: true,
          addressCity: true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      },
    } as const;
  }

  private mapReview(review: ReviewWithRelations): AdminQualityReviewListItem {
    return {
      id: review.id,
      score: review.score,
      comment: review.comment ?? null,
      status: REVIEW_STATUS_MAP[review.status],
      ecoCompliance: review.ecoCompliance,
      createdAt: review.createdAt.toISOString(),
      booking: {
        id: review.booking.id,
        service: review.booking.service,
        city: review.booking.addressCity,
        postalCode: review.booking.addressPostalCode,
        startAt: review.booking.startAt.toISOString(),
        status: review.booking.status.toLowerCase() as BookingStatus,
      },
      author: {
        id: review.author.id,
        name: this.formatName(review.author),
        email: review.author.email,
      },
      provider: {
        id: review.targetProvider.id,
        name: this.formatName(review.targetProvider.user),
        email: review.targetProvider.user.email,
        city: review.targetProvider.addressCity ?? null,
      },
    };
  }

  private mapIncident(dispute: Prisma.DisputeGetPayload<{
    include: {
      booking: {
        select: {
          id: true;
          service: true;
          addressCity: true;
          startAt: true;
          client: { select: { id: true; firstName: true; lastName: true; email: true } };
          assignments: {
            select: {
              providerId: true;
              provider: { select: { user: { select: { firstName: true; lastName: true; email: true } } } };
            };
          };
        };
      };
    };
  }>): AdminQualityIncidentItem {
    const assignment = dispute.booking.assignments[0];
    return {
      id: dispute.id,
      booking: {
        id: dispute.booking.id,
        service: dispute.booking.service,
        city: dispute.booking.addressCity,
        startAt: dispute.booking.startAt.toISOString(),
      },
      status: dispute.status.toLowerCase() as AdminQualityIncidentItem['status'],
      severity: this.deriveSeverity(dispute),
      reason: dispute.reason,
      createdAt: dispute.createdAt.toISOString(),
      updatedAt: dispute.updatedAt.toISOString(),
      client: dispute.booking.client
        ? {
            id: dispute.booking.client.id,
            name: this.formatName(dispute.booking.client),
            email: dispute.booking.client.email,
          }
        : null,
      provider: assignment
        ? {
            id: assignment.providerId,
            name: this.formatName(assignment.provider.user),
            email: assignment.provider.user.email,
          }
        : null,
      refundAmountCents: dispute.refundAmountCents ?? null,
      currency: dispute.refundCurrency ?? 'EUR',
      resolution: dispute.resolution ?? null,
      adminNotes: dispute.adminNotes ?? null,
    };
  }

  private deriveSeverity(dispute: PrismaDispute): 'low' | 'medium' | 'high' {
    if ((dispute.refundAmountCents ?? 0) >= 15000) {
      return 'high';
    }
    if (dispute.reason.toLowerCase().includes('dégât') || dispute.reason.toLowerCase().includes('damage')) {
      return 'high';
    }
    if ((dispute.refundAmountCents ?? 0) >= 5000) {
      return 'medium';
    }
    return 'low';
  }

  private resolvePagination(query: { page?: string; pageSize?: string }) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.max(1, Math.min(100, Number(query.pageSize ?? DEFAULT_PAGE_SIZE)));
    const skip = (page - 1) * pageSize;
    return { page, pageSize, skip, take: pageSize };
  }

  private resolveRange(query: QualityRangeQueryDto, fallbackDays: number) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - fallbackDays * DAY_MS);
    return { from, to };
  }

  private buildSatisfactionWhere(
    query: QualitySatisfactionQueryDto,
    range: { from: Date; to: Date }
  ): Prisma.ReviewWhereInput {
    const where: Prisma.ReviewWhereInput = {
      status: { not: PrismaReviewStatus.HIDDEN },
      createdAt: { gte: range.from, lte: range.to },
    };
    const bookingFilters: Prisma.BookingWhereInput = {};
    if (query.service) {
      bookingFilters.service = { contains: query.service, mode: 'insensitive' };
    }
    if (query.city) {
      bookingFilters.addressCity = { contains: query.city, mode: 'insensitive' };
    }
    if (Object.keys(bookingFilters).length) {
      where.booking = { is: bookingFilters };
    }
    return where;
  }

  private formatPeriodKey(dateValue: Date): string {
    const date = new Date(dateValue);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  private buildReviewWhere(query: QualityReviewListQueryDto): Prisma.ReviewWhereInput {
    const where: Prisma.ReviewWhereInput = {};
    const bookingFilters: Prisma.BookingWhereInput = {};
    const orFilters: Prisma.ReviewWhereInput[] = [];

    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) {
        where.createdAt.gte = new Date(query.from);
      }
      if (query.to) {
        where.createdAt.lte = new Date(query.to);
      }
    }

    if (query.providerId) {
      where.targetProviderId = query.providerId;
    }

    if (query.clientId) {
      where.authorId = query.clientId;
    }

    if (typeof query.minScore === 'number' || typeof query.maxScore === 'number') {
      where.score = {};
      if (typeof query.minScore === 'number') {
        where.score.gte = query.minScore;
      }
      if (typeof query.maxScore === 'number') {
        where.score.lte = query.maxScore;
      }
    }

    if (query.status) {
      where.status = this.mapStatus(query.status);
    }

    if (query.service) {
      bookingFilters.service = { contains: query.service, mode: 'insensitive' };
    }

    if (query.city) {
      bookingFilters.addressCity = { contains: query.city, mode: 'insensitive' };
    }

    if (Object.keys(bookingFilters).length) {
      where.booking = { is: bookingFilters };
    }

    if (query.search) {
      orFilters.push({ comment: { contains: query.search, mode: 'insensitive' } });
      orFilters.push({ booking: { id: { contains: query.search, mode: 'insensitive' } } });
      orFilters.push({ author: { OR: [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ] } });
      orFilters.push({ targetProvider: { user: {
        OR: [
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      } } });
    }

    if (orFilters.length) {
      where.OR = orFilters;
    }

    return where;
  }

  private buildIncidentWhere(query: QualityIncidentQueryDto): Prisma.DisputeWhereInput {
    const where: Prisma.DisputeWhereInput = {};
    const bookingFilters: Prisma.BookingWhereInput = {};

    if (query.status) {
      where.status = this.mapIncidentStatus(query.status);
    }

    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) {
        where.createdAt.gte = new Date(query.from);
      }
      if (query.to) {
        where.createdAt.lte = new Date(query.to);
      }
    }

    if (query.providerId) {
      bookingFilters.assignments = { some: { providerId: query.providerId } };
    }

    if (query.clientId) {
      bookingFilters.clientId = query.clientId;
    }

    if (query.bookingId) {
      where.bookingId = query.bookingId;
    }

    if (query.search) {
      where.OR = [
        { reason: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { resolution: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (Object.keys(bookingFilters).length) {
      where.booking = { is: bookingFilters };
    }

    if (query.severity) {
      const severityFilter: Prisma.DisputeWhereInput = {
        refundAmountCents:
          query.severity === 'high'
            ? { gte: 15000 }
            : query.severity === 'medium'
              ? { gte: 5000, lt: 15000 }
              : { lt: 5000 },
      };
      const existingAnd = Array.isArray(where.AND)
        ? where.AND
        : where.AND
          ? [where.AND]
          : [];
      where.AND = [...existingAnd, severityFilter];
    }

    return where;
  }

  private buildProgramProviderWhere(query: QualityProgramQueryDto): Prisma.ProviderProfileWhereInput {
    const where: Prisma.ProviderProfileWhereInput = {};
    if (query.city) {
      where.addressCity = { contains: query.city, mode: 'insensitive' };
    }
    if (query.service) {
      where.serviceCategories = { has: query.service };
    }
    return where;
  }

  private async collectProgramMetrics(
    providerIds: string[],
    range?: { from: Date; to: Date }
  ) {
    if (!providerIds.length) {
      return {
        recentReviewCountMap: new Map<string, number>(),
        recentAvgMap: new Map<string, number | null>(),
        bookingCountMap: new Map<string, number>(),
        incidentTotals: new Map<string, { total: number; open: number }>(),
        lastReviewMap: new Map<string, Date>(),
      };
    }

    const reviewWindowStart = range?.from ?? new Date(Date.now() - DEFAULT_PROGRAM_RANGE_DAYS * DAY_MS);
    const last30 = new Date(Date.now() - 30 * DAY_MS);
    const last90 = new Date(Date.now() - 90 * DAY_MS);

    const [recentReviewAggs, bookingAggs, incidentRecords, lastReviewGroups] = await this.prisma.$transaction([
      (this.prisma.review.groupBy as unknown as any)({
        by: ['targetProviderId'],
        where: {
          targetProviderId: { in: providerIds },
          status: { not: PrismaReviewStatus.HIDDEN },
          createdAt: { gte: reviewWindowStart },
        },
        _count: { _all: true },
        _avg: { score: true },
      }),
      (this.prisma.bookingAssignment.groupBy as unknown as any)({
        by: ['providerId'],
        where: {
          providerId: { in: providerIds },
          booking: { startAt: { gte: last30 } },
        },
        _count: { bookingId: true },
      }),
      this.prisma.dispute.findMany({
        where: {
          booking: { assignments: { some: { providerId: { in: providerIds } } } },
          createdAt: { gte: last90 },
        },
        select: {
          status: true,
          booking: {
            select: {
              assignments: {
                select: { providerId: true },
                where: { providerId: { in: providerIds } },
              },
            },
          },
        },
      }),
      this.prisma.review.findMany({
        where: { targetProviderId: { in: providerIds }, status: { not: PrismaReviewStatus.HIDDEN } },
        orderBy: { createdAt: 'desc' },
        distinct: ['targetProviderId'],
        select: { targetProviderId: true, createdAt: true },
      }),
    ]);

    const recentReviewCountMap = new Map<string, number>();
    const recentAvgMap = new Map<string, number | null>();
    (recentReviewAggs as Array<{ targetProviderId: string; _count: { _all: number }; _avg: { score: number | null } }>).forEach(
      (agg) => {
        recentReviewCountMap.set(agg.targetProviderId, agg._count._all);
        recentAvgMap.set(agg.targetProviderId, agg._avg.score);
      }
    );

    const bookingCountMap = new Map<string, number>();
    (bookingAggs as Array<{ providerId: string; _count: { bookingId: number } }>).forEach((agg) => {
      bookingCountMap.set(agg.providerId, agg._count.bookingId);
    });

    const incidentTotals = new Map<string, { total: number; open: number }>();
    incidentRecords.forEach((record) => {
      const ids = record.booking.assignments?.map((assignment) => assignment.providerId) ?? [];
      ids.forEach((providerId) => {
        const entry = incidentTotals.get(providerId) ?? { total: 0, open: 0 };
        entry.total += 1;
        if (INCIDENT_OPEN_STATUSES.includes(record.status as PrismaDisputeStatus)) {
          entry.open += 1;
        }
        incidentTotals.set(providerId, entry);
      });
    });

    const lastReviewMap = new Map<string, Date>();
    (lastReviewGroups as Array<{ targetProviderId: string; createdAt: Date }>).forEach((record) => {
      if (!lastReviewMap.has(record.targetProviderId)) {
        lastReviewMap.set(record.targetProviderId, record.createdAt);
      }
    });

    return { recentReviewCountMap, recentAvgMap, bookingCountMap, incidentTotals, lastReviewMap };
  }

  private mapProgramProviderItem(
    provider: PrismaProviderProfile & {
      user: { firstName: string | null; lastName: string | null; email: string };
    },
    metrics: {
      bookingCount: number;
      incidentCount: number;
      incidentOpenCount: number;
      recentAverage: number | null;
      recentReviewCount: number;
      lastReviewAt: Date | null;
    }
  ): AdminQualityProgramProviderItem {
    const flags: string[] = [];
    const providerAverage = provider.ratingAverage ?? null;
    if (providerAverage !== null && providerAverage < PROGRAM_LOW_SCORE_THRESHOLD) {
      flags.push('low_score');
    }
    if (metrics.incidentCount >= PROGRAM_INCIDENT_THRESHOLD) {
      flags.push('incidents');
    }
    if (
      providerAverage !== null &&
      metrics.recentAverage !== null &&
      metrics.recentAverage < providerAverage - 0.2
    ) {
      flags.push('rating_drop');
    }

    const diff =
      providerAverage === null || metrics.recentAverage === null
        ? 0
        : metrics.recentAverage - providerAverage;
    const trend: 'up' | 'flat' | 'down' = Math.abs(diff) <= 0.1 ? 'flat' : diff > 0 ? 'up' : 'down';

    return {
      id: provider.id,
      name: this.formatName(provider.user),
      email: provider.user.email,
      city: provider.addressCity ?? null,
      serviceCategories: (provider.serviceCategories ?? []) as ServiceCategory[],
      ratingAverage: provider.ratingAverage ?? null,
      ratingCount: provider.ratingCount ?? 0,
      totalReviews: provider.ratingCount ?? 0,
      reviewsLast30Days: metrics.recentReviewCount,
      bookingsLast30Days: metrics.bookingCount,
      incidentsOpen: metrics.incidentOpenCount,
      trend,
      flags,
      lastReviewAt: metrics.lastReviewAt ? metrics.lastReviewAt.toISOString() : null,
    };
  }

  private mapStatus(status: string): PrismaReviewStatus {
    switch (status.toLowerCase()) {
      case 'hidden':
        return PrismaReviewStatus.HIDDEN;
      case 'flagged':
        return PrismaReviewStatus.FLAGGED;
      default:
        return PrismaReviewStatus.PUBLISHED;
    }
  }

  private mapIncidentStatus(status: string): PrismaDisputeStatus {
    const normalized = status.toUpperCase() as PrismaDisputeStatus;
    if (
      ['OPEN', 'UNDER_REVIEW', 'ACTION_REQUIRED', 'REFUNDED', 'RESOLVED', 'REJECTED'].includes(
        normalized
      )
    ) {
      return normalized;
    }
    return PrismaDisputeStatus.OPEN;
  }

  private formatName(entity: { firstName?: string | null; lastName?: string | null }): string {
    return [entity.firstName, entity.lastName].filter(Boolean).join(' ').trim() || '—';
  }
}
