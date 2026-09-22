import { HAITI_BOUNDS } from '@/components/map-document';
import { supabase } from '@/lib/supabase';

export type SavedPlace = {
  address: string;
  latitude: number | null;
  longitude: number | null;
};

export type SavedPlaces = {
  home: SavedPlace | null;
  work: SavedPlace | null;
};

const EMPTY_PLACES: SavedPlaces = { home: null, work: null };

function normalizedAddress(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizePlace(place: SavedPlace | null): SavedPlace | null {
  if (!place) return null;
  return { ...place, address: normalizedAddress(place.address) };
}

export function normalizeSavedPlaces(places: SavedPlaces): SavedPlaces {
  return {
    home: normalizePlace(places.home),
    work: normalizePlace(places.work),
  };
}

function validCoordinates(place: SavedPlace) {
  return (
    typeof place.latitude === 'number' &&
    typeof place.longitude === 'number' &&
    Number.isFinite(place.latitude) &&
    Number.isFinite(place.longitude) &&
    place.latitude >= HAITI_BOUNDS[0][0] &&
    place.latitude <= HAITI_BOUNDS[1][0] &&
    place.longitude >= HAITI_BOUNDS[0][1] &&
    place.longitude <= HAITI_BOUNDS[1][1]
  );
}

export function validateSavedPlaces(places: SavedPlaces): string | null {
  const normalized = normalizeSavedPlaces(places);
  if (!normalized.home && !normalized.work) return 'Choisissez au moins un lieu.';
  for (const place of [normalized.home, normalized.work]) {
    if (!place) continue;
    if (place.address.length < 3) return 'Le nom du lieu doit contenir au moins 3 caractères.';
    if (place.address.length > 500)
      return 'Le nom du lieu doit contenir au maximum 500 caractères.';
    if (!validCoordinates(place))
      return 'Choisissez chaque lieu sur la carte pour enregistrer ses coordonnées précises.';
  }
  return null;
}

function readPlace(address: unknown, latitude: unknown, longitude: unknown): SavedPlace | null {
  if (typeof address !== 'string' || !address.trim()) return null;
  return {
    address,
    latitude: typeof latitude === 'number' && Number.isFinite(latitude) ? latitude : null,
    longitude: typeof longitude === 'number' && Number.isFinite(longitude) ? longitude : null,
  };
}

export async function readSavedPlaces(): Promise<SavedPlaces> {
  const { data, error } = await supabase
    .from('user_saved_places')
    .select('home_address,home_latitude,home_longitude,work_address,work_latitude,work_longitude')
    .maybeSingle();

  if (error) throw new Error('Impossible de charger vos lieux enregistrés.');
  if (!data) return EMPTY_PLACES;
  return {
    home: readPlace(data.home_address, data.home_latitude, data.home_longitude),
    work: readPlace(data.work_address, data.work_latitude, data.work_longitude),
  };
}

export async function saveSavedPlaces(userId: string, places: SavedPlaces) {
  const normalized = normalizeSavedPlaces(places);
  const validation = validateSavedPlaces(normalized);
  if (validation) throw new Error(validation);

  const { error } = await supabase.from('user_saved_places').upsert(
    {
      user_id: userId,
      home_address: normalized.home?.address || '',
      home_latitude: normalized.home?.latitude ?? null,
      home_longitude: normalized.home?.longitude ?? null,
      work_address: normalized.work?.address || '',
      work_latitude: normalized.work?.latitude ?? null,
      work_longitude: normalized.work?.longitude ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error('Impossible d’enregistrer vos lieux. Réessayez dans un instant.');
  return normalized;
}
