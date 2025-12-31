import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { SecurityLogCategory, SecurityLogLevel } from '@prisma/client';

export class ListSecurityLogsDto {
  @IsOptional()
  @IsEnum(SecurityLogCategory)
  category?: SecurityLogCategory;

  @IsOptional()
  @IsEnum(SecurityLogLevel)
  level?: SecurityLogLevel;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
