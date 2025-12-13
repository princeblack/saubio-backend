import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  Address,
  BookingMode,
  CleaningFrequency,
  EcoPreference,
  ServiceCategory,
} from '@saubio/models';

export const SERVICE_CATEGORY_VALUES: ServiceCategory[] = [
  'residential',
  'office',
  'industrial',
  'windows',
  'disinfection',
  'eco_plus',
  'carpet',
  'upholstery',
  'spring',
  'final',
  'cluttered',
];

export const CLEANING_FREQUENCY_VALUES: CleaningFrequency[] = [
  'once',
  'weekly',
  'biweekly',
  'monthly',
  'contract',
  'last_minute',
];

export const BOOKING_MODE_VALUES: BookingMode[] = ['manual', 'smart_match'];

export const ECO_PREFERENCE_VALUES: EcoPreference[] = ['standard', 'bio'];

export const SOIL_LEVEL_VALUES = ['light', 'normal', 'strong', 'extreme'] as const;

export class BookingAddressDto implements Omit<Address, 'coordinates'> {
  @IsString()
  streetLine1!: string;

  @IsOptional()
  @IsString()
  streetLine2?: string;

  @IsString()
  postalCode!: string;

  @IsString()
  city!: string;

  @IsString()
  countryCode!: string;

  @IsOptional()
  @IsString()
  accessNotes?: string;
}

export class BookingContactDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BookingAddressDto)
  address?: BookingAddressDto;
}

export class BookingServicePreferencesDto {
  @IsOptional()
  @IsString()
  @IsIn(SOIL_LEVEL_VALUES)
  soilLevel?: (typeof SOIL_LEVEL_VALUES)[number];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  wishes?: string[];

  @IsOptional()
  @IsObject()
  upholsteryQuantities?: Record<string, number>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  upholsteryAddons?: string[];

  @IsOptional()
  @IsString()
  additionalInstructions?: string;
}

export class CreateBookingDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @ValidateNested()
  @Type(() => BookingAddressDto)
  address!: BookingAddressDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BookingAddressDto)
  billingAddress?: BookingAddressDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BookingContactDto)
  contact?: BookingContactDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BookingContactDto)
  onsiteContact?: BookingContactDto;

  @IsString()
  @IsIn(SERVICE_CATEGORY_VALUES)
  service!: ServiceCategory;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(10)
  @Max(100000)
  surfacesSquareMeters?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(2)
  @Max(12)
  durationHours?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(2)
  @Max(12)
  recommendedHours?: number;

  @IsOptional()
  @IsBoolean()
  durationManuallyAdjusted?: boolean;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsString()
  @IsIn(CLEANING_FREQUENCY_VALUES)
  frequency!: CleaningFrequency;

  @IsString()
  @IsIn(BOOKING_MODE_VALUES)
  mode!: BookingMode;

  @IsString()
  @IsIn(ECO_PREFERENCE_VALUES)
  ecoPreference!: EcoPreference;

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BookingServicePreferencesDto)
  servicePreferences?: BookingServicePreferencesDto;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  requiredProviders?: number;

  @IsOptional()
  @IsString()
  preferredTeamId?: string;

  @IsOptional()
  @IsArray()
  providerIds?: string[];

  @IsOptional()
  @IsArray()
  attachments?: string[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  opsNotes?: string;

  @IsOptional()
  @IsString()
  providerNotes?: string;

  @IsOptional()
  @IsDateString()
  reminderAt?: string;

  @IsOptional()
  @IsString()
  reminderNotes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  leadTimeDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedDepositCents?: number;

  @IsOptional()
  @IsBoolean()
  shortNotice?: boolean;
}

export class CreateGuestBookingDto extends CreateBookingDto {
  @IsString()
  guestToken!: string;
}

export class ClaimBookingDto {
  @IsString()
  guestToken!: string;
}
