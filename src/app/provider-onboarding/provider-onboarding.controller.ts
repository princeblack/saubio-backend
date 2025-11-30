import { Body, Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProviderOnboardingService } from './provider-onboarding.service';
import { CreateProviderOnboardingDto } from './dto/create-provider-onboarding.dto';

@ApiTags('provider-onboarding')
@Controller('register/provider')
export class ProviderOnboardingController {
  constructor(private readonly providerOnboardingService: ProviderOnboardingService) {}

  @Post()
  @ApiOperation({ summary: 'Submit provider onboarding request' })
  @ApiCreatedResponse({ description: 'Provider onboarding request created.' })
  create(@Body() payload: CreateProviderOnboardingDto) {
    return this.providerOnboardingService.create(payload);
  }
}
