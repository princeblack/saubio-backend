import { Module } from '@nestjs/common';
import { GeocodingController } from './geocoding.controller';
import { GeocodingService } from './geocoding.service';
import { AuthModule } from '../auth/auth.module';
import { PostalCodeService } from './postal-code.service';
import { PostalCodeController } from './postal-code.controller';

@Module({
  imports: [AuthModule],
  controllers: [GeocodingController, PostalCodeController],
  providers: [GeocodingService, PostalCodeService],
  exports: [GeocodingService, PostalCodeService],
})
export class GeocodingModule {}
