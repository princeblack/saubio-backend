import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AdminMarketingLandingPagesResponse,
  AdminMarketingOverviewResponse,
  AdminMarketingSettingsResponse,
  AdminPaginatedResponse,
  AdminPromoCodeDetail,
  AdminPromoCodeListItem,
  AdminPromoCodeStatsResponse,
  AdminPromoCodeUsageRecord,
  BookingStatus,
  MarketingLandingStatus,
} from '@saubio/models';
import { PrismaService } from '../../prisma/prisma.service';
import { PromoCodeService } from '../marketing/promo-code.service';
import {
  MarketingRangeQueryDto,
  PromoCodeListQueryDto,
  PromoCodeMutationDto,
  PromoCodeUsageQueryDto,
} from './dto/admin-marketing.dto';

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_RANGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class EmployeeMarketingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promoCodes: PromoCodeService
  ) {}

  private paginate<T>(items: T[], total: number, page: number, pageSize: number): AdminPaginatedResponse<T> {
    return { items, total, page, pageSize };
  }

  private resolveRange(range?: MarketingRangeQueryDto) {
    const now = new Date();
    const to = range?.to ? new Date(range.to) : now;
    const from = range?.from ? new Date(range.from) : new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);
    return { from, to };
  }

  private toNumber(value?: string, fallback = 0) {
    if (value === undefined || value === null) {
      return fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private mapPromoCode(record: Prisma.PromoCodeGetPayload<{ include: { createdBy: true } }>): AdminPromoCodeDetail {
    return {
      id: record.id,
      code: record.code,
      description: record.description ?? '',
      type: record.type === 'FIXED' ? 'fixed' : 'percent',
      fixedAmountCents: record.fixedAmountCents ?? null,
      percentage: record.percentage ?? null,
      startsAt: record.startsAt ? record.startsAt.toISOString() : null,
      endsAt: record.endsAt ? record.endsAt.toISOString() : null,
      maxTotalUsages: record.maxTotalUsages ?? null,
      maxUsagesPerUser: record.maxUsagesPerUser ?? null,
      minBookingTotalCents: record.minBookingTotalCents ?? null,
      applicableServices: record.applicableServices ?? [],
      applicablePostalCodes: record.applicablePostalCodes ?? [],
      isActive: record.isActive,
      usageCount: record.usageCount ?? 0,
      lastUsedAt: record.lastUsedAt ? record.lastUsedAt.toISOString() : null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      createdBy: record.createdBy
        ? {
            id: record.createdBy.id,
            name: `${record.createdBy.firstName} ${record.createdBy.lastName}`.trim() || record.createdBy.email,
            email: record.createdBy.email,
          }
        : null,
    };
  }

  async getOverview(range?: MarketingRangeQueryDto): Promise<AdminMarketingOverviewResponse> {
    const { from, to } = this.resolveRange(range);

    const [activeCodes, usageAggregates, bookingsCount, recentUsages, timelineRecords] = await Promise.all([
      this.prisma.promoCode.count({ where: { isActive: true } }),
      this.prisma.promoCodeUsage.aggregate({
        _sum: { amountDiscountCents: true },
        where: { createdAt: { gte: from, lte: to } },
      }),
      this.prisma.booking.count({
        where: {
          createdAt: { gte: from, lte: to },
          promoCodeId: { not: null },
        },
      }),
      this.prisma.promoCodeUsage.findMany({
        where: { createdAt: { gte: from, lte: to } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          promoCode: { select: { id: true, code: true } },
          booking: {
            select: {
              id: true,
              service: true,
              addressCity: true,
              addressPostalCode: true,
              pricingTotalCents: true,
              status: true,
            },
          },
          client: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      this.prisma.promoCodeUsage.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { createdAt: true, amountDiscountCents: true, promoCodeId: true },
      }),
    ]);

    const timelineMap = new Map<string, { usages: number; discountCents: number }>();
    const usageByPromo = new Map<string, { count: number; discountCents: number }>();
    timelineRecords.forEach((record) => {
      const key = record.createdAt.toISOString().split('T')[0];
      const timelineEntry = timelineMap.get(key) ?? { usages: 0, discountCents: 0 };
      timelineEntry.usages += 1;
      timelineEntry.discountCents += record.amountDiscountCents;
      timelineMap.set(key, timelineEntry);

      if (!record.promoCodeId) {
        return;
      }
      const aggregate = usageByPromo.get(record.promoCodeId) ?? { count: 0, discountCents: 0 };
      aggregate.count += 1;
      aggregate.discountCents += record.amountDiscountCents;
      usageByPromo.set(record.promoCodeId, aggregate);
    });

    const topUsageGroups = [...usageByPromo.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3);

    const promoIds = topUsageGroups.map(([promoCodeId]) => promoCodeId);
    const promoLookup = promoIds.length
      ? await this.prisma.promoCode.findMany({ where: { id: { in: promoIds } }, select: { id: true, code: true } })
      : [];
    const promoMap = new Map(promoLookup.map((entry) => [entry.id, entry.code]));

    return {
      stats: {
        activePromoCodes: activeCodes,
        bookingsWithPromo: bookingsCount,
        discountGrantedCents: usageAggregates._sum.amountDiscountCents ?? 0,
      },
      topCodes: topUsageGroups.map(([promoCodeId, aggregate]) => ({
        id: promoCodeId,
        code: promoMap.get(promoCodeId) ?? '—',
        usageCount: aggregate.count,
        discountCents: aggregate.discountCents,
      })),
      recentUsages: recentUsages.map((usage) => this.mapUsageRecord(usage)),
      timeline: Array.from(timelineMap.entries()).map(([date, values]) => ({
        date,
        usages: values.usages,
        discountCents: values.discountCents,
      })),
    };
  }

  async listPromoCodes(query: PromoCodeListQueryDto): Promise<AdminPaginatedResponse<AdminPromoCodeListItem>> {
    const page = Math.max(1, this.toNumber(query.page, 1));
    const pageSize = Math.max(1, Math.min(100, this.toNumber(query.pageSize, DEFAULT_PAGE_SIZE)));
    const skip = (page - 1) * pageSize;
    const now = new Date();
    const where: Prisma.PromoCodeWhereInput = {};
    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.status === 'active') {
      where.isActive = true;
      where.OR = [
        { startsAt: null },
        { startsAt: { lte: now } },
      ];
      where.AND = [
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ];
    } else if (query.status === 'inactive') {
      where.isActive = false;
    } else if (query.status === 'expired') {
      where.endsAt = { lt: now };
    } else if (query.status === 'scheduled') {
      where.startsAt = { gt: now };
    }

    const [total, records] = await Promise.all([
      this.prisma.promoCode.count({ where }),
      this.prisma.promoCode.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    const items: AdminPromoCodeListItem[] = records.map((record) => ({
      id: record.id,
      code: record.code,
      description: record.description ?? '',
      type: record.type === 'FIXED' ? 'fixed' : 'percent',
      valueCents: record.type === 'FIXED' ? record.fixedAmountCents ?? 0 : null,
      valuePercent: record.type === 'PERCENT' ? record.percentage ?? 0 : null,
      isActive: record.isActive,
      startsAt: record.startsAt ? record.startsAt.toISOString() : null,
      endsAt: record.endsAt ? record.endsAt.toISOString() : null,
      usageCount: record.usageCount ?? 0,
      maxTotalUsages: record.maxTotalUsages ?? null,
      lastUsedAt: record.lastUsedAt ? record.lastUsedAt.toISOString() : null,
    }));

    return this.paginate(items, total, page, pageSize);
  }

  private buildPromoMutation(dto: PromoCodeMutationDto, actorId: string) {
    const fixedAmount = this.toNumber(dto.fixedAmountCents, 0);
    const percentage = this.toNumber(dto.percentage, 0);
    const payload: Prisma.PromoCodeCreateInput = {
      code: this.promoCodes.normalizeCode(dto.code),
      description: dto.description ?? null,
      type: dto.type === 'fixed' ? 'FIXED' : 'PERCENT',
      fixedAmountCents: dto.type === 'fixed' ? fixedAmount : null,
      percentage: dto.type === 'percent' ? percentage : null,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      maxTotalUsages: dto.maxTotalUsages ? this.toNumber(dto.maxTotalUsages, 0) : null,
      maxUsagesPerUser: dto.maxUsagesPerUser ? this.toNumber(dto.maxUsagesPerUser, 0) : null,
      minBookingTotalCents: dto.minBookingTotalCents ? this.toNumber(dto.minBookingTotalCents, 0) : null,
      applicableServices: dto.applicableServices ?? [],
      applicablePostalCodes: dto.applicablePostalCodes ?? [],
      isActive: dto.isActive ?? true,
      createdBy: { connect: { id: actorId } },
    };
    return payload;
  }

  async createPromoCode(dto: PromoCodeMutationDto, actorId: string): Promise<AdminPromoCodeDetail> {
    const payload = this.buildPromoMutation(dto, actorId);
    const created = await this.prisma.promoCode.create({
      data: payload,
      include: { createdBy: true },
    });
    return this.mapPromoCode(created);
  }

  async updatePromoCode(id: string, dto: PromoCodeMutationDto, actorId: string): Promise<AdminPromoCodeDetail> {
    const existing = await this.prisma.promoCode.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('PROMO_CODE_NOT_FOUND');
    }
    const data = this.buildPromoMutation(dto, actorId);
    const updated = await this.prisma.promoCode.update({
      where: { id },
      data: {
        ...data,
        createdBy: undefined,
      },
      include: { createdBy: true },
    });
    return this.mapPromoCode(updated);
  }

  async getPromoCode(id: string): Promise<AdminPromoCodeDetail> {
    const promo = await this.prisma.promoCode.findUnique({
      where: { id },
      include: { createdBy: true },
    });
    if (!promo) {
      throw new NotFoundException('PROMO_CODE_NOT_FOUND');
    }
    return this.mapPromoCode(promo);
  }

  async updatePromoCodeStatus(id: string, isActive: boolean): Promise<AdminPromoCodeDetail> {
    const updated = await this.prisma.promoCode.update({
      where: { id },
      data: { isActive },
      include: { createdBy: true },
    });
    return this.mapPromoCode(updated);
  }

  async getPromoCodeStats(id: string, range?: MarketingRangeQueryDto): Promise<AdminPromoCodeStatsResponse> {
    const { from, to } = this.resolveRange(range);
    const promo = await this.prisma.promoCode.findUnique({ where: { id }, include: { createdBy: true } });
    if (!promo) {
      throw new NotFoundException('PROMO_CODE_NOT_FOUND');
    }
    const [usageAggregate, usageRecords] = await Promise.all([
      this.prisma.promoCodeUsage.aggregate({
        where: { promoCodeId: id, createdAt: { gte: from, lte: to } },
        _sum: { amountDiscountCents: true },
        _count: { _all: true },
      }),
      this.prisma.promoCodeUsage.findMany({
        where: { promoCodeId: id, createdAt: { gte: from, lte: to } },
        select: {
          clientId: true,
          amountDiscountCents: true,
          createdAt: true,
          booking: { select: { service: true } },
        },
      }),
    ]);

    const timelineMap = new Map<string, { usages: number; discounts: number }>();
    const serviceMap = new Map<string, number>();
    const uniqueClients = new Set<string>();
    usageRecords.forEach((record) => {
      if (record.clientId) {
        uniqueClients.add(record.clientId);
      }
      const dateKey = record.createdAt.toISOString().split('T')[0];
      const entry = timelineMap.get(dateKey) ?? { usages: 0, discounts: 0 };
      entry.usages += 1;
      entry.discounts += record.amountDiscountCents;
      timelineMap.set(dateKey, entry);
      if (record.booking?.service) {
        const serviceKey = record.booking.service;
        serviceMap.set(serviceKey, (serviceMap.get(serviceKey) ?? 0) + 1);
      }
    });

    const usagesByService = Array.from(serviceMap.entries()).map(([service, count]) => ({
      service,
      usages: count,
    }));

    return {
      promoCode: this.mapPromoCode(promo),
      stats: {
        totalUsages: usageAggregate._count._all ?? 0,
        totalDiscountCents: usageAggregate._sum.amountDiscountCents ?? 0,
        uniqueClients: uniqueClients.size,
      },
      timeline: Array.from(timelineMap.entries()).map(([date, values]) => ({
        date,
        usages: values.usages,
        discountCents: values.discounts,
      })),
      services: usagesByService,
    };
  }

  async listPromoCodeUsages(
    id: string,
    query: PromoCodeUsageQueryDto
  ): Promise<AdminPaginatedResponse<AdminPromoCodeUsageRecord>> {
    const page = Math.max(1, this.toNumber(query.page, 1));
    const pageSize = Math.max(1, Math.min(100, this.toNumber(query.pageSize, DEFAULT_PAGE_SIZE)));
    const skip = (page - 1) * pageSize;
    const where: Prisma.PromoCodeUsageWhereInput = { promoCodeId: id };
    const { from, to } = this.resolveRange(query);
    where.createdAt = { gte: from, lte: to };

    const [total, records] = await Promise.all([
      this.prisma.promoCodeUsage.count({ where }),
      this.prisma.promoCodeUsage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          booking: {
            select: {
              id: true,
              status: true,
              service: true,
              addressCity: true,
              addressPostalCode: true,
              pricingTotalCents: true,
            },
          },
          client: { select: { id: true, firstName: true, lastName: true, email: true } },
          promoCode: { select: { id: true, code: true } },
        },
      }),
    ]);

    const items: AdminPromoCodeUsageRecord[] = records.map((record) => this.mapUsageRecord(record));

    return this.paginate(items, total, page, pageSize);
  }

  private async ensureLandingPagesSeeded() {
    const count = await this.prisma.marketingLandingPage.count();
    if (count > 0) {
      return;
    }

    await this.prisma.marketingLandingPage.createMany({
      data: [
        {
          title: 'Ménage étudiant',
          slug: 'menage-etudiant',
          path: '/landing/etudiant',
          status: 'PUBLISHED',
          impressions: 1200,
          conversions: 85,
          leads: 60,
          bounceRate: 0.38,
          seoTitle: 'Ménage étudiant à Berlin',
          seoDescription: 'Service flexible pour logements étudiants.',
          heroTitle: 'Confiez votre appart étudiant',
          heroDescription: 'Des pros qualifiés qui respectent votre budget.',
        },
        {
          title: 'Nettoyage écologique',
          slug: 'nettoyage-eco',
          path: '/landing/eco',
          status: 'PUBLISHED',
          impressions: 950,
          conversions: 72,
          leads: 55,
          bounceRate: 0.32,
          seoTitle: 'Nettoyage écologique',
          seoDescription: 'Produits 100 % bio et équipes formées.',
          heroTitle: 'Optez pour le ménage Öko Plus',
          heroDescription: 'Des prestations premium sans compromis sur la planète.',
        },
        {
          title: 'Après fête',
          slug: 'apres-fete',
          path: '/landing/after-party',
          status: 'DRAFT',
          impressions: 0,
          conversions: 0,
          leads: 0,
          bounceRate: null,
          seoTitle: 'Nettoyage après soirée',
          seoDescription: 'Remise en état express après vos évènements.',
          heroTitle: 'Votre fête, notre mission',
          heroDescription: 'Nous rangeons et désinfectons pendant que vous récupérez.',
        },
      ],
      skipDuplicates: true,
    });
  }

  async getLandingPages(): Promise<AdminMarketingLandingPagesResponse> {
    await this.ensureLandingPagesSeeded();
    const records = await this.prisma.marketingLandingPage.findMany({
      orderBy: { title: 'asc' },
    });

    return {
      total: records.length,
      pages: records.map((record) => ({
        id: record.id,
        title: record.title,
        slug: record.slug,
        path: record.path,
        status: record.status.toLowerCase() as MarketingLandingStatus,
        impressions: record.impressions,
        conversions: record.conversions,
        leads: record.leads,
        conversionRate: record.impressions > 0 ? record.conversions / record.impressions : null,
        bounceRate: record.bounceRate ?? null,
        updatedAt: record.updatedAt.toISOString(),
      })),
    };
  }

  private async ensureMarketingSettingsRecord() {
    let record = await this.prisma.marketingSetting.findUnique({ where: { id: 1 } });
    if (!record) {
      record = await this.prisma.marketingSetting.create({ data: { id: 1 } });
    }
    return record;
  }

  private async ensureMarketingSettingLogSeed(settingId: number) {
    const count = await this.prisma.marketingSettingLog.count({ where: { settingId } });
    if (count === 0) {
      await this.prisma.marketingSettingLog.create({
        data: {
          settingId,
          label: 'Initialisation',
          previousValue: null,
          newValue: 'Configuration par défaut appliquée',
        },
      });
    }
  }

  async getMarketingSettings(): Promise<AdminMarketingSettingsResponse> {
    const settings = await this.ensureMarketingSettingsRecord();
    await this.ensureMarketingSettingLogSeed(settings.id);

    const logs = await this.prisma.marketingSettingLog.findMany({
      where: { settingId: settings.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    return {
      toggles: {
        promoCodesEnabled: settings.promoCodesEnabled,
        referralEnabled: settings.referralEnabled,
        marketingNotificationsEnabled: settings.marketingNotificationsEnabled,
      },
      policy: {
        maxPromoCodesPerClient: settings.maxPromoCodesPerClient,
        stackingRules: settings.stackingRules ?? null,
        restrictedZones: settings.restrictedZones ?? null,
      },
      logs: logs.map((log) => ({
        id: log.id,
        label: log.label,
        previousValue: log.previousValue ?? null,
        newValue: log.newValue ?? null,
        createdAt: log.createdAt.toISOString(),
        user: log.user
          ? {
              id: log.user.id,
              name: `${log.user.firstName} ${log.user.lastName}`.trim() || log.user.email,
              email: log.user.email,
            }
          : null,
      })),
    };
  }

  private mapUsageRecord(record: Prisma.PromoCodeUsageGetPayload<{
    include: {
      promoCode: { select: { id: true, code: true } },
      booking: {
        select: {
          id: true,
          status: true,
          service: true,
          addressCity: true,
          addressPostalCode: true,
          pricingTotalCents: true,
        },
      },
      client: { select: { id: true, firstName: true, lastName: true, email: true } },
    };
  }>): AdminPromoCodeUsageRecord {
    const bookingStatus = record.booking?.status
      ? (record.booking.status.toLowerCase() as BookingStatus)
      : null;
    return {
      id: record.id,
      promoCodeId: record.promoCodeId,
      code: record.promoCode?.code ?? '—',
      bookingId: record.bookingId ?? null,
      bookingStatus,
      bookingService: record.booking?.service ?? null,
      bookingCity: record.booking?.addressCity ?? null,
      bookingPostalCode: record.booking?.addressPostalCode ?? null,
      bookingAmountCents: record.booking?.pricingTotalCents ?? null,
      client: record.client
        ? {
            id: record.client.id,
            name: `${record.client.firstName ?? ''} ${record.client.lastName ?? ''}`.trim() || record.client.email,
            email: record.client.email,
          }
        : null,
      usedAt: record.createdAt.toISOString(),
      discountCents: record.amountDiscountCents,
      currency: record.currency,
      status: record.status ?? 'applied',
    };
  }
}
