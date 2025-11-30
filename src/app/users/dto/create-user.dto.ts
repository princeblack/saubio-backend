import { IsArray, IsBoolean, IsEmail, IsOptional, IsPhoneNumber, IsString } from 'class-validator';
import { UserRole } from '@saubio/models';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsPhoneNumber('DE')
  phone?: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsArray()
  roles!: UserRole[];

  @IsString()
  preferredLocale!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
