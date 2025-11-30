import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class RequestPhoneVerificationDto {
  @ApiProperty({ example: '+491771234567' })
  @Matches(/^\+\d{7,15}$/, {
    message: 'phoneNumber must be a valid phone number',
  })
  phoneNumber!: string;
}
