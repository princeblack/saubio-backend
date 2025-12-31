import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { SecurityIncidentCategory, SecurityIncidentSeverity, SecurityIncidentStatus } from '@prisma/client';

export class UpdateSecurityIncidentDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  description?: string;

  @IsOptional()
  @IsEnum(SecurityIncidentCategory)
  category?: SecurityIncidentCategory;

  @IsOptional()
  @IsEnum(SecurityIncidentSeverity)
  severity?: SecurityIncidentSeverity;

  @IsOptional()
  @IsEnum(SecurityIncidentStatus)
  status?: SecurityIncidentStatus;

  @IsOptional()
  @IsString()
  assignedToId?: string | null;

  @IsOptional()
  @IsString()
  timelineMessage?: string;
}
