import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class MarkManyNotificationsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];

  @IsOptional()
  @IsBoolean()
  all?: boolean;

  @IsOptional()
  @IsString()
  targetUserId?: string;
}
