import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';
import { AuthModule } from '../auth/auth.module';
import { GeocodingModule } from '../geocoding/geocoding.module';

@Module({
  imports: [PrismaModule, AuthModule, GeocodingModule],
  controllers: [PricingController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
