import { Type, Transform } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { UserRole } from '@prisma/client';

const normalizeRole = ({ value }: { value?: string }) =>
  typeof value === 'string' ? value.toUpperCase() : value;

export class ListEmployeeUsersDto {
  @IsOptional()
  @Transform(normalizeRole)
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(['active', 'invited', 'suspended'])
  status?: 'active' | 'invited' | 'suspended';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}
