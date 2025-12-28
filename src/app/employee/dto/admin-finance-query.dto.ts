import { Transform } from 'class-transformer';
import { IsIn, IsNumberString, IsOptional, IsString } from 'class-validator';

const PAYMENT_STATUSES = [
  'pending',
  'requires_action',
  'authorized',
  'capture_pending',
  'captured',
  'held',
  'released',
  'refunded',
  'failed',
  'disputed',
] as const;

const PAYMENT_METHODS = ['card', 'sepa', 'paypal'] as const;

const PROVIDER_PAYOUT_STATUSES = ['pending', 'processing', 'paid', 'failed'] as const;

export class FinanceRangeQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

export class FinancePaginationQueryDto extends FinanceRangeQueryDto {
  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  pageSize?: string;
}

export class FinancePaymentsQueryDto extends FinancePaginationQueryDto {
  @IsOptional()
  @IsIn([...PAYMENT_STATUSES])
  status?: (typeof PAYMENT_STATUSES)[number];

  @IsOptional()
  @IsIn([...PAYMENT_METHODS])
  method?: (typeof PAYMENT_METHODS)[number];

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  service?: string;

  @IsOptional()
  @IsString()
  bookingId?: string;

  @IsOptional()
  @IsString()
  clientEmail?: string;
}

export class FinancePayoutsQueryDto extends FinancePaginationQueryDto {
  @IsOptional()
  @IsIn([...PROVIDER_PAYOUT_STATUSES])
  status?: (typeof PROVIDER_PAYOUT_STATUSES)[number];

  @IsOptional()
  @IsString()
  providerId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class FinanceCommissionsQueryDto extends FinanceRangeQueryDto {
  @IsOptional()
  @IsString()
  service?: string;

  @IsOptional()
  @IsString()
  city?: string;
}

export class FinanceInvoicesQueryDto extends FinanceRangeQueryDto {
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
