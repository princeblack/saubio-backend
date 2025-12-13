import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsIn, IsString } from 'class-validator';
import type { ServiceCategory } from '@saubio/models';
import { SERVICE_TYPE_IDS } from '../service-type-catalog';

export class UpdateProviderServicesDto {
  @ApiProperty({
    type: [String],
    enum: SERVICE_TYPE_IDS,
    description: 'Liste der Service-Typen, die der Provider anbietet.',
    default: [],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  @IsIn(SERVICE_TYPE_IDS, { each: true })
  serviceTypes: ServiceCategory[] = [];
}
