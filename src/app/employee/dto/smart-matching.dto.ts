import { Transform } from 'class-transformer';
import { IsIn, IsNumber, IsNumberString, IsOptional, IsString, Max, Min } from 'class-validator';
import { EcoPreference, SERVICE_CATALOG } from '@saubio/models';

const SERVICE_IDS = SERVICE_CATALOG.map((service) => service.id);
const SMART_MATCH_RESULTS = ['assigned', 'unassigned'] as const;
const INVITATION_FILTERS = ['pending', 'accepted', 'declined', 'expired'] as const;

export class SmartMatchingRangeQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

export class SmartMatchingPaginationQueryDto extends SmartMatchingRangeQueryDto {
  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  pageSize?: string;
}

export class SmartMatchingHistoryQueryDto extends SmartMatchingPaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(SERVICE_IDS)
  service?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsIn(SMART_MATCH_RESULTS)
  result?: (typeof SMART_MATCH_RESULTS)[number];

  @IsOptional()
  @IsIn(INVITATION_FILTERS)
  invitationStatus?: (typeof INVITATION_FILTERS)[number];
}

export class SmartMatchingConfigDto {
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber()
  @Min(1)
  @Max(200)
  distanceMaxKm?: number;

  @IsOptional()
  weights?: Record<string, number>;

  @IsOptional()
  teamBonus?: {
    two?: number;
    threePlus?: number;
  };
}

export class SmartMatchingSimulationDto {
  @IsString()
  @IsIn(SERVICE_IDS)
  service!: string;

  @IsString()
  postalCode!: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsIn(['standard', 'bio'])
  ecoPreference?: EcoPreference;

  @IsString()
  startAt!: string;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : 0))
  @IsNumber()
  @Min(30)
  @Max(24 * 60)
  durationMinutes?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : 1))
  @IsNumber()
  @Min(1)
  @Max(5)
  requiredProviders?: number;
}
