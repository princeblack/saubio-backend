import { IsOptional, IsString } from 'class-validator';

export class ConfirmGdprDeletionDto {
  @IsOptional()
  @IsString()
  notes?: string;
}
