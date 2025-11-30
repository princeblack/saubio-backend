import { Injectable, Logger } from '@nestjs/common';
import type { AddressSuggestion, PriceEstimate, PriceEstimateParams } from '@saubio/models';
import { EcoPreference } from '@saubio/models';
import {
  LoyaltyBalance as PrismaLoyaltyBalance,
  LoyaltyTransactionType,
  PricingRule,
  PricingRuleAudience,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GeocodingService } from '../geocoding/geocoding.service';

type PricingQuoteInput = {
  surfacesSquareMeters: number;
  ecoPreference: EcoPreference;
  clientId?: string | null;
  currency?: string;
};

type FinalizeLoyaltyInput = {
  bookingId: string;
  clientId?: string | null;
  paymentId?: string;
  loyaltyCreditsCents: number;
  paidAmountCents: number;
  currency?: string;
};

type PricingRuleMap = Map<string, PricingRule>;
type ProviderZoneWithProvider = Prisma.ProviderServiceZoneGetPayload<{
  include: {
    provider: {
      select: {
        id: true;
        hourlyRateCents: true;
        serviceCategories: true;
      };
    };
  };
}>;

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);
  private cachedRules: { expiresAt: number; rules: PricingRuleMap } | null = null;
  private static readonly RULE_CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly geocoding: GeocodingService
  ) {}

  async getPublicConfig() {
    const rules = await this.loadRuleMap();
    return {
      currency: 'EUR',
      baseRatePerSquareMeterCents: this.resolveAmount(rules, 'BASE_RATE_M2', 250),
      ecoSurchargeBps: this.resolvePercentage(rules, 'ECO_BIO_BPS', 1500),
      loyaltyValuePerPointCents: this.resolveAmount(rules, 'LOYALTY_VALUE_PER_POINT', 10),
      loyaltyEarnPointsPerEuro: this.resolveMultiplier(rules, 'LOYALTY_EARN_PER_EURO', 1.5),
      loyaltyMaxRedeemBps: this.resolvePercentage(rules, 'LOYALTY_MAX_REDEEM_BPS', 2000),
    };
  }

  async getLoyaltyBalance(userId: string) {
    const config = await this.getPublicConfig();
    const balance = await this.getOrCreateBalance(userId);
    return {
      points: balance.points,
      lifetimeEarned: balance.lifetimeEarned,
      lifetimeRedeemed: balance.lifetimeRedeemed,
      pointsValueCents: balance.points * config.loyaltyValuePerPointCents,
      currency: config.currency,
      lastEarnedAt: balance.lastEarnedAt?.toISOString() ?? null,
      lastRedeemedAt: balance.lastRedeemedAt?.toISOString() ?? null,
    };
  }

  async calculateQuote(input: PricingQuoteInput) {
    const rules = await this.getPublicConfig();
    const baseRate = rules.baseRatePerSquareMeterCents;
    const ecoSurchargeBps = rules.ecoSurchargeBps;
    const subtotal = Math.round(input.surfacesSquareMeters * baseRate);
    const ecoSurcharge =
      input.ecoPreference === 'bio' ? Math.round((subtotal * ecoSurchargeBps) / 10_000) : 0;
    const extras = 0;
    const taxableBase = subtotal + ecoSurcharge + extras;
    const tax = Math.round(taxableBase * 0.19);

    let loyaltyCreditsCents = 0;
    if (input.clientId) {
      const preview = await this.previewLoyaltyRedemption({
        clientId: input.clientId,
        rules,
        targetCents: taxableBase,
      });
      loyaltyCreditsCents = preview.creditsCents;
    }

    return {
      subtotalCents: subtotal,
      ecoSurchargeCents: ecoSurcharge,
      loyaltyCreditsCents,
      extrasCents: extras,
      taxCents: tax,
      currency: (input.currency ?? 'EUR').toUpperCase() as 'EUR',
      totalCents: subtotal + ecoSurcharge + extras - loyaltyCreditsCents + tax,
    };
  }

  async estimateLocalRates(params: PriceEstimateParams): Promise<PriceEstimate> {
    const normalizedPostal = params.postalCode?.trim();
    const hours = this.normalizeHours(params.hours);
    if (!normalizedPostal) {
      return this.buildEstimateResponse({
        postalCode: '',
        hours,
        service: params.service,
        providersConsidered: 0,
      });
    }

    const suggestions = await this.geocoding.suggest(normalizedPostal);
    const location = this.pickMatchingSuggestion(suggestions, normalizedPostal);
    if (!location) {
      return this.buildEstimateResponse({
        postalCode: normalizedPostal,
        hours,
        service: params.service,
        providersConsidered: 0,
      });
    }

    const targetCoords =
      typeof location.latitude === 'number' && typeof location.longitude === 'number'
        ? { latitude: location.latitude, longitude: location.longitude }
        : null;

    const potentialZones = await this.prisma.providerServiceZone.findMany({
      where: {
        provider: {
          onboardingStatus: 'ready',
          hourlyRateCents: { gt: 0 },
        },
      },
      include: {
        provider: {
          select: {
            id: true,
            hourlyRateCents: true,
            serviceCategories: true,
          },
        },
      },
    });

    const normalizedPostalKey = this.normalizePostalCode(normalizedPostal);
    const providerRates = new Map<string, number>();
    for (const zone of potentialZones) {
      if (!zone.provider?.hourlyRateCents) {
        continue;
      }
      if (params.service && !zone.provider.serviceCategories.includes(params.service)) {
        continue;
      }
      if (
        this.zoneMatchesLocation(zone, normalizedPostalKey, location, targetCoords) &&
        !providerRates.has(zone.provider.id)
      ) {
        providerRates.set(zone.provider.id, zone.provider.hourlyRateCents);
      }
    }

    const hourlyRates = Array.from(providerRates.values()).sort((a, b) => a - b);
    const minHourly = hourlyRates.length ? hourlyRates[0] : null;
    const maxHourly = hourlyRates.length ? hourlyRates[hourlyRates.length - 1] : null;

    return this.buildEstimateResponse({
      postalCode: normalizedPostal,
      service: params.service,
      hours,
      minHourlyRateCents: minHourly,
      maxHourlyRateCents: maxHourly,
      providersConsidered: hourlyRates.length,
      location,
    });
  }

  async finalizeBookingLoyalty(payload: FinalizeLoyaltyInput) {
    if (!payload.clientId) {
      return;
    }

    const rules = await this.getPublicConfig();
    const redemptionValue = rules.loyaltyValuePerPointCents;
    const earnRate = rules.loyaltyEarnPointsPerEuro;
    if (!redemptionValue && !earnRate) {
      return;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const balance = await this.getOrCreateBalance(payload.clientId!, tx);
        const now = new Date();
        let latestPoints = balance.points;
        const balanceId = balance.id;

        if (payload.loyaltyCreditsCents > 0 && redemptionValue > 0) {
          const redeemablePoints = Math.min(
            latestPoints,
            Math.floor(payload.loyaltyCreditsCents / redemptionValue)
          );
          if (redeemablePoints > 0) {
            await tx.loyaltyTransaction.create({
              data: {
                balance: { connect: { id: balanceId } },
                type: LoyaltyTransactionType.REDEEM,
                points: redeemablePoints,
                booking: { connect: { id: payload.bookingId } },
                payment: payload.paymentId ? { connect: { id: payload.paymentId } } : undefined,
                metadata: {
                  creditsAppliedCents: redeemablePoints * redemptionValue,
                  currency: payload.currency ?? 'EUR',
                },
              },
            });
            await tx.loyaltyBalance.update({
              where: { id: balanceId },
              data: {
                points: { decrement: redeemablePoints },
                lifetimeRedeemed: { increment: redeemablePoints },
                lastRedeemedAt: now,
              },
            });
            latestPoints -= redeemablePoints;
          }
        }

        const earnedPoints =
          earnRate > 0 ? Math.floor((payload.paidAmountCents / 100) * earnRate) : 0;
        if (earnedPoints > 0) {
          await tx.loyaltyTransaction.create({
            data: {
              balance: { connect: { id: balanceId } },
              type: LoyaltyTransactionType.EARN,
              points: earnedPoints,
              booking: { connect: { id: payload.bookingId } },
              payment: payload.paymentId ? { connect: { id: payload.paymentId } } : undefined,
              metadata: { currency: payload.currency ?? 'EUR', source: 'capture' },
            },
          });
          await tx.loyaltyBalance.update({
            where: { id: balanceId },
            data: {
              points: { increment: earnedPoints },
              lifetimeEarned: { increment: earnedPoints },
              lastEarnedAt: now,
            },
          });
          latestPoints += earnedPoints;
        }

        await tx.clientProfile.updateMany({
          where: { userId: payload.clientId },
          data: { loyaltyPoints: latestPoints },
        });
      });
    } catch (error) {
      this.logger.warn(
        `Unable to finalize loyalty for booking ${payload.bookingId}: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  }

  private async previewLoyaltyRedemption(params: {
    clientId: string;
    rules: Awaited<ReturnType<typeof this.getPublicConfig>>;
    targetCents: number;
  }) {
    const balance = await this.getOrCreateBalance(params.clientId);
    const redemptionValue = params.rules.loyaltyValuePerPointCents;
    if (!redemptionValue) {
      return { creditsCents: 0, pointsToRedeem: 0 };
    }
    const percentCap = params.rules.loyaltyMaxRedeemBps;
    const maxCreditsByCap = Math.round((params.targetCents * percentCap) / 10_000);
    const maxCreditsByBalance = balance.points * redemptionValue;
    const creditsCents = Math.min(maxCreditsByBalance, maxCreditsByCap);
    const pointsToRedeem = Math.floor(creditsCents / redemptionValue);
    return { creditsCents: pointsToRedeem * redemptionValue, pointsToRedeem };
  }

  private normalizeHours(value: number): number {
    if (!Number.isFinite(value)) {
      return 2;
    }
    const clamped = Math.min(Math.max(value, 1), 12);
    return Math.round(clamped * 2) / 2;
  }

  private buildEstimateResponse(params: {
    postalCode: string;
    hours: number;
    service?: string;
    minHourlyRateCents?: number | null;
    maxHourlyRateCents?: number | null;
    providersConsidered: number;
    location?: AddressSuggestion | null;
  }): PriceEstimate {
    const minHourly = params.minHourlyRateCents ?? null;
    const maxHourly = params.maxHourlyRateCents ?? null;
    const minTotal = minHourly ? Math.round(minHourly * params.hours) : null;
    const maxTotal = maxHourly ? Math.round(maxHourly * params.hours) : null;
    return {
      postalCode: params.postalCode,
      service: params.service as PriceEstimate['service'],
      hours: params.hours,
      minHourlyRateCents: minHourly,
      maxHourlyRateCents: maxHourly,
      minTotalCents: minTotal,
      maxTotalCents: maxTotal,
      providersConsidered: params.providersConsidered,
      currency: 'EUR',
      location: params.location
        ? {
            city: params.location.city,
            district: params.location.district,
            latitude: params.location.latitude,
            longitude: params.location.longitude,
          }
        : undefined,
    };
  }

  private pickMatchingSuggestion(
    suggestions: AddressSuggestion[],
    postalCode: string
  ): AddressSuggestion | null {
    if (!suggestions.length) {
      return null;
    }
    const normalizedPostal = this.normalizePostalCode(postalCode);
    const exact = suggestions.find(
      (suggestion) => this.normalizePostalCode(suggestion.postalCode) === normalizedPostal
    );
    if (exact) {
      return exact;
    }
    const startsWith = suggestions.find((suggestion) =>
      this.normalizePostalCode(suggestion.postalCode).startsWith(normalizedPostal)
    );
    return startsWith ?? suggestions[0];
  }

  private zoneMatchesLocation(
    zone: ProviderZoneWithProvider,
    normalizedPostal: string,
    location: AddressSuggestion | null,
    coordinates: { latitude: number; longitude: number } | null
  ): boolean {
    const zonePostal = zone.postalCode ? this.normalizePostalCode(zone.postalCode) : null;
    if (zonePostal && zonePostal === normalizedPostal) {
      return true;
    }

    const zoneCity = zone.city?.trim().toLowerCase();
    const targetCity = location?.city?.trim().toLowerCase();
    if (zoneCity && targetCity && zoneCity === targetCity) {
      return true;
    }

    const zoneDistrict = zone.district?.trim().toLowerCase();
    const targetDistrict = location?.district?.trim().toLowerCase();
    if (zoneDistrict && targetDistrict && zoneDistrict === targetDistrict) {
      return true;
    }

    if (
      coordinates &&
      typeof zone.latitude === 'number' &&
      typeof zone.longitude === 'number'
    ) {
      const radiusKm = zone.radiusKm ?? 5;
      const distance = this.distanceInKm(
        coordinates.latitude,
        coordinates.longitude,
        zone.latitude,
        zone.longitude
      );
      if (distance <= radiusKm) {
        return true;
      }
    }

    return false;
  }

  private normalizePostalCode(value: string | undefined | null): string {
    if (!value) {
      return '';
    }
    return value.toString().replace(/\s+/g, '').toLowerCase();
  }

  private distanceInKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private async getOrCreateBalance(
    clientId: string,
    tx?: Prisma.TransactionClient
  ): Promise<PrismaLoyaltyBalance> {
    const client = tx ?? this.prisma;
    const existing = await client.loyaltyBalance.findUnique({ where: { clientId } });
    if (existing) {
      return existing;
    }

    const created = await client.loyaltyBalance.create({
      data: {
        client: { connect: { id: clientId } },
        points: 0,
        lifetimeEarned: 0,
        lifetimeRedeemed: 0,
      },
    });

    await client.clientProfile.updateMany({
      where: { userId: clientId },
      data: { loyaltyPoints: created.points },
    });

    return created;
  }

  private async loadRuleMap(): Promise<PricingRuleMap> {
    if (this.cachedRules && this.cachedRules.expiresAt > Date.now()) {
      return this.cachedRules.rules;
    }
    const rules = await this.prisma.pricingRule.findMany({
      where: { isActive: true, audience: PricingRuleAudience.GENERAL },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
    const map: PricingRuleMap = new Map(rules.map((rule) => [rule.code, rule]));
    this.cachedRules = { rules: map, expiresAt: Date.now() + PricingService.RULE_CACHE_TTL_MS };
    return map;
  }

  private resolveAmount(map: PricingRuleMap, code: string, fallback: number) {
    const rule = map.get(code);
    return typeof rule?.amountCents === 'number' ? rule.amountCents : fallback;
  }

  private resolvePercentage(map: PricingRuleMap, code: string, fallback: number) {
    const rule = map.get(code);
    return typeof rule?.percentageBps === 'number' ? rule.percentageBps : fallback;
  }

  private resolveMultiplier(map: PricingRuleMap, code: string, fallback: number) {
    const rule = map.get(code);
    return typeof rule?.multiplier === 'number' ? rule.multiplier : fallback;
  }
}
