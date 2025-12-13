import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateProviderPayoutStatusDto {
  @IsIn(['pending', 'in_review', 'verified', 'rejected'])
  status!: 'pending' | 'in_review' | 'verified' | 'rejected';

  @IsOptional()
  @IsIn(['bank_transfer', 'card'])
  payoutMethod?: 'bank_transfer' | 'card';

  @IsOptional()
  @IsString()
  payoutLast4?: string;
}
