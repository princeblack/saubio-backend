import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsISO8601, Min } from 'class-validator';

export class IdentityAuditQueryDto {
  @IsOptional()
  @IsString()
  providerId?: string;

  @IsOptional()
  @IsString()
  actorId?: string;

  @IsOptional()
  @IsString()
  documentId?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
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
