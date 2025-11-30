import { Transform } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

const SERVICE_OPTIONS = ['residential', 'office', 'industrial', 'windows', 'disinfection', 'eco_plus'] as const;

export class PriceEstimateQueryDto {
  @IsString()
  postalCode!: string;

  @Transform(({ value }) => (typeof value === 'string' ? parseFloat(value) : Number(value)))
  @IsNumber()
  @Min(1)
  @Max(12)
  hours!: number;

  @IsOptional()
  @IsString()
  @IsIn(SERVICE_OPTIONS)
  service?: (typeof SERVICE_OPTIONS)[number];
}
