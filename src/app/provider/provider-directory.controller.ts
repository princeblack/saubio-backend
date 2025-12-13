import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProviderService } from './provider.service';
import { ProviderDirectoryDto } from './dto/provider-directory.dto';

@ApiTags('provider-directory')
@Controller('directory/providers')
export class ProviderDirectoryController {
  constructor(private readonly providerService: ProviderService) {}

  @Get()
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  list(@Query() filters: ProviderDirectoryDto) {
    return this.providerService.listDirectoryProviders(filters);
  }

  @Get(':providerId/details')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  details(@Param('providerId') providerId: string) {
    return this.providerService.getDirectoryProviderDetails(providerId);
  }
}
