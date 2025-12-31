import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const normalizeRole = ({ value }: { value?: string }) =>
  typeof value === 'string' ? value.toUpperCase() : value;

export class UpdateEmployeeRoleDto {
  @Transform(normalizeRole)
  @IsIn(['ADMIN', 'EMPLOYEE'])
  role!: 'ADMIN' | 'EMPLOYEE';

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  reason?: string;
}
