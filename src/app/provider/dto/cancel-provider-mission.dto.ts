import { IsOptional, IsString } from 'class-validator';

export class CancelProviderMissionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
