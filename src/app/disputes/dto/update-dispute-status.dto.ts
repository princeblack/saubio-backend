import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

const ALLOWED_STATUSES = [
  'open',
  'under_review',
  'action_required',
  'refunded',
  'resolved',
  'rejected',
] as const;

export class UpdateDisputeStatusDto {
  @IsIn(ALLOWED_STATUSES)
  status!: (typeof ALLOWED_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolution?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  refundAmountCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  refundCurrency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNotes?: string;
}
