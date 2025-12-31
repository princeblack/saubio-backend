import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { GdprRequestStatus, GdprRequestType } from '@prisma/client';

export class ListGdprRequestsDto {
  @IsOptional()
  @IsEnum(GdprRequestStatus)
  status?: GdprRequestStatus;

  @IsOptional()
  @IsEnum(GdprRequestType)
  type?: GdprRequestType;

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
