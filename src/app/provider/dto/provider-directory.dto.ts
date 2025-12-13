import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ServiceCategory } from '@saubio/models';
import { SERVICE_TYPE_IDS } from '../service-type-catalog';

const SERVICE_CATEGORY_VALUES: ServiceCategory[] = SERVICE_TYPE_IDS;

const SORT_VALUES = ['rating', 'rate'] as const;

export class ProviderDirectoryDto {
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsIn(SERVICE_CATEGORY_VALUES)
  service?: ServiceCategory;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minRateCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxRateCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  minRating?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minCompletedMissions?: number;

  @IsOptional()
  @IsBoolean()
  acceptsAnimals?: boolean;

  @IsOptional()
  @IsDateString()
  availableOn?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(0.5)
  @Max(12)
  durationHours?: number;

  @IsOptional()
  @IsIn(SORT_VALUES)
  sort?: 'rating' | 'rate';
}
