import de from '../locales/de/translation.json';
import en from '../locales/en/translation.json';
import fr from '../locales/fr/translation.json';

export const locales = ['de', 'en', 'fr'] as const;
export type LocaleCode = (typeof locales)[number];

export const localeResources: Record<LocaleCode, { translation: Record<string, unknown> }> = {
  de: { translation: de },
  en: { translation: en },
  fr: { translation: fr },
};

export const defaultLocale: LocaleCode = 'de';

export const localeNames: Record<LocaleCode, string> = {
  de: 'Deutsch',
  en: 'English',
  fr: 'Français',
};
