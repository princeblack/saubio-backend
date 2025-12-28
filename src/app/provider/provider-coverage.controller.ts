import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ProviderService } from './provider.service';
import type { PostalCoverageResponse } from '@saubio/models';

@Controller('directory/coverage')
export class ProviderCoverageController {
  constructor(private readonly providers: ProviderService) {}

  @Get()
  async coverage(@Query('postalCode') postalCode?: string): Promise<PostalCoverageResponse> {
    if (!postalCode) {
      throw new BadRequestException('POSTAL_CODE_REQUIRED');
    }
    return this.providers.checkPostalCoverage(postalCode);
  }
}
