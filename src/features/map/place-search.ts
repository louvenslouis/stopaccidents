import { HAITI_BOUNDS } from '@/components/map-document';

const endpoint =
  process.env.EXPO_PUBLIC_GEOCODING_SEARCH_URL ||
  'https://photon.komoot.io/api';

export type MapPlace = {
  latitude: number;
  longitude: number;
  label: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function photonPlace(payload: unknown): MapPlace | null {
  const features = record(payload)?.features;
  if (!Array.isArray(features)) return null;

  for (const feature of features) {
    const item = record(feature);
    const geometry = record(item?.geometry);
    const coordinates = geometry?.coordinates;
    if (!Array.isArray(coordinates)) continue;
    const longitude = coordinates[0];
    const latitude = coordinates[1];
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < HAITI_BOUNDS[0][0] ||
      latitude > HAITI_BOUNDS[1][0] ||
      longitude < HAITI_BOUNDS[0][1] ||
      longitude > HAITI_BOUNDS[1][1]
    ) continue;

    const properties = record(item?.properties);
    const text = (field: string) => {
      const value = properties?.[field];
      return typeof value === 'string' ? value.trim() : '';
    };
    const parts = [text('name'), text('city') || text('district'), text('state')];
    const seen = new Set<string>();
    const label = parts
      .filter((part) => {
        const key = part.toLocaleLowerCase('fr');
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .join(', ');

    return {
      latitude,
      longitude,
      label: (label || 'Lieu recherché').slice(0, 160),
    };
  }
  return null;
}

export async function searchMapPlace(query: string): Promise<MapPlace | null> {
  const value = query.trim().slice(0, 120);
  if (value.length < 2) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const url = new URL(endpoint);
    url.searchParams.set('q', value);
    url.searchParams.set('lang', 'fr');
    url.searchParams.set('limit', '1');
    url.searchParams.set(
      'bbox',
      `${HAITI_BOUNDS[0][1]},${HAITI_BOUNDS[0][0]},${HAITI_BOUNDS[1][1]},${HAITI_BOUNDS[1][0]}`,
    );
    url.searchParams.set('countrycode', 'HT');
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      credentials: 'omit',
    });
    if (!response.ok) throw new Error('Place search failed');
    return photonPlace(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}
