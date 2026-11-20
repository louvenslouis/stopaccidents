// Look up the report's coordinates on web and native without GPS permission.
const endpoint =
  process.env.EXPO_PUBLIC_GEOCODING_URL || 'https://photon.komoot.io/reverse';
const routingEndpoint =
  process.env.EXPO_PUBLIC_ROUTING_URL || 'https://router.project-osrm.org/route/v1/driving';
const streetRadiusMeters = 75;
type LookupKind = 'zone' | 'street';
const cache = new Map<string, { value: string | null; expires: number }>();
const pending = new Map<string, Promise<string | null>>();
const cacheLifetime = 24 * 60 * 60 * 1000;
const failureLifetime = 60 * 1000;
let queue: Promise<unknown> = Promise.resolve();
let nextRequestAt = 0;

export function coordinatesKey(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): string | null {
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) return null;
  return `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Use address areas, never the name of a nearby shop or other point of interest. */
export function photonZone(payload: unknown): string | null {
  const features = record(payload)?.features;
  if (!Array.isArray(features)) return null;
  const address = record(record(features[0])?.properties);
  if (!address) return null;
  const text = (field: string) => {
    const value = address[field];
    return typeof value === 'string' ? value.trim() : '';
  };
  const placeName = ['locality', 'district', 'city'].includes(text('type'))
    ? text('name')
    : '';
  const area = text('locality') || text('district') || placeName;
  const city = text('city');
  const region = text('county') || text('state');
  const parts = area ? [area, city || region] : [city || region];
  const seen = new Set<string>();
  return parts.filter((part) => {
    const key = part.toLocaleLowerCase('fr');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(', ') || null;
}

export function cachedZone(key: string): string | null {
  const entry = cache.get(`zone:${key}`);
  return entry && entry.expires > Date.now() ? entry.value : null;
}

function nearestStreet(payload: unknown): string | null {
  const data = record(payload);
  if (data?.code !== 'Ok' || !Array.isArray(data.waypoints)) return null;
  // OSRM returns road segments in order of distance from the pin.
  for (const item of data.waypoints) {
    const road = record(item);
    if (typeof road?.distance === 'number' && road.distance >= 0 && road.distance <= streetRadiusMeters &&
        typeof road.name === 'string' && road.name.trim()) return road.name.trim();
  }
  return null;
}

async function lookup(key: string, kind: LookupKind): Promise<string | null> {
  const delay = nextRequestAt - Date.now();
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  nextRequestAt = Date.now() + 1000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const [latitude, longitude] = key.split(',');
    const url = new URL(kind === 'street' ? routingEndpoint : endpoint);
    if (kind === 'street') {
      url.pathname = url.pathname.replace('/route/v1/', '/nearest/v1/').replace(/\/$/, '') + `/${longitude},${latitude}`;
      url.searchParams.set('number', '4');
      url.searchParams.set('radiuses', String(streetRadiusMeters));
      url.searchParams.set('generate_hints', 'false');
    } else {
      url.searchParams.set('lat', latitude);
      url.searchParams.set('lon', longitude);
      url.searchParams.set('lang', 'fr');
      url.searchParams.set('limit', '1');
      url.searchParams.set('radius', '1');
    }
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      credentials: 'omit',
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return kind === 'street' ? nearestStreet(payload) : photonZone(payload);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function reverseGeocode(
  kind: LookupKind,
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): Promise<string | null> {
  const coordinates = coordinatesKey(latitude, longitude);
  if (!coordinates) return Promise.resolve(null);
  const key = `${kind}:${coordinates}`;
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) return Promise.resolve(entry.value);
  const existing = pending.get(key);
  if (existing) return existing;

  // Share card/detail requests, serialize lookups, and cache failures briefly.
  const request = queue.then(() => lookup(coordinates, kind)).then((value) => {
    cache.delete(key);
    cache.set(key, {
      value,
      expires: Date.now() + (value ? cacheLifetime : failureLifetime),
    });
    if (cache.size > 100) cache.delete(cache.keys().next().value!);
    pending.delete(key);
    return value;
  });
  pending.set(key, request);
  queue = request;
  return request;
}

export function reverseGeocodeZone(latitude: number | null | undefined, longitude: number | null | undefined) {
  return reverseGeocode('zone', latitude, longitude);
}

export function reverseGeocodeStreet(latitude: number, longitude: number) {
  return reverseGeocode('street', latitude, longitude);
}
