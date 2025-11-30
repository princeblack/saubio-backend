import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
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
import type { ServiceCategory } from '@saubio/models';

export class ProviderTeamMemberInputDto {
  @IsString()
  providerId!: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsBoolean()
  isLead?: boolean;

  @IsOptional()
  @IsInt()
  orderIndex?: number;
}

export class CreateProviderTeamDto {
  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  serviceCategories?: ServiceCategory[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  preferredSize?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  defaultDailyCapacity?: number;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProviderTeamMemberInputDto)
  members!: ProviderTeamMemberInputDto[];
}

export class UpdateProviderTeamDto extends PartialType(CreateProviderTeamDto) {}
