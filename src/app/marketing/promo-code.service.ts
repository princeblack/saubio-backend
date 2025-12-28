import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma, PromoCode, PromoCodeType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface PromoCodeEvaluation {
  promo: PromoCode;
  normalizedCode: string;
  discountCents: number;
}

interface PromoEvaluationContext {
  code: string;
  service: string;
  postalCode: string;
  bookingTotalCents: number;
  clientId?: string | null;
  excludeBookingId?: string | null;
  now?: Date;
}

interface ApplyPromoContext {
  bookingId: string;
  clientId?: string | null;
  currency: string;
  evaluation: PromoCodeEvaluation;
  tx: Prisma.TransactionClient;
  skipClear?: boolean;
}

@Injectable()
export class PromoCodeService {
  constructor(private readonly prisma: PrismaService) {}

  normalizeCode(code: string) {
    return code.trim().toUpperCase();
  }

  private normalizeService(value: string) {
    return value.trim().toLowerCase();
  }

  private normalizePostalCode(value: string) {
    return value.trim().toUpperCase();
  }

  private calculateDiscount(promo: PromoCode, totalCents: number) {
    const safeTotal = Math.max(0, totalCents);
    if (promo.type === 'FIXED') {
      const amount = Math.max(0, promo.fixedAmountCents ?? 0);
      return Math.min(amount, safeTotal);
    }
    if (promo.type === 'PERCENT') {
      const percent = Math.max(0, Math.min(100, promo.percentage ?? 0));
      return Math.min(Math.round((safeTotal * percent) / 100), safeTotal);
    }
    return 0;
  }

  private assertUsageLimits(promo: PromoCode) {
    if (promo.maxTotalUsages !== null && promo.maxTotalUsages !== undefined) {
      if (promo.usageCount >= promo.maxTotalUsages) {
        throw new BadRequestException('PROMO_CODE_USAGE_LIMIT_REACHED');
      }
    }
  }

  private async assertPerUserLimit(
    promo: PromoCode,
    ctx: PromoEvaluationContext,
    tx: Prisma.TransactionClient | PrismaService
  ) {
    if (!promo.maxUsagesPerUser || !ctx.clientId) {
      return;
    }
    const count = await tx.promoCodeUsage.count({
      where: {
        promoCodeId: promo.id,
        clientId: ctx.clientId,
        bookingId: ctx.excludeBookingId ? { not: ctx.excludeBookingId } : undefined,
      },
    });
    if (count >= promo.maxUsagesPerUser) {
      throw new BadRequestException('PROMO_CODE_USER_LIMIT_REACHED');
    }
  }

  private assertApplicability(promo: PromoCode, ctx: PromoEvaluationContext) {
    const now = ctx.now ?? new Date();
    if (!promo.isActive) {
      throw new BadRequestException('PROMO_CODE_INACTIVE');
    }
    if (promo.startsAt && promo.startsAt > now) {
      throw new BadRequestException('PROMO_CODE_NOT_STARTED');
    }
    if (promo.endsAt && promo.endsAt < now) {
      throw new BadRequestException('PROMO_CODE_EXPIRED');
    }
    if (promo.minBookingTotalCents && ctx.bookingTotalCents < promo.minBookingTotalCents) {
      throw new BadRequestException('PROMO_CODE_MIN_TOTAL');
    }
    if (promo.applicableServices?.length) {
      const normalizedService = this.normalizeService(ctx.service);
      const matches = promo.applicableServices.some(
        (service) => this.normalizeService(service) === normalizedService
      );
      if (!matches) {
        throw new BadRequestException('PROMO_CODE_SERVICE_UNAVAILABLE');
      }
    }
    if (promo.applicablePostalCodes?.length) {
      const normalizedPostal = this.normalizePostalCode(ctx.postalCode);
      const matches = promo.applicablePostalCodes.some(
        (postal) => this.normalizePostalCode(postal) === normalizedPostal
      );
      if (!matches) {
        throw new BadRequestException('PROMO_CODE_CITY_UNAVAILABLE');
      }
    }
  }

  async evaluateForBooking(
    ctx: PromoEvaluationContext,
    tx?: Prisma.TransactionClient
  ): Promise<PromoCodeEvaluation> {
    const client = tx ?? this.prisma;
    const normalizedCode = this.normalizeCode(ctx.code);
    const promo = await client.promoCode.findUnique({
      where: { code: normalizedCode },
    });
    if (!promo) {
      throw new BadRequestException('PROMO_CODE_NOT_FOUND');
    }
    this.assertApplicability(promo, ctx);
    this.assertUsageLimits(promo);
    await this.assertPerUserLimit(promo, ctx, client);
    const discountCents = this.calculateDiscount(promo, ctx.bookingTotalCents);
    if (discountCents <= 0) {
      throw new BadRequestException('PROMO_CODE_NO_VALUE');
    }
    return {
      promo,
      normalizedCode,
      discountCents,
    };
  }

  private async decrementUsageCount(
    promoCodeId: string,
    tx: Prisma.TransactionClient,
    touchedAt?: Date
  ) {
    await tx.promoCode.update({
      where: { id: promoCodeId },
      data: {
        usageCount: {
          decrement: 1,
        },
        lastUsedAt: touchedAt ?? new Date(),
      },
    });
  }

  async clearBookingPromo(tx: Prisma.TransactionClient, bookingId: string) {
    const existingUsages = await tx.promoCodeUsage.findMany({
      where: { bookingId },
      select: { id: true, promoCodeId: true },
    });

    if (existingUsages.length > 0) {
      await tx.promoCodeUsage.deleteMany({ where: { bookingId } });
      for (const usage of existingUsages) {
        await this.decrementUsageCount(usage.promoCodeId, tx);
      }
    }

    await tx.booking.update({
      where: { id: bookingId },
      data: {
        promoCode: { disconnect: true },
        couponCode: null,
      },
    });
  }

  async applyEvaluation(params: ApplyPromoContext) {
    const { tx, bookingId, evaluation, clientId, currency, skipClear } = params;
    if (!skipClear) {
      await this.clearBookingPromo(tx, bookingId);
    }
    await tx.promoCodeUsage.create({
      data: {
        promoCodeId: evaluation.promo.id,
        bookingId,
        clientId: clientId ?? undefined,
        amountDiscountCents: evaluation.discountCents,
        currency,
        status: 'applied',
      },
    });
    await tx.booking.update({
      where: { id: bookingId },
      data: {
        promoCode: { connect: { id: evaluation.promo.id } },
        couponCode: evaluation.normalizedCode,
      },
    });
    await tx.promoCode.update({
      where: { id: evaluation.promo.id },
      data: {
        usageCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });
  }

  async removeBookingPromo(tx: Prisma.TransactionClient, bookingId: string) {
    await this.clearBookingPromo(tx, bookingId);
  }

  private ensureValueForType(type: PromoCodeType, payload: { fixedAmountCents?: number; percentage?: number }) {
    if (type === 'FIXED' && (!payload.fixedAmountCents || payload.fixedAmountCents <= 0)) {
      throw new BadRequestException('PROMO_CODE_VALUE_REQUIRED');
    }
    if (type === 'PERCENT' && (!payload.percentage || payload.percentage <= 0)) {
      throw new BadRequestException('PROMO_CODE_VALUE_REQUIRED');
    }
  }

  async createPromoCode(data: Prisma.PromoCodeCreateInput) {
    this.ensureValueForType(data.type as PromoCodeType, data as unknown as Record<string, number>);
    return this.prisma.promoCode.create({
      data: {
        ...data,
        code: this.normalizeCode(data.code),
      },
    });
  }

  async updatePromoCode(id: string, data: Prisma.PromoCodeUpdateInput) {
    if (data.code && typeof data.code === 'string') {
      data.code = this.normalizeCode(data.code);
    }
    if (data.type) {
      this.ensureValueForType(data.type as PromoCodeType, data as unknown as Record<string, number>);
    }
    return this.prisma.promoCode.update({
      where: { id },
      data,
    });
  }
}
