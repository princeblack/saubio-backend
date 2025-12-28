import { Injectable } from '@nestjs/common';
import { postalCityMap, type PostalCityInfo } from './postal-code-map';

export type PostalCodeLookupResult = PostalCityInfo & {
  postalCode: string;
  normalizedCity: string;
};

@Injectable()
export class PostalCodeService {
  private cachedEntries: Array<PostalCityInfo & { postalCode: string }> | null = null;

  lookup(postalCode: string | null | undefined): PostalCodeLookupResult | null {
    const normalizedPostal = this.normalizePostalCode(postalCode);
    if (!normalizedPostal) {
      return null;
    }
    const payload = postalCityMap[normalizedPostal];
    if (!payload) {
      return null;
    }
    const normalizedCity = this.normalizeCityName(payload.city);
    return {
      postalCode: normalizedPostal,
      ...payload,
      normalizedCity: normalizedCity ?? payload.city.toLowerCase(),
    };
  }

  normalizePostalCode(input: string | null | undefined): string | null {
    if (!input) {
      return null;
    }
    const digits = input.replace(/\D/g, '');
    if (digits.length < 5) {
      return null;
    }
    return digits.slice(0, 5);
  }

  normalizeCityName(input: string | null | undefined): string | null {
    if (!input) {
      return null;
    }
    const trimmed = input.trim();
    if (!trimmed) {
      return null;
    }
    return trimmed
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  cityVariants(input: string | null | undefined): string[] {
    if (!input) {
      return [];
    }
    const trimmed = input.trim();
    if (!trimmed) {
      return [];
    }
    const lower = trimmed.toLowerCase();
    const upper = trimmed.toUpperCase();
    const title = trimmed
      .split(' ')
      .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase())
      .join(' ');
    return Array.from(new Set([trimmed, title, lower, upper]));
  }

  listEntries(): Array<PostalCityInfo & { postalCode: string }> {
    if (this.cachedEntries) {
      return this.cachedEntries;
    }
    this.cachedEntries = Object.entries(postalCityMap).map(([postalCode, info]) => ({
      postalCode,
      ...info,
    }));
    return this.cachedEntries;
  }
}
