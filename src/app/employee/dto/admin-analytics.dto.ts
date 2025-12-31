import { IsISO8601, IsIn, IsOptional, IsString } from 'class-validator';

export class AnalyticsRangeQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  service?: string;

  @IsOptional()
  @IsString()
  city?: string;
}

export class AnalyticsFunnelQueryDto extends AnalyticsRangeQueryDto {}

export class AnalyticsCohortQueryDto extends AnalyticsRangeQueryDto {
  @IsOptional()
  @IsIn(['client', 'provider'])
  type?: 'client' | 'provider';
}

export class AnalyticsZonesQueryDto extends AnalyticsRangeQueryDto {}

export class AnalyticsOpsQueryDto extends AnalyticsRangeQueryDto {}

