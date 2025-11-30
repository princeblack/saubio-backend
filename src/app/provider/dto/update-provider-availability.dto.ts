import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class ProviderAvailabilitySlotDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @IsInt()
  @Min(0)
  @Max(24 * 60 - 15)
  startMinutes!: number;

  @IsInt()
  @Min(15)
  @Max(24 * 60)
  endMinutes!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateProviderAvailabilityDto {
  @IsOptional()
  @IsString()
  timezone?: string;

  @IsArray()
  @ArrayMaxSize(56)
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => ProviderAvailabilitySlotDto)
  slots!: ProviderAvailabilitySlotDto[];
}
