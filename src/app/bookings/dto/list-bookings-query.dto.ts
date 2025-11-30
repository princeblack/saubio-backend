import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import type { BookingMode, BookingStatus } from '@saubio/models';

const BOOKING_STATUS_FILTERS: BookingStatus[] = [
  'draft',
  'pending_provider',
  'pending_client',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'disputed',
];

const BOOKING_MODE_FILTERS: BookingMode[] = ['smart_match', 'manual'];

const toBooleanOrUndefined = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') {
      return true;
    }
    if (value.toLowerCase() === 'false') {
      return false;
    }
  }
  return Boolean(value);
};

export class ListBookingsQueryDto {
  @IsOptional()
  @IsIn(BOOKING_STATUS_FILTERS)
  status?: BookingStatus;

  @IsOptional()
  @IsIn(BOOKING_MODE_FILTERS)
  mode?: BookingMode;

  @IsOptional()
  @Transform(({ value }) => toBooleanOrUndefined(value))
  @IsBoolean()
  fallbackRequested?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBooleanOrUndefined(value))
  @IsBoolean()
  fallbackEscalated?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minRetryCount?: number;
}
