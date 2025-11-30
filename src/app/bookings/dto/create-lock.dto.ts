import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateBookingLockDto {
  @IsOptional()
  @IsString()
  providerTeamId?: string;

  @ValidateIf((value) => !value.providerTeamId)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  @IsOptional()
  providerIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  lockedCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  expiresInMinutes?: number;
}

export class ConfirmBookingLocksDto {
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  lockIds?: string[];
}

export class ReleaseBookingLocksDto {
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  lockIds?: string[];
}
