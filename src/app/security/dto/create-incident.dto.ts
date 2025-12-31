import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { SecurityIncidentCategory, SecurityIncidentSeverity } from '@prisma/client';

export class CreateSecurityIncidentDto {
  @IsString()
  @MinLength(3)
  title!: string;

  @IsString()
  @MinLength(10)
  description!: string;

  @IsOptional()
  @IsEnum(SecurityIncidentCategory)
  category?: SecurityIncidentCategory;

  @IsOptional()
  @IsEnum(SecurityIncidentSeverity)
  severity?: SecurityIncidentSeverity;

  @IsOptional()
  @IsString()
  assignedToId?: string;
}
