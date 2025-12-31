import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AppleOAuthDto {
  @IsString()
  @IsNotEmpty()
  idToken!: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
