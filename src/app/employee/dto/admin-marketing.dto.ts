import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

const PROMO_TYPES = ['fixed', 'percent'] as const;
const PROMO_STATUSES = ['active', 'inactive', 'scheduled', 'expired'] as const;

export class MarketingRangeQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

export class PromoCodeListQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(PROMO_STATUSES)
  status?: (typeof PROMO_STATUSES)[number];

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  pageSize?: string;
}

export class PromoCodeUsageQueryDto extends MarketingRangeQueryDto {
  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  pageSize?: string;
}

export class PromoCodeMutationDto {
  @IsString()
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(PROMO_TYPES)
  type!: (typeof PROMO_TYPES)[number];

  @ValidateIf((dto: PromoCodeMutationDto) => dto.type === 'fixed')
  @IsNumberString()
  fixedAmountCents?: string;

  @ValidateIf((dto: PromoCodeMutationDto) => dto.type === 'percent')
  @IsNumberString()
  percentage?: string;

  @IsOptional()
  @IsString()
  startsAt?: string;

  @IsOptional()
  @IsString()
  endsAt?: string;

  @IsOptional()
  @IsNumberString()
  maxTotalUsages?: string;

  @IsOptional()
  @IsNumberString()
  maxUsagesPerUser?: string;

  @IsOptional()
  @IsNumberString()
  minBookingTotalCents?: string;

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === 'string' && value.length > 0) {
      return value.split(',').map((entry) => entry.trim()).filter(Boolean);
    }
    return [];
  })
  applicableServices?: string[];

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === 'string' && value.length > 0) {
      return value.split(',').map((entry) => entry.trim()).filter(Boolean);
    }
    return [];
  })
  applicablePostalCodes?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PromoCodeStatusDto {
  @IsBoolean()
  isActive!: boolean;
}
