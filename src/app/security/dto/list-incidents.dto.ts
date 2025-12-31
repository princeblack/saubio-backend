import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { SecurityIncidentCategory, SecurityIncidentSeverity, SecurityIncidentStatus } from '@prisma/client';

export class ListSecurityIncidentsDto {
  @IsOptional()
  @IsEnum(SecurityIncidentStatus)
  status?: SecurityIncidentStatus;

  @IsOptional()
  @IsEnum(SecurityIncidentCategory)
  category?: SecurityIncidentCategory;

  @IsOptional()
  @IsEnum(SecurityIncidentSeverity)
  severity?: SecurityIncidentSeverity;

  @IsOptional()
  @IsString()
  q?: string;

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
