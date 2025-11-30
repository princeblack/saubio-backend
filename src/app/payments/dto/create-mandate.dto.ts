import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateMandateDto {
  @IsString()
  @MinLength(3)
  consumerName!: string;

  @IsString()
  @MinLength(5)
  consumerAccount!: string; // IBAN

  @IsOptional()
  @IsDateString()
  signatureDate?: string;
}
