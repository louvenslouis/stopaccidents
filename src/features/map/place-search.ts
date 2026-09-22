import { HAITI_BOUNDS } from '@/components/map-document';

const endpoint =
  process.env.EXPO_PUBLIC_GEOCODING_SEARCH_URL ||
  process.env.EXPO_PUBLIC_PLACE_SEARCH_URL ||
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

export function photonPlaces(payload: unknown): MapPlace[] {
  const features = record(payload)?.features;
  if (!Array.isArray(features)) return [];
  const places: MapPlace[] = [];
  const identities = new Set<string>();

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
    )
      continue;

    const properties = record(item?.properties);
    const text = (field: string) => {
      const value = properties?.[field];
      return typeof value === 'string' ? value.trim() : '';
    };
    if (text('countrycode') && text('countrycode').toUpperCase() !== 'HT')
      continue;
    const street = [text('housenumber'), text('street')]
      .filter(Boolean)
      .join(' ');
    const parts = [
      text('name'),
      street,
      text('district'),
      text('city'),
      text('state'),
    ];
    const seen = new Set<string>();
    const label = parts
      .filter((part) => {
        const key = part.toLocaleLowerCase('fr');
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .join(', ');

    const place = {
      latitude,
      longitude,
      label: (label || 'Lieu recherché').slice(0, 160),
    };
    // A city can be returned as both a point and its administrative boundary.
    const area = ['city', 'district', 'locality', 'county', 'state'].includes(
      text('type'),
    );
    const identity = `${area ? 'area' : `${latitude.toFixed(4)}:${longitude.toFixed(4)}`}:${place.label.toLocaleLowerCase('fr')}`;
    if (identities.has(identity)) continue;
    identities.add(identity);
    places.push(place);
  }
  return places;
}

export function photonPlace(payload: unknown): MapPlace | null {
  return photonPlaces(payload)[0] ?? null;
}

async function searchPlaces(
  query: string,
  limit: number,
  signal?: AbortSignal,
): Promise<MapPlace[]> {
  const value = query.trim().slice(0, 120);
  if (value.length < 2) return [];

  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const url = new URL(endpoint);
    url.searchParams.set('q', value);
    url.searchParams.set('lang', 'fr');
    url.searchParams.set('limit', String(limit));
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
    return photonPlaces(await response.json()).slice(0, limit);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export function searchMapPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<MapPlace[]> {
  return searchPlaces(query, 5, signal);
}

export async function searchMapPlace(
  query: string,
  signal?: AbortSignal,
): Promise<MapPlace | null> {
  return (await searchPlaces(query, 1, signal))[0] ?? null;
}
