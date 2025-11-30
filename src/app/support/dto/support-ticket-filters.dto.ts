import { IsEnum, IsOptional, IsString } from 'class-validator';
import { SupportPriority, SupportStatus } from '@prisma/client';

export class SupportTicketFiltersDto {
  @IsOptional()
  @IsEnum(SupportStatus)
  status?: SupportStatus;

  @IsOptional()
  @IsEnum(SupportPriority)
  priority?: SupportPriority;

  @IsOptional()
  @IsString()
  search?: string;
}
