import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ManualPayoutBatchDto {
  @IsOptional()
  @IsDateString()
  scheduledFor?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
