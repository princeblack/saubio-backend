import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ProviderPayoutSetupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  accountHolder!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(15)
  @MaxLength(34)
  @Matches(/^[A-Z0-9 ]+$/i, { message: 'IBAN_INVALID_FORMAT' })
  iban!: string;

  @IsOptional()
  @IsString()
  signatureDate?: string;
}
