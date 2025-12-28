import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';
import type { BookingInvitationStatus } from '@saubio/models';

const INVITATION_STATUS_VALUES: BookingInvitationStatus[] = ['pending', 'accepted', 'declined', 'expired'];

export class ProviderInvitationFiltersDto {
  @IsOptional()
  @IsIn(INVITATION_STATUS_VALUES)
  status?: BookingInvitationStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(200)
  limit?: number;
}
