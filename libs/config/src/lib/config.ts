import { defaultLocale, locales } from './locales';

export interface AppConfig {
  locales: string[];
  defaultLocale: string;
  supportedCities: string[];
  supportEmail: string;
  supportPhone: string;
  apiBaseUrl: string;
  launchDiscount: {
    label: string;
    expiresAt: string;
  };
}

const env = typeof process !== 'undefined' ? process.env : undefined;

const resolveDefaultApiBaseUrl = () => {
  if (typeof window !== 'undefined' && window.location) {
    const { origin, hostname } = window.location;
    const isLocalHost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.endsWith('.local');
    if (!isLocalHost) {
      return `${origin.replace(/\/+$/, '')}/api`;
    }
  } else if (env?.['VERCEL_URL']) {
    const base = env['VERCEL_URL'].replace(/\/+$/, '');
    const protocol = base.startsWith('http://') || base.startsWith('https://') ? '' : 'https://';
    return `${protocol}${base}/api`;
  }

  return 'http://localhost:3001/api';
};

export const getApiBaseUrl = () =>
  env?.['NEXT_PUBLIC_API_BASE_URL'] ??
  env?.['EXPO_PUBLIC_API_BASE_URL'] ??
  env?.['SAUBIO_API_BASE_URL'] ??
  env?.['API_BASE_URL'] ??
  resolveDefaultApiBaseUrl();

const baseConfig = {
  locales: [...locales],
  defaultLocale,
  supportedCities: ['Berlin', 'Hamburg', 'München', 'Köln', 'Frankfurt'],
  supportEmail: 'support@saubio.de',
  supportPhone: '+49 30 123 456 78',
  launchDiscount: {
    label: '-15 % auf Bio-Reinigung',
    expiresAt: '2024-11-30',
  },
};

export const appConfig = {
  ...baseConfig,
  get apiBaseUrl() {
    return getApiBaseUrl();
  },
} satisfies AppConfig;
