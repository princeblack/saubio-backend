import { IsEnum, IsOptional, IsString } from 'class-validator';
import { GdprRequestType } from '@prisma/client';

export class CreateGdprRequestDto {
  @IsEnum(GdprRequestType)
  type!: GdprRequestType;

  @IsString()
  userId!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
