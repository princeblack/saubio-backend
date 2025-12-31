import { IsEnum, IsNumberString, IsOptional, IsString, Max, Min } from 'class-validator';
import { NotificationAutomationAudience, NotificationAutomationEvent, NotificationChannel, NotificationDeliveryStatus, NotificationTemplateStatus, NotificationType } from '@prisma/client';

const LOG_SORTABLE_STATUSES = [
  NotificationDeliveryStatus.PENDING,
  NotificationDeliveryStatus.SENT,
  NotificationDeliveryStatus.DELIVERED,
  NotificationDeliveryStatus.FAILED,
  NotificationDeliveryStatus.BOUNCED,
];

const NOTIFICATION_CHANNELS = [NotificationChannel.IN_APP, NotificationChannel.EMAIL, NotificationChannel.PUSH] as const;

export class NotificationLogQueryDto {
  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  pageSize?: string;

  @IsOptional()
  @IsEnum(NotificationDeliveryStatus)
  status?: NotificationDeliveryStatus;

  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @IsString()
  templateKey?: string;

  @IsOptional()
  @IsString()
  bookingId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

export class NotificationTemplateUpdateDto {
  @IsOptional()
  @IsEnum(NotificationTemplateStatus)
  status?: NotificationTemplateStatus;

  @IsOptional()
  @IsEnum(NotificationChannel, { each: true })
  activeChannels?: NotificationChannel[];

  @IsOptional()
  @IsString({ each: true })
  locales?: string[];
}

export class NotificationAutomationRuleUpdateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsEnum(NotificationAutomationAudience)
  audience?: NotificationAutomationAudience;

  @IsOptional()
  @IsEnum(NotificationChannel, { each: true })
  channels?: NotificationChannel[];

  @IsOptional()
  @Min(0)
  @Max(604800)
  delaySeconds?: number | null;

  @IsOptional()
  @IsString()
  templateId?: string | null;

  @IsOptional()
  isActive?: boolean;
}
