import { Module } from '@nestjs/common';
import { PromoCodeService } from './promo-code.service';

@Module({
  providers: [PromoCodeService],
  exports: [PromoCodeService],
})
export class MarketingModule {}
