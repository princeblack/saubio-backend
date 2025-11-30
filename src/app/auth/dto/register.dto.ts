import { IsArray, IsEmail, IsOptional, IsPhoneNumber, IsString, MinLength } from 'class-validator';
import { UserRole } from '@saubio/models';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsOptional()
  @IsPhoneNumber('DE')
  phone?: string;

  @IsArray()
  roles!: UserRole[];

  @IsString()
  preferredLocale!: string;
}
