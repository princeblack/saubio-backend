import { IsOptional, IsString } from 'class-validator';

export class AssignDisputeDto {
  @IsOptional()
  @IsString()
  assigneeId?: string;
}
