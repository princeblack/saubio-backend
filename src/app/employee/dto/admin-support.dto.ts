import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

const SUPPORT_STATUSES = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'] as const;
const SUPPORT_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
const SUPPORT_CATEGORIES = ['onboarding', 'billing', 'incident', 'feature_request', 'other'] as const;
const SUPPORT_TYPES = ['client', 'provider', 'company', 'employee'] as const;
const DISPUTE_STATUSES = ['open', 'under_review', 'action_required', 'refunded', 'resolved', 'rejected'] as const;

export class SupportRangeQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

export class SupportPaginationQueryDto extends SupportRangeQueryDto {
  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  pageSize?: string;
}

export class SupportTicketQueryDto extends SupportPaginationQueryDto {
  @IsOptional()
  @IsIn([...SUPPORT_STATUSES])
  status?: (typeof SUPPORT_STATUSES)[number];

  @IsOptional()
  @IsIn([...SUPPORT_PRIORITIES])
  priority?: (typeof SUPPORT_PRIORITIES)[number];

  @IsOptional()
  @IsIn([...SUPPORT_CATEGORIES])
  category?: (typeof SUPPORT_CATEGORIES)[number];

  @IsOptional()
  @IsIn([...SUPPORT_TYPES])
  type?: (typeof SUPPORT_TYPES)[number];

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  bookingId?: string;

  @IsOptional()
  @IsString()
  requesterId?: string;
}

export class SupportTicketUpdateDto {
  @IsOptional()
  @IsIn([...SUPPORT_STATUSES])
  status?: (typeof SUPPORT_STATUSES)[number];

  @IsOptional()
  @IsIn([...SUPPORT_PRIORITIES])
  priority?: (typeof SUPPORT_PRIORITIES)[number];

  @IsOptional()
  @IsString()
  assigneeId?: string | null;

  @IsOptional()
  @IsString()
  dueAt?: string | null;
}

export class SupportTicketMessageDto {
  @IsString()
  content!: string;

  @IsOptional()
  @IsBoolean()
  internal?: boolean;
}

export class SupportDisputeQueryDto extends SupportPaginationQueryDto {
  @IsOptional()
  @IsIn([...DISPUTE_STATUSES])
  status?: (typeof DISPUTE_STATUSES)[number];

  @IsOptional()
  @IsString()
  bookingId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  providerId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class SupportDisputeUpdateDto {
  @IsOptional()
  @IsIn([...DISPUTE_STATUSES])
  status?: (typeof DISPUTE_STATUSES)[number];

  @IsOptional()
  @IsString()
  resolution?: string | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  refundAmountCents?: number | null;

  @IsOptional()
  @IsString()
  refundCurrency?: string | null;

  @IsOptional()
  @IsString()
  assignedToId?: string | null;

  @IsOptional()
  @IsString()
  adminNotes?: string | null;
}
