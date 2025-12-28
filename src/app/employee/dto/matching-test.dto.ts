import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';
import { EcoPreference, ServiceCategory, SERVICE_CATALOG } from '@saubio/models';

export class MatchingTestDto {
  @IsString()
  @IsIn(SERVICE_CATALOG.map((service) => service.id))
  service!: ServiceCategory;

  @Matches(/^[0-9A-Za-z\- ]{3,10}$/)
  postalCode!: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsOptional()
  @IsString()
  @IsIn(['standard', 'bio'])
  ecoPreference?: EcoPreference;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  requiredProviders?: number;
}
