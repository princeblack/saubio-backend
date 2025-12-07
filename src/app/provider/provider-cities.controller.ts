import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProviderService } from './provider.service';

@ApiTags('provider-directory')
@Controller('directory/cities')
export class ProviderCitiesController {
  constructor(private readonly providerService: ProviderService) {}

  @Get()
  async list() {
    const cities = await this.providerService.listServiceCities();
    return { cities };
  }
}
