import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@saubio/models';
import { PriceEstimateQueryDto } from './dto/price-estimate.dto';

@Controller('pricing')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get('config')
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('client', 'company', 'provider', 'employee', 'admin')
  getConfig() {
    return this.pricing.getPublicConfig();
  }

  @Get('loyalty/balance')
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('client', 'company', 'provider', 'employee', 'admin')
  getBalance(@CurrentUser() user: User) {
    return this.pricing.getLoyaltyBalance(user.id);
  }

  @Get('estimate')
  getPriceEstimate(@Query() params: PriceEstimateQueryDto) {
    return this.pricing.estimateLocalRates({
      postalCode: params.postalCode,
      hours: params.hours,
      service: params.service,
    });
  }
}
