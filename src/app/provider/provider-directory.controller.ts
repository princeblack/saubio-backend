import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ProviderService } from './provider.service';
import { ProviderDirectoryDto } from './dto/provider-directory.dto';

@ApiTags('provider-directory')
@Controller('directory/providers')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('client', 'company', 'employee', 'admin')
export class ProviderDirectoryController {
  constructor(private readonly providerService: ProviderService) {}

  @Get()
  list(@Query() filters: ProviderDirectoryDto) {
    return this.providerService.listDirectoryProviders(filters);
  }
}
