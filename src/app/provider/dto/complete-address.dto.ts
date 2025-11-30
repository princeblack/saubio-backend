import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CompleteAddressDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  streetLine1!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  streetLine2?: string;

  @ApiProperty()
  @IsString()
  postalCode!: string;

  @ApiProperty()
  @IsString()
  city!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiProperty({ default: 'DE' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @Matches(/^DE$/i, {
    message: 'Only German addresses are supported for now.',
  })
  country!: string;
}
