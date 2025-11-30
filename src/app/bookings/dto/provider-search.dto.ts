import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsIn, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { EcoPreference, ServiceCategory } from '@saubio/models';

const SERVICE_CATEGORY_VALUES: ServiceCategory[] = [
  'residential',
  'office',
  'industrial',
  'windows',
  'disinfection',
  'eco_plus',
];

const ECO_PREFERENCE_VALUES: EcoPreference[] = ['standard', 'bio'];

export class ProviderSearchDto {
  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsString()
  @IsOptional()
  postalCode?: string;

  @IsIn(SERVICE_CATEGORY_VALUES)
  service!: ServiceCategory;

  @IsIn(ECO_PREFERENCE_VALUES)
  @IsOptional()
  ecoPreference?: EcoPreference;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  @IsOptional()
  limit?: number;
}
