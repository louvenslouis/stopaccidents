import { HAITI_BOUNDS } from '@/components/map-document';

export type PlaceSearchResult = {
  id: string;
  address: string;
  latitude: number;
  longitude: number;
};

const searchEndpoint = process.env.EXPO_PUBLIC_PLACE_SEARCH_URL || 'https://photon.komoot.io/api';
const reverseEndpoint = process.env.EXPO_PUBLIC_GEOCODING_URL || 'https://photon.komoot.io/reverse';

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(properties: Record<string, unknown>, key: string) {
  const value = properties[key];
  return typeof value === 'string' ? value.trim() : '';
}

function inHaitiBounds(latitude: number, longitude: number) {
  return (
    latitude >= HAITI_BOUNDS[0][0] &&
    latitude <= HAITI_BOUNDS[1][0] &&
    longitude >= HAITI_BOUNDS[0][1] &&
    longitude <= HAITI_BOUNDS[1][1]
  );
}

function featureAddress(properties: Record<string, unknown>) {
  const name = text(properties, 'name');
  const street = text(properties, 'street');
  const houseNumber = text(properties, 'housenumber');
  const locality = text(properties, 'locality') || text(properties, 'district');
  const city = text(properties, 'city');
  const state = text(properties, 'state');
  const streetLine = [houseNumber, street].filter(Boolean).join(' ');
  const candidates = [name, streetLine, locality, city, state];
  const seen = new Set<string>();
  return candidates
    .filter((part) => {
      const key = part.toLocaleLowerCase('fr');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(', ');
}

export function parsePhotonPlaces(payload: unknown): PlaceSearchResult[] {
  const features = record(payload)?.features;
  if (!Array.isArray(features)) return [];

  return features.flatMap((feature, index) => {
    const item = record(feature);
    const geometry = record(item?.geometry);
    const coordinates = geometry?.coordinates;
    const properties = record(item?.properties);
    if (!properties || !Array.isArray(coordinates)) return [];
    const longitude = coordinates[0];
    const latitude = coordinates[1];
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !inHaitiBounds(latitude, longitude)
    )
      return [];
    const address = featureAddress(properties);
    if (!address) return [];
    const sourceId = text(properties, 'osm_id') || `${latitude},${longitude}`;
    return [{ id: `${sourceId}-${index}`, address, latitude, longitude }];
  });
}

async function photonRequest(url: URL, signal?: AbortSignal) {
  const response = await fetch(url.toString(), {
    signal,
    headers: { Accept: 'application/json' },
    credentials: 'omit',
  });
  if (!response.ok) throw new Error('Le service de recherche de lieux est indisponible.');
  return response.json();
}

export async function searchSavedPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<PlaceSearchResult[]> {
  const normalized = query.trim();
  if (normalized.length < 2) return [];
  const url = new URL(searchEndpoint);
  url.searchParams.set('q', normalized);
  url.searchParams.set('lang', 'fr');
  url.searchParams.set('limit', '6');
  url.searchParams.set(
    'bbox',
    `${HAITI_BOUNDS[0][1]},${HAITI_BOUNDS[0][0]},${HAITI_BOUNDS[1][1]},${HAITI_BOUNDS[1][0]}`,
  );
  return parsePhotonPlaces(await photonRequest(url, signal));
}

export async function reverseGeocodeSavedPlace(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<string> {
  if (!inHaitiBounds(latitude, longitude))
    throw new Error('Choisissez un point dans la zone d’Haïti affichée.');
  const url = new URL(reverseEndpoint);
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lon', String(longitude));
  url.searchParams.set('lang', 'fr');
  url.searchParams.set('limit', '1');
  try {
    const places = parsePhotonPlaces(await photonRequest(url, signal));
    return places[0]?.address || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }
}
