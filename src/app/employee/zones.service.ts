import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  type AdminPostalZonesResponse,
  type AdminZoneCoverageResponse,
  type AdminProviderServiceAreasResponse,
  type AdminZoneMatchingRulesResponse,
  type AdminMatchingTestResponse,
  SERVICE_CATALOG,
  type ServiceCategory,
  type ProviderType,
} from '@saubio/models';
import { PrismaService } from '../../prisma/prisma.service';
import { PostalCodeService } from '../geocoding/postal-code.service';
import type { PostalZonesQueryDto } from './dto/postal-zones-query.dto';
import type { ProviderServiceAreasQueryDto } from './dto/provider-service-areas-query.dto';
import type { MatchingTestDto } from './dto/matching-test.dto';
import { BookingMatchingService } from '../bookings/booking-matching.service';
import { DateTime } from 'luxon';

@Injectable()
export class EmployeeZonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly postalCodes: PostalCodeService,
    private readonly matching: BookingMatchingService
  ) {}

  listZones(params: PostalZonesQueryDto): AdminPostalZonesResponse {
    const entries = this.postalCodes.listEntries();
    const filtered = entries.filter((entry) => {
      if (params.postalCode && !entry.postalCode.startsWith(params.postalCode.trim())) {
        return false;
      }
      if (params.city && !entry.city.toLowerCase().includes(params.city.toLowerCase())) {
        return false;
      }
      if (params.search) {
        const needle = params.search.toLowerCase();
        const haystacks = [entry.city, entry.area ?? '', entry.postalCode];
        if (!haystacks.some((value) => value?.toLowerCase().includes(needle))) {
          return false;
        }
      }
      return true;
    });

    const page = params.page;
    const pageSize = params.pageSize;
    const offset = (page - 1) * pageSize;
    const slice = filtered.slice(offset, offset + pageSize);

    return {
      summary: {
        totalZones: entries.length,
        filteredZones: filtered.length,
      },
      items: slice.map((entry) => ({
        postalCode: entry.postalCode,
        city: entry.city,
        area: entry.area ?? null,
        state: entry.state ?? null,
        countryCode: 'DE',
        active: true,
        notes: null,
      })),
      page,
      pageSize,
      total: filtered.length,
    };
  }

  async zoneCoverage(): Promise<AdminZoneCoverageResponse> {
    const [providerCounts, bookingCounts] = await Promise.all([
      this.prisma.providerServiceZone.groupBy({
        by: ['postalCode', 'city'],
        _count: { _all: true },
      }),
      this.prisma.booking.groupBy({
        by: ['addressPostalCode', 'addressCity'],
        where: {
          startAt: { gte: DateTime.utc().minus({ days: 30 }).toJSDate() },
        },
        _count: { _all: true },
      }),
    ]);

    const bookingMap = new Map<string, number>();
    for (const entry of bookingCounts) {
      const key = `${entry.addressPostalCode ?? ''}`;
      bookingMap.set(key, entry._count?._all ?? 0);
    }

    const items = providerCounts
      .filter((entry) => entry.postalCode)
      .map((entry) => {
        const providerCount = entry._count?._all ?? 0;
        const bookingsLast30 = bookingMap.get(entry.postalCode!) ?? 0;
        const ratio = providerCount > 0 ? bookingsLast30 / providerCount : bookingsLast30;
        const status = this.resolveCoverageStatus(providerCount, ratio);
        return {
          postalCode: entry.postalCode!,
          city: entry.city ?? '',
          providerCount,
          bookingsLast30Days: bookingsLast30,
          ratio,
          status,
        };
      })
      .sort((a, b) => b.bookingsLast30Days - a.bookingsLast30Days);

    return {
      generatedAt: new Date().toISOString(),
      items,
    };
  }

  async providerServiceAreas(query: ProviderServiceAreasQueryDto): Promise<AdminProviderServiceAreasResponse> {
    const where: Prisma.ProviderProfileWhereInput = {};
    if (query.search) {
      where.OR = [
        { user: { firstName: { contains: query.search, mode: 'insensitive' } } },
        { user: { lastName: { contains: query.search, mode: 'insensitive' } } },
        { user: { email: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    if (query.service) {
      where.serviceCategories = { has: query.service };
    }

    const page = query.page;
    const pageSize = query.pageSize;

    const [total, providers] = await Promise.all([
      this.prisma.providerProfile.count({ where }),
      this.prisma.providerProfile.findMany({
        where,
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
          serviceZones: true,
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const items = providers.map((provider) => (
      {
        providerId: provider.id,
        providerName: this.composeName(provider.user.firstName, provider.user.lastName, provider.user.email),
        providerEmail: provider.user.email,
        basePostalCode: provider.addressPostalCode ?? null,
        baseCity: provider.addressCity ?? null,
        serviceAreas: provider.serviceAreas ?? [],
        serviceCategories: (provider.serviceCategories ?? []) as ServiceCategory[],
        serviceZones: provider.serviceZones.map((zone) => ({
          id: zone.id,
          name: zone.name,
          postalCode: zone.postalCode ?? undefined,
          city: zone.city ?? undefined,
          district: zone.district ?? undefined,
        })),
        updatedAt: provider.updatedAt.toISOString(),
      }
    ));

    return {
      items,
      page,
      pageSize,
      total,
    };
  }

  async matchingRules(): Promise<AdminZoneMatchingRulesResponse> {
    const config = await this.matching.getMatchingConfig();
    return {
      defaults: {
        distanceMaxKm: config.distanceMaxKm,
        weights: config.weights,
        teamBonus: config.teamBonus,
      },
      overrides: [],
    };
  }

  async matchingTest(payload: MatchingTestDto): Promise<AdminMatchingTestResponse> {
    const postalLookup = this.postalCodes.lookup(payload.postalCode);
    const city = payload.city ?? postalLookup?.city;
    const startAt = new Date(payload.startAt);
    const endAt = new Date(payload.endAt);
    const candidates = await this.matching.previewScores(
      {
        service: payload.service,
        ecoPreference: payload.ecoPreference ?? 'standard',
        startAt,
        endAt,
        city: city ?? undefined,
      },
      20
    );

    // Preload provider meta for service areas/zones
    const providerIds = candidates.map((candidate) => candidate.providerId);
    const providerMeta = await this.prisma.providerProfile.findMany({
      where: { id: { in: providerIds } },
      select: {
        id: true,
        serviceAreas: true,
        serviceZones: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    const metaMap = new Map(providerMeta.map((entry) => [entry.id, entry]));

    const enriched = candidates.map((candidate) => {
      const provider = metaMap.get(candidate.providerId);
      const components = Object.fromEntries(Object.entries(candidate.components)) as Record<string, number>;
      const metadata = {
        ...candidate.metadata,
        providerType: (candidate.metadata.providerType?.toLowerCase() as ProviderType) ?? 'freelancer',
      };
      return {
        providerId: candidate.providerId,
        providerName: provider
          ? this.composeName(provider.user.firstName, provider.user.lastName, provider.user.email)
          : candidate.providerId,
        providerEmail: provider?.user.email ?? '',
        score: candidate.score,
        rank: candidate.rank,
        components,
        metadata,
        serviceAreas: provider?.serviceAreas ?? [],
        serviceZones:
          provider?.serviceZones.map((zone) => ({
            id: zone.id,
            name: zone.name,
            postalCode: zone.postalCode ?? undefined,
            city: zone.city ?? undefined,
            district: zone.district ?? undefined,
          })) ?? [],
      };
    });

    return {
      query: {
        postalCode: payload.postalCode,
        city: city ?? undefined,
        service: payload.service,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        ecoPreference: payload.ecoPreference ?? 'standard',
        requiredProviders: payload.requiredProviders ?? 1,
      },
      candidates: enriched,
      summary: {
        totalCandidates: enriched.length,
        distanceMaxKm: (await this.matching.getMatchingConfig()).distanceMaxKm,
      },
    };
  }

  private resolveCoverageStatus(providerCount: number, ratio: number) {
    if (providerCount === 0) {
      return 'none' as const;
    }
    if (ratio >= 6) {
      return 'low' as const;
    }
    if (ratio <= 2) {
      return 'surplus' as const;
    }
    return 'balanced' as const;
  }

  private composeName(firstName?: string | null, lastName?: string | null, fallback?: string) {
    const full = `${firstName ?? ''} ${lastName ?? ''}`.trim();
    return full || fallback || 'Prestataire';
  }
}
