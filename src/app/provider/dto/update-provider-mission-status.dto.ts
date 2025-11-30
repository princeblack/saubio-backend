import { BookingStatus } from '@saubio/models';
import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsOptional, IsString, ValidateIf } from 'class-validator';

export const PROVIDER_ALLOWED_STATUSES: BookingStatus[] = ['confirmed', 'in_progress', 'completed', 'cancelled'];

export class UpdateProviderMissionStatusDto {
  @IsOptional()
  @IsIn(PROVIDER_ALLOWED_STATUSES)
  status?: BookingStatus;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  reminderAt?: string | null;

  @IsOptional()
  @IsString()
  reminderNote?: string | null;
}
