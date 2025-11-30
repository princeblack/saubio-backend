import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, ValidateNested, IsLatitude, IsLongitude } from 'class-validator';
import { Type } from 'class-transformer';

class ProviderServiceZoneDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsNumber()
  radiusKm?: number;
}

export class UpdateProviderProfileDto {
  @IsOptional()
  @IsString()
  bio?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceAreas?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProviderServiceZoneDto)
  serviceZones?: ProviderServiceZoneDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceCategories?: string[];

  @IsOptional()
  @IsNumber()
  hourlyRateCents?: number;

  @IsOptional()
  @IsBoolean()
  offersEco?: boolean;

  @IsOptional()
  @IsBoolean()
  acceptsAnimals?: boolean;

  @IsOptional()
  @IsNumber()
  yearsExperience?: number;
}
