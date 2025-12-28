import { BadRequestException, Injectable } from '@nestjs/common';
import {
  SERVICE_CATALOG,
  type AdminServiceCatalogResponse,
  type AdminServiceOptionsResponse,
  type AdminServicePricingMatrixResponse,
  type AdminServicePricingRulesResponse,
  type AdminServicePreviewResponse,
  type AdminServiceHabilitationsResponse,
  type AdminServiceLogsResponse,
  type DocumentReference,
  type DocumentReviewStatus,
  type DocumentType,
  type ServiceCategory,
} from '@saubio/models';
import { PrismaService } from '../../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import type { ServicePreviewQueryDto } from './dto/service-preview.dto';

type ProviderRateStats = {
  total: number;
  active: number;
  rateSum: number;
  rateCount: number;
  min?: number;
  max?: number;
};

@Injectable()
export class EmployeeServicesService {
  constructor(private readonly prisma: PrismaService, private readonly pricingService: PricingService) {}

  async getCatalog(): Promise<AdminServiceCatalogResponse> {
    const [providers, bookingStats] = await Promise.all([
      this.prisma.providerProfile.findMany({
        select: {
          id: true,
          serviceCategories: true,
          hourlyRateCents: true,
          onboardingStatus: true,
          user: { select: { isActive: true } },
        },
      }),
      this.prisma.booking.groupBy({
        by: ['service'],
        _count: { _all: true },
        _max: { startAt: true },
      }),
    ]);

    const providerStats = new Map<string, ProviderRateStats>();
    const providerIds = new Set<string>();

    for (const provider of providers) {
      providerIds.add(provider.id);
      const providerActive = this.isProviderActive(provider.onboardingStatus, provider.user.isActive);
      for (const rawCategory of provider.serviceCategories ?? []) {
        const category = this.normalizeService(rawCategory);
        if (!category) {
          continue;
        }
        const stats = providerStats.get(category) ?? {
          total: 0,
          active: 0,
          rateSum: 0,
          rateCount: 0,
        };
        stats.total += 1;
        if (providerActive) {
          stats.active += 1;
        }
        if (provider.hourlyRateCents && provider.hourlyRateCents > 0) {
          stats.rateSum += provider.hourlyRateCents;
          stats.rateCount += 1;
          stats.min =
            typeof stats.min === 'number' ? Math.min(stats.min, provider.hourlyRateCents) : provider.hourlyRateCents;
          stats.max =
            typeof stats.max === 'number' ? Math.max(stats.max, provider.hourlyRateCents) : provider.hourlyRateCents;
        }
        providerStats.set(category, stats);
      }
    }

    const bookingMap = new Map<ServiceCategory, { count: number; lastAt: Date | null }>();
    let totalBookings = 0;
    for (const item of bookingStats) {
      const serviceId = this.normalizeService(item.service);
      if (!serviceId) continue;
      const count = item._count?._all ?? 0;
      totalBookings += count;
      bookingMap.set(serviceId, { count, lastAt: item._max?.startAt ?? null });
    }

    const services = SERVICE_CATALOG.map((service) => {
      const stats = providerStats.get(service.id);
      const bookings = bookingMap.get(service.id);
      const avgHourly =
        stats && stats.rateCount > 0 ? Math.round(stats.rateSum / stats.rateCount) : null;
      return {
        id: service.id,
        title: service.title,
        description: service.description,
        includedOptions: service.includedOptions,
        providerCount: stats?.total ?? 0,
        activeProviderCount: stats?.active ?? 0,
        avgHourlyRateCents: avgHourly,
        minHourlyRateCents: stats?.rateCount ? stats.min ?? null : null,
        maxHourlyRateCents: stats?.rateCount ? stats.max ?? null : null,
        bookingsCount: bookings?.count ?? 0,
        lastBookingAt: bookings?.lastAt?.toISOString() ?? null,
        active: (stats?.total ?? 0) > 0 || (bookings?.count ?? 0) > 0,
      };
    });

    const serviceSummary = {
      totalServices: services.length,
      servicesWithProviders: services.filter((service) => service.providerCount > 0).length,
      totalProviders: providerIds.size,
      totalBookings,
      averageHourlyRateCents: this.calculateGlobalAverageRate(providerStats),
    };

    return { summary: serviceSummary, services };
  }

  async getOptions(): Promise<AdminServiceOptionsResponse> {
    const options = SERVICE_CATALOG.flatMap((service) =>
      service.includedOptions.map((label, index) => ({
        id: `${service.id}-${index}`,
        serviceId: service.id,
        label,
        description: null,
        priceImpactType: 'included' as const,
        active: true,
      }))
    );
    return {
      summary: {
        totalOptions: options.length,
        servicesCovered: SERVICE_CATALOG.filter((service) => service.includedOptions.length > 0).length,
      },
      options,
    };
  }

  async getPricingMatrix(): Promise<AdminServicePricingMatrixResponse> {
    const [providers, bookings] = await Promise.all([
      this.prisma.providerProfile.findMany({
        select: {
          id: true,
          serviceCategories: true,
          hourlyRateCents: true,
          onboardingStatus: true,
          user: { select: { isActive: true } },
        },
      }),
      this.prisma.booking.groupBy({
        by: ['service'],
        _avg: { durationHours: true },
        _count: { _all: true },
        _max: { updatedAt: true },
      }),
    ]);

    const providerStats = new Map<string, ProviderRateStats>();
    for (const provider of providers) {
      const providerActive = this.isProviderActive(provider.onboardingStatus, provider.user.isActive);
      for (const rawCategory of provider.serviceCategories ?? []) {
        const category = this.normalizeService(rawCategory);
        if (!category) continue;
        const stats = providerStats.get(category) ?? {
          total: 0,
          active: 0,
          rateSum: 0,
          rateCount: 0,
        };
        stats.total += 1;
        if (providerActive) {
          stats.active += 1;
        }
        if (provider.hourlyRateCents && provider.hourlyRateCents > 0) {
          stats.rateSum += provider.hourlyRateCents;
          stats.rateCount += 1;
          stats.min =
            typeof stats.min === 'number' ? Math.min(stats.min, provider.hourlyRateCents) : provider.hourlyRateCents;
          stats.max =
            typeof stats.max === 'number' ? Math.max(stats.max, provider.hourlyRateCents) : provider.hourlyRateCents;
        }
        providerStats.set(category, stats);
      }
    }

    const bookingMap = new Map<ServiceCategory, { avgDuration: number | null; count: number; updatedAt: string | null }>();
    for (const entry of bookings) {
      const serviceId = this.normalizeService(entry.service);
      if (!serviceId) continue;
      const avgDuration =
        entry._avg?.durationHours !== null && entry._avg?.durationHours !== undefined
          ? Number(entry._avg.durationHours)
          : null;
      bookingMap.set(serviceId, {
        avgDuration,
        count: entry._count?._all ?? 0,
        updatedAt: entry._max?.updatedAt?.toISOString() ?? null,
      });
    }

    const rows = SERVICE_CATALOG.map((service) => {
      const stats = providerStats.get(service.id);
      const bookingInfo = bookingMap.get(service.id);
      const avg =
        stats && stats.rateCount > 0 ? Math.round(stats.rateSum / stats.rateCount) : null;
      return {
        serviceId: service.id,
        serviceName: service.title,
        providerCount: stats?.total ?? 0,
        activeProviderCount: stats?.active ?? 0,
        avgHourlyRateCents: avg,
        minHourlyRateCents: stats?.rateCount ? stats.min ?? null : null,
        maxHourlyRateCents: stats?.rateCount ? stats.max ?? null : null,
        avgDurationHours: bookingInfo?.avgDuration ?? null,
        bookingsCount: bookingInfo?.count ?? 0,
        lastUpdatedAt: bookingInfo?.updatedAt ?? null,
      };
    });

    return { rows };
  }

  async getPricingRules(): Promise<AdminServicePricingRulesResponse> {
    const rules = await this.prisma.pricingRule.findMany({
      orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }],
    });

    return {
      rules: rules.map((rule) => ({
        id: rule.id,
        code: rule.code,
        type: rule.type,
        audience: rule.audience,
        description: rule.description,
        amountCents: rule.amountCents ?? null,
        percentageBps: rule.percentageBps ?? null,
        multiplier: rule.multiplier ?? null,
        minSquareMeters: rule.minSquareMeters ?? null,
        maxSquareMeters: rule.maxSquareMeters ?? null,
        isActive: rule.isActive,
        priority: rule.priority,
        createdAt: rule.createdAt.toISOString(),
        updatedAt: rule.updatedAt.toISOString(),
      })),
    };
  }

  async previewQuote(query: ServicePreviewQueryDto): Promise<AdminServicePreviewResponse> {
    const serviceId = this.normalizeService(query.service);
    if (!serviceId) {
      throw new BadRequestException('UNKNOWN_SERVICE');
    }
    const hours = Number.isFinite(query.hours) && query.hours > 0 ? query.hours : 3;
    const estimate = await this.pricingService.estimateLocalRates({
      service: serviceId,
      postalCode: query.postalCode,
      hours,
    });

    return {
      service: serviceId,
      postalCode: query.postalCode,
      hours,
      ecoPreference: (query.ecoPreference ?? 'standard') as 'standard' | 'bio',
      estimate,
    };
  }

  async getHabilitations(): Promise<AdminServiceHabilitationsResponse> {
    const [providers, missionCounts] = await Promise.all([
      this.prisma.providerProfile.findMany({
        select: {
          id: true,
          serviceCategories: true,
          onboardingStatus: true,
          identityVerificationStatus: true,
          payoutActivationStatus: true,
          payoutReady: true,
          ratingAverage: true,
          ratingCount: true,
          updatedAt: true,
          user: { select: { firstName: true, lastName: true, email: true } },
          documents: {
            select: {
              id: true,
              type: true,
              url: true,
              name: true,
              createdAt: true,
              reviewStatus: true,
              reviewNotes: true,
              reviewedAt: true,
              reviewerId: true,
            },
          },
          bookings: {
            select: {
              booking: { select: { id: true, startAt: true, service: true } },
            },
            orderBy: { booking: { startAt: 'desc' } },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.bookingAssignment.groupBy({
        by: ['providerId'],
        _count: { _all: true },
      }),
    ]);

    const missionMap = new Map<string, number>();
    for (const entry of missionCounts) {
      missionMap.set(entry.providerId, entry._count?._all ?? 0);
    }

    const items: AdminServiceHabilitationsResponse['items'] = [];
    const servicesCovered = new Set<ServiceCategory>();

    for (const provider of providers) {
      const providerName = this.composeProviderName(provider.user.firstName, provider.user.lastName, provider.user.email);
      const documents = provider.documents.map((doc) => this.mapDocumentReference(doc));
      const lastMissionAt = provider.bookings[0]?.booking?.startAt?.toISOString() ?? null;

      for (const rawCategory of provider.serviceCategories ?? []) {
        const serviceId = this.normalizeService(rawCategory);
        if (!serviceId) continue;
        servicesCovered.add(serviceId);
        const serviceMeta = SERVICE_CATALOG.find((svc) => svc.id === serviceId);
        items.push({
          providerId: provider.id,
          providerName,
          providerEmail: provider.user.email,
          serviceId,
          serviceName: serviceMeta?.title ?? serviceId,
          onboardingStatus: provider.onboardingStatus,
          identityStatus: provider.identityVerificationStatus,
          payoutStatus: provider.payoutActivationStatus,
          payoutReady: provider.payoutReady ?? false,
          ratingAverage: provider.ratingAverage ?? null,
          ratingCount: provider.ratingCount ?? null,
          missionsCompleted: missionMap.get(provider.id) ?? 0,
          lastMissionAt,
          documents,
        });
      }
    }

    const summary = {
      totalProviders: providers.length,
      verifiedProviders: providers.filter((provider) => provider.identityVerificationStatus === 'VERIFIED').length,
      payoutReadyProviders: providers.filter((provider) => provider.payoutActivationStatus?.toLowerCase() === 'active').length,
      servicesCovered: servicesCovered.size,
    };

    return { summary, items };
  }

  async getServiceLogs(): Promise<AdminServiceLogsResponse> {
    const [pricingRules, providerUpdates, documentEvents] = await Promise.all([
      this.prisma.pricingRule.findMany({ orderBy: { updatedAt: 'desc' }, take: 25 }),
      this.prisma.providerProfile.findMany({
        select: {
          id: true,
          updatedAt: true,
          serviceCategories: true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 25,
      }),
      this.prisma.document.findMany({
        where: { providerId: { not: null } },
        select: {
          id: true,
          type: true,
          createdAt: true,
          updatedAt: true,
          reviewStatus: true,
          provider: { select: { user: { select: { firstName: true, lastName: true, email: true } } } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 25,
      }),
    ]);

    const logs: AdminServiceLogsResponse['logs'] = [];

    for (const rule of pricingRules) {
      logs.push({
        id: `pricing-${rule.id}`,
        timestamp: rule.updatedAt.toISOString(),
        category: 'pricing' as const,
        actor: 'Saubio Pricing',
        message: `${rule.isActive ? 'Règle active' : 'Règle désactivée'} : ${rule.code} ${rule.description ? `(${rule.description})` : ''}`.trim(),
      });
    }

    for (const provider of providerUpdates) {
      const providerName = this.composeProviderName(provider.user.firstName, provider.user.lastName, provider.user.email);
      const services = (provider.serviceCategories ?? [])
        .map((raw) => this.normalizeService(raw))
        .filter((value): value is ServiceCategory => Boolean(value))
        .map((serviceId) => SERVICE_CATALOG.find((svc) => svc.id === serviceId)?.title ?? serviceId);
      if (services.length === 0) {
        continue;
      }
      logs.push({
        id: `provider-${provider.id}-${provider.updatedAt.getTime()}`,
        timestamp: provider.updatedAt.toISOString(),
        category: 'service' as const,
        actor: providerName,
        message: `Services actifs : ${services.slice(0, 4).join(', ')}${services.length > 4 ? '…' : ''}`,
      });
    }

    for (const doc of documentEvents) {
      const actor = this.composeProviderName(
        doc.provider?.user.firstName,
        doc.provider?.user.lastName,
        doc.provider?.user.email
      );
      const reviewStatus = doc.reviewStatus ? this.mapDocumentReviewStatus(doc.reviewStatus) : undefined;
      const statusLabel = reviewStatus ? `(${reviewStatus})` : '';
      logs.push({
        id: `document-${doc.id}`,
        timestamp: (doc.updatedAt ?? doc.createdAt).toISOString(),
        category: 'document' as const,
        actor,
        message: `Document ${this.mapDocumentType(doc.type)} ${statusLabel}`.trim(),
      });
    }

    logs.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

    return { logs: logs.slice(0, 40) };
  }

  private isProviderActive(onboardingStatus?: string | null, isActive = false) {
    if (!isActive || !onboardingStatus) {
      return false;
    }
    const normalized = onboardingStatus.toLowerCase();
    return ['ready', 'approved', 'active', 'enabled'].includes(normalized);
  }

  private normalizeService(value?: string | null): ServiceCategory | undefined {
    if (!value) return undefined;
    const normalized = value.toLowerCase().trim();
    return SERVICE_CATALOG.some((service) => service.id === normalized)
      ? (normalized as ServiceCategory)
      : undefined;
  }

  private calculateGlobalAverageRate(stats: Map<string, ProviderRateStats>): number | null {
    let sum = 0;
    let count = 0;
    for (const entry of stats.values()) {
      sum += entry.rateSum;
      count += entry.rateCount;
    }
    return count > 0 ? Math.round(sum / count) : null;
  }

  private composeProviderName(firstName?: string | null, lastName?: string | null, fallback?: string): string {
    const full = `${firstName ?? ''} ${lastName ?? ''}`.trim();
    return full || fallback || 'Prestataire';
  }

  private mapDocumentType(value?: string | null): DocumentType {
    switch ((value ?? '').toUpperCase()) {
      case 'IDENTITY':
        return 'identity';
      case 'INSURANCE':
        return 'insurance';
      case 'TAX':
        return 'tax';
      case 'CONTRACT':
        return 'contract';
      case 'CHECKLIST':
        return 'checklist';
      case 'PHOTO_BEFORE':
        return 'photo_before';
      case 'PHOTO_AFTER':
        return 'photo_after';
      case 'PROFILE_PHOTO':
        return 'profile_photo';
      case 'INVOICE':
        return 'invoice';
      default:
        return 'other';
    }
  }

  private mapDocumentReviewStatus(value?: string | null): DocumentReviewStatus {
    switch ((value ?? '').toUpperCase()) {
      case 'APPROVED':
        return 'approved';
      case 'REJECTED':
        return 'rejected';
      case 'UNDER_REVIEW':
        return 'under_review';
      default:
        return 'pending';
    }
  }

  private mapDocumentReference(doc: {
    id: string;
    type: string;
    url: string;
    name: string | null;
    createdAt: Date;
    reviewStatus: string | null;
    reviewNotes: string | null;
    reviewedAt: Date | null;
    reviewerId: string | null;
  }): DocumentReference {
    return {
      id: doc.id,
      type: this.mapDocumentType(doc.type),
      url: doc.url,
      uploadedAt: doc.createdAt.toISOString(),
      name: doc.name ?? undefined,
      reviewStatus: this.mapDocumentReviewStatus(doc.reviewStatus),
      reviewNotes: doc.reviewNotes ?? undefined,
      reviewedAt: doc.reviewedAt?.toISOString(),
      reviewerId: doc.reviewerId ?? undefined,
    };
  }
}
