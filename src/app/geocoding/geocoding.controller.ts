import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { GeocodingService } from './geocoding.service';
import { GeocodingSuggestDto } from './dto/geocoding-suggest.dto';

@Controller('geocoding')
@UseGuards(AccessTokenGuard)
export class GeocodingController {
  constructor(private readonly geocodingService: GeocodingService) {}

  @Get('suggest')
  suggest(@Query() query: GeocodingSuggestDto) {
    return this.geocodingService.suggest(query.q);
  }
}
