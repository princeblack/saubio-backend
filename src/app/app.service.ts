import { Injectable } from '@nestjs/common';
import { appConfig } from '@saubio/config';

@Injectable()
export class AppService {
  getInfo() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      defaultLocale: appConfig.defaultLocale,
      supportedLocales: appConfig.locales,
    };
  }
}
