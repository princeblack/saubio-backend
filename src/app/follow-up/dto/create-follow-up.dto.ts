import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';

export class CreatePostalFollowUpDto {
  @IsEmail()
  email!: string;

  @IsString()
  postalCode!: string;

  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;
}
