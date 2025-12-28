import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

const REVIEW_STATUSES = ['published', 'hidden', 'flagged'] as const;
const INCIDENT_STATUSES = ['open', 'under_review', 'action_required', 'refunded', 'resolved', 'rejected'] as const;
const INCIDENT_SEVERITIES = ['low', 'medium', 'high'] as const;

export class QualityRangeQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

export class QualityPaginationQueryDto extends QualityRangeQueryDto {
  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  pageSize?: string;
}

export class QualityReviewListQueryDto extends QualityPaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  providerId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  service?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(5)
  minScore?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(5)
  maxScore?: number;

  @IsOptional()
  @IsIn([...REVIEW_STATUSES])
  status?: (typeof REVIEW_STATUSES)[number];
}

export class QualityReviewStatusDto {
  @IsOptional()
  @IsIn([...REVIEW_STATUSES])
  status?: (typeof REVIEW_STATUSES)[number];

  @IsOptional()
  @IsString()
  moderationNotes?: string;
}

export class QualityProviderListQueryDto extends QualityPaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  service?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minReviews?: number;

  @IsOptional()
  @IsIn(['at_risk', 'top'])
  focus?: 'at_risk' | 'top';
}

export class QualityIncidentQueryDto extends QualityPaginationQueryDto {
  @IsOptional()
  @IsIn([...INCIDENT_STATUSES])
  status?: (typeof INCIDENT_STATUSES)[number];

  @IsOptional()
  @IsIn([...INCIDENT_SEVERITIES])
  severity?: (typeof INCIDENT_SEVERITIES)[number];

  @IsOptional()
  @IsString()
  providerId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  bookingId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class QualityIncidentUpdateDto {
  @IsOptional()
  @IsIn([...INCIDENT_STATUSES])
  status?: (typeof INCIDENT_STATUSES)[number];

  @IsOptional()
  @IsString()
  resolution?: string;

  @IsOptional()
  @IsString()
  adminNotes?: string;
}

export class QualitySatisfactionQueryDto extends QualityRangeQueryDto {
  @IsOptional()
  @IsString()
  service?: string;

  @IsOptional()
  @IsString()
  city?: string;
}

export class QualityProgramQueryDto extends QualityRangeQueryDto {
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  service?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minReviews?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxRating?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minRating?: number;
}
