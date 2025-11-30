import { appConfig } from './config';

describe('appConfig', () => {
  it('exposes required launch configuration', () => {
    expect(appConfig.defaultLocale).toBe('de');
    expect(appConfig.locales).toContain('fr');
    expect(appConfig.supportEmail).toMatch(/@saubio\.de$/);
    expect(appConfig.apiBaseUrl).toMatch(/^http:\/\/localhost:3001\/api|https?:\/\//);
  });
});
