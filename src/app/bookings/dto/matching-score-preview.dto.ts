import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { EcoPreference, ServiceCategory } from '@saubio/models';

const SERVICE_VALUES: ServiceCategory[] = [
  'residential',
  'office',
  'industrial',
  'windows',
  'disinfection',
  'eco_plus',
];

const ECO_VALUES: EcoPreference[] = ['standard', 'bio'];

export class MatchingScorePreviewDto {
  @IsIn(SERVICE_VALUES)
  service!: ServiceCategory;

  @IsIn(ECO_VALUES)
  ecoPreference!: EcoPreference;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsString()
  @IsOptional()
  city?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  requiredProviders?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  priceCeilingCents?: number;
}
