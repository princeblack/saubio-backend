import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import type { BookingMode, BookingStatus, ServiceCategory } from '@saubio/models';
import { SERVICE_CATEGORY_VALUES } from './create-booking.dto';

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
const SERVICE_FILTERS: ServiceCategory[] = SERVICE_CATEGORY_VALUES;

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
  @IsArray()
  @IsIn(BOOKING_STATUS_FILTERS, { each: true })
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (Array.isArray(value)) {
      return value
        .flatMap((entry) => (typeof entry === 'string' ? entry.split(',') : []))
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0) as BookingStatus[];
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0) as BookingStatus[];
    }
    return undefined;
  })
  statuses?: BookingStatus[];

  @IsOptional()
  @IsIn(BOOKING_MODE_FILTERS)
  mode?: BookingMode;

  @IsOptional()
  @IsIn(SERVICE_FILTERS)
  service?: ServiceCategory;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  startFrom?: string;

  @IsOptional()
  @IsString()
  startTo?: string;

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

  @IsOptional()
  @Transform(({ value }) => toBooleanOrUndefined(value))
  @IsBoolean()
  shortNotice?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBooleanOrUndefined(value))
  @IsBoolean()
  hasProvider?: boolean;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  providerId?: string;
}
