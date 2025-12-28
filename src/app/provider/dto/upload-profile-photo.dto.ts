import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadProfilePhotoDto {
  @IsString()
  fileData!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fileName?: string;
}
