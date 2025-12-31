import { IsString } from 'class-validator';

export class RejectGdprRequestDto {
  @IsString()
  reason!: string;
}
