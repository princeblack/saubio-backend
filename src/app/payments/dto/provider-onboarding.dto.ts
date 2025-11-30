import { IsArray, IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

export class ProviderOnboardingDto {
  @IsString()
  providerId!: string;

  @IsEnum(['individual', 'company'])
  type!: 'individual' | 'company';

  @IsString()
  @IsOptional()
  businessName?: string;

  @IsEmail()
  email!: string;

  @IsString()
  country!: string;

  @IsArray()
  @IsString({ each: true })
  serviceAreas!: string[];

  @IsString()
  @IsOptional()
  vatNumber?: string;
}
