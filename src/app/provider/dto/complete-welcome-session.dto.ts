import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CompleteWelcomeSessionDto {
  @ApiProperty({
    description: 'Provider profile ID to mark as having completed the welcome session.',
  })
  @IsString()
  providerId!: string;
}
