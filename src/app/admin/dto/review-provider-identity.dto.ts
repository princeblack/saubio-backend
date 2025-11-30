import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class ReviewProviderIdentityDto {
  @ApiProperty()
  @IsString()
  documentId!: string;

  @ApiProperty({ enum: ['verified', 'rejected'] })
  @IsIn(['verified', 'rejected'])
  status!: 'verified' | 'rejected';

  @ApiProperty({ required: false, description: 'Reason or comment sent to the provider' })
  @IsOptional()
  @IsString()
  @MinLength(5)
  notes?: string;
}
