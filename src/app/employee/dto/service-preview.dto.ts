import { Transform } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Matches } from 'class-validator';
import { SERVICE_CATALOG } from '@saubio/models';

const SERVICE_IDS = SERVICE_CATALOG.map((service) => service.id);
const ECO_PREFS = ['standard', 'bio'] as const;

export class ServicePreviewQueryDto {
  @IsString()
  @IsIn(SERVICE_IDS, { message: 'unknown_service' })
  service!: string;

  @IsString()
  @Matches(/^[0-9A-Za-z\- ]{3,10}$/, { message: 'invalid_postal_code' })
  postalCode!: string;

  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber({ allowNaN: false, allowInfinity: false })
  hours!: number;

  @IsOptional()
  @IsIn(ECO_PREFS)
  ecoPreference?: (typeof ECO_PREFS)[number];
}
