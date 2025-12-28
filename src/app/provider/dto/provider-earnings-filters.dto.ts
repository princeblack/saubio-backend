import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class ProviderEarningsFiltersDto {
  @IsOptional()
  @IsIn(['upcoming', 'awaiting_validation', 'payable', 'paid'])
  status?: 'upcoming' | 'awaiting_validation' | 'payable' | 'paid';

  @IsOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(0)
  offset?: number;
}
