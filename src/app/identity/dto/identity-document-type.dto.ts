import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

const REQUIRED_FILES = [1, 2] as const;

export class CreateIdentityDocumentTypeDto {
  @IsString()
  @Matches(/^[a-z0-9_\-]+$/i)
  code!: string;

  @IsString()
  @MaxLength(120)
  labelFr!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  labelEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  labelDe?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsInt()
  @IsIn(REQUIRED_FILES)
  requiredFiles?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableCountries?: string[];
}

export class UpdateIdentityDocumentTypeDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  labelFr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  labelEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  labelDe?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  requiredFiles?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableCountries?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
