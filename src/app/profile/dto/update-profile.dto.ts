import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { DigestFrequency } from '@prisma/client';

export class UpdateUserPreferencesDto {
  @IsOptional()
  @IsBoolean()
  marketingEmails?: boolean;

  @IsOptional()
  @IsBoolean()
  productUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  enableDarkMode?: boolean;

  @IsOptional()
  @IsEnum(DigestFrequency)
  digestFrequency?: DigestFrequency;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  preferredLocale?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateUserPreferencesDto)
  preferences?: UpdateUserPreferencesDto;
}
