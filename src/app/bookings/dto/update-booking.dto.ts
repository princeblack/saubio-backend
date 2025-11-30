import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, ValidateIf, IsDateString } from 'class-validator';
import { BookingStatus } from '@saubio/models';
import { CreateBookingDto } from './create-booking.dto';

export class UpdateBookingDto extends PartialType(CreateBookingDto) {
  @IsOptional()
  @IsEnum(['draft', 'pending_provider', 'pending_client', 'confirmed', 'in_progress', 'completed', 'cancelled', 'disputed'])
  status?: BookingStatus;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  reminderAt?: string | null;

  @IsOptional()
  @IsString()
  reminderNotes?: string | null;
}
