import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

const ISO_COUNTRY_REGEX = /^[A-Z]{2}$/;

export class CompleteIdentityDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  lastName!: string;

  @ApiProperty({ enum: ['male', 'female', 'other'] })
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsIn(['male', 'female', 'other'])
  gender!: 'male' | 'female' | 'other';

  @ApiProperty()
  @IsDateString()
  birthDate!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  birthCity!: string;

  @ApiProperty({ description: 'ISO 3166-1 alpha-2 country code' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @Matches(ISO_COUNTRY_REGEX)
  birthCountry!: string;

  @ApiProperty({ description: 'ISO 3166-1 alpha-2 nationality code' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @Matches(ISO_COUNTRY_REGEX)
  nationality!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  acceptLanguage?: string;

  @ApiProperty()
  @IsBoolean()
  acceptTerms!: boolean;
}
