import { IsEnum, IsNumberString, IsOptional, IsString } from 'class-validator';
import { WebhookDeliveryStatus } from '@prisma/client';

export class SystemWebhookLogsQueryDto {
  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  pageSize?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsEnum(WebhookDeliveryStatus)
  status?: WebhookDeliveryStatus;

  @IsOptional()
  @IsString()
  eventType?: string;

  @IsOptional()
  @IsString()
  resourceId?: string;

  @IsOptional()
  @IsString()
  bookingId?: string;

  @IsOptional()
  @IsString()
  paymentId?: string;

  @IsOptional()
  @IsString()
  providerProfileId?: string;

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

export enum SystemApiKeyStatusDto {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  REVOKED = 'REVOKED',
}

export class SystemApiKeysQueryDto {
  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  pageSize?: string;

  @IsOptional()
  @IsEnum(SystemApiKeyStatusDto)
  status?: SystemApiKeyStatusDto;

  @IsOptional()
  @IsString()
  search?: string;
}

export enum SystemDataJobStatusDto {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum SystemImportEntityDto {
  USERS = 'USERS',
  PROVIDERS = 'PROVIDERS',
  BOOKINGS = 'BOOKINGS',
  PAYMENTS = 'PAYMENTS',
  ZONES = 'ZONES',
  SERVICES = 'SERVICES',
  OTHER = 'OTHER',
}

export class SystemImportJobsQueryDto {
  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  pageSize?: string;

  @IsOptional()
  @IsEnum(SystemDataJobStatusDto)
  status?: SystemDataJobStatusDto;

  @IsOptional()
  @IsEnum(SystemImportEntityDto)
  entity?: SystemImportEntityDto;

  @IsOptional()
  @IsString()
  search?: string;
}

export enum SystemExportTypeDto {
  BOOKINGS = 'BOOKINGS',
  PAYMENTS = 'PAYMENTS',
  PROVIDERS = 'PROVIDERS',
  CLIENTS = 'CLIENTS',
  DISPUTES = 'DISPUTES',
  FINANCE = 'FINANCE',
  OTHER = 'OTHER',
}

export class SystemExportJobsQueryDto {
  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  pageSize?: string;

  @IsOptional()
  @IsEnum(SystemDataJobStatusDto)
  status?: SystemDataJobStatusDto;

  @IsOptional()
  @IsEnum(SystemExportTypeDto)
  type?: SystemExportTypeDto;

  @IsOptional()
  @IsString()
  search?: string;
}
