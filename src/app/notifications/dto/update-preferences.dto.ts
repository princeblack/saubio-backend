import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { NotificationChannel, NotificationType } from '@prisma/client';

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  channels?: NotificationChannel[];

  @IsOptional()
  @IsArray()
  @IsEnum(NotificationType, { each: true })
  mutedTypes?: NotificationType[];

  @IsOptional()
  @IsString()
  language?: string;
}
