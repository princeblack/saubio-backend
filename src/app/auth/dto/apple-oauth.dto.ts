import { IsNotEmpty, IsString } from 'class-validator';

export class AppleOAuthDto {
  @IsString()
  @IsNotEmpty()
  idToken!: string;
}
