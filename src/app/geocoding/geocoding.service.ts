import { Injectable, Logger } from '@nestjs/common';
import type { AddressSuggestion } from '@saubio/models';

type PhotonFeature = {
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    district?: string;
    county?: string;
    locality?: string;
    countrycode?: string;
    state?: string;
  };
  geometry?: {
    coordinates?: [number, number];
  };
};

type PhotonResponse = {
  features?: PhotonFeature[];
};

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly cache = new Map<string, { expiresAt: number; data: AddressSuggestion[] }>();
  private readonly ttlMs = 1000 * 60 * 5;

  async suggest(query: string): Promise<AddressSuggestion[]> {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return [];
    }

    const cached = this.cache.get(normalized);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const suggestions = await this.fetchFromPhoton(normalized);
    this.cache.set(normalized, { data: suggestions, expiresAt: Date.now() + this.ttlMs });

    return suggestions;
  }

  private async fetchFromPhoton(query: string): Promise<AddressSuggestion[]> {
    const url = new URL('https://photon.komoot.io/api/');
    url.searchParams.set('q', query);
    url.searchParams.set('lang', 'de');
    url.searchParams.set('limit', '5');

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'SaubioApp/1.0 (geocoding)',
        },
      });

      if (!response.ok) {
        this.logger.warn(`Photon request failed with status ${response.status}`);
        return [];
      }

      const payload = (await response.json()) as PhotonResponse;
      const features = payload.features ?? [];

      return features
        .filter((feature) => feature.properties?.countrycode?.toUpperCase() === 'DE')
        .map((feature, index) => this.mapFeatureToSuggestion(feature, index))
        .filter((suggestion): suggestion is AddressSuggestion => Boolean(suggestion));
    } catch (error) {
      this.logger.error('Unable to reach Photon geocoder', error instanceof Error ? error.stack : error);
      return [];
    }
  }

  private mapFeatureToSuggestion(feature: PhotonFeature, index: number): AddressSuggestion | null {
    const street = feature.properties?.street ?? feature.properties?.name;
    const housenumber = feature.properties?.housenumber ?? '';
    const labelParts = [
      [street, housenumber].filter(Boolean).join(' ').trim(),
      feature.properties?.postcode,
      feature.properties?.city,
    ].filter(Boolean);

    if (!street || labelParts.length === 0) {
      return null;
    }

    const [longitude, latitude] = feature.geometry?.coordinates ?? [undefined, undefined];
    const district =
      feature.properties?.district ??
      feature.properties?.county ??
      feature.properties?.locality ??
      feature.properties?.state ??
      null;

    return {
      id: `${street}-${feature.properties?.postcode ?? ''}-${index}`,
      label: labelParts.join(', '),
      street: [street, housenumber].filter(Boolean).join(' ').trim(),
      postalCode: feature.properties?.postcode ?? '',
      city: feature.properties?.city ?? '',
      countryCode: feature.properties?.countrycode?.toUpperCase() ?? 'DE',
      district: district ?? undefined,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
    };
  }
}
