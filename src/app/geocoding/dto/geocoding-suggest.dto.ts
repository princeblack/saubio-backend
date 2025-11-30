import { IsString, MinLength } from 'class-validator';

export class GeocodingSuggestDto {
  @IsString()
  @MinLength(3)
  q!: string;
}
