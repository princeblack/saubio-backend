import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDisputeDto {
  @IsString()
  @IsNotEmpty()
  bookingId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  initialMessage?: string;
}
