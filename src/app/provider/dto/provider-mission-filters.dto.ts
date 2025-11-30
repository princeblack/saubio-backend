import { BookingStatus } from '@saubio/models';
import { IsIn, IsOptional, IsString } from 'class-validator';

const BOOKING_STATUS_FILTERS: Array<BookingStatus | 'all'> = [
  'all',
  'draft',
  'pending_provider',
  'pending_client',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'disputed',
];

const ECO_FILTERS = ['all', 'standard', 'bio'] as const;

export class ProviderMissionFiltersDto {
  @IsOptional()
  @IsIn(BOOKING_STATUS_FILTERS)
  status?: BookingStatus | 'all';

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsIn(ECO_FILTERS)
  eco?: 'all' | 'standard' | 'bio';

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
