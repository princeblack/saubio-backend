import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSupportMessageDto {
  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsBoolean()
  internal?: boolean;
}
