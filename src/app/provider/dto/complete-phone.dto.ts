import { ApiProperty } from '@nestjs/swagger';
import { IsPhoneNumber, IsString, Length } from 'class-validator';

export class CompletePhoneDto {
  @ApiProperty({
    description: 'Code reçu par SMS',
  })
  @IsString()
  @Length(4, 12)
  verificationCode!: string;
}
