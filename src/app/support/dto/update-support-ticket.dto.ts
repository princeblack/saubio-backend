import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { SupportPriority, SupportStatus } from '@prisma/client';

export class UpdateSupportTicketDto {
  @IsOptional()
  @IsEnum(SupportStatus)
  status?: SupportStatus;

  @IsOptional()
  @IsEnum(SupportPriority)
  priority?: SupportPriority;

  @IsOptional()
  @IsString()
  assigneeId?: string | null;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;
}
