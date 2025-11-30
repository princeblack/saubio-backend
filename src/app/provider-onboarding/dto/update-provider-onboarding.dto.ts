import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ProviderOnboardingStatus } from '@prisma/client';

export class UpdateProviderOnboardingDto {
  @ApiProperty({ enum: ProviderOnboardingStatus })
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsEnum(ProviderOnboardingStatus)
  status!: ProviderOnboardingStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reviewer?: string;
}
