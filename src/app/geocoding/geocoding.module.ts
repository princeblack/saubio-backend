import { Module } from '@nestjs/common';
import { GeocodingController } from './geocoding.controller';
import { GeocodingService } from './geocoding.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [GeocodingController],
  providers: [GeocodingService],
  exports: [GeocodingService],
})
export class GeocodingModule {}
