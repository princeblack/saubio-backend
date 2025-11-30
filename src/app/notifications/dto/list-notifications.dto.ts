import { Transform } from 'class-transformer';
import { IsBooleanString, IsEnum, IsOptional, IsString } from 'class-validator';
import { NotificationType } from '@prisma/client';

export class ListNotificationsDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @IsBooleanString()
  unread?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  })
  limit?: number;

  @IsOptional()
  @IsString()
  targetUserId?: string;
}
