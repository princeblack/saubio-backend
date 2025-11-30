import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ProviderType } from '@prisma/client';

export class CreateProviderOnboardingDto {
  @ApiProperty({ enum: ProviderType })
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsEnum(ProviderType)
  type!: ProviderType;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  contactName!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  languages!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  serviceAreas!: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  message?: string;
}
