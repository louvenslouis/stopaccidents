import { supabase } from '@/lib/supabase';

export type SavedPlaces = {
  homeAddress: string;
  workAddress: string;
};

const EMPTY_PLACES: SavedPlaces = { homeAddress: '', workAddress: '' };

function normalizedAddress(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeSavedPlaces(places: SavedPlaces): SavedPlaces {
  return {
    homeAddress: normalizedAddress(places.homeAddress),
    workAddress: normalizedAddress(places.workAddress),
  };
}

export function validateSavedPlaces(places: SavedPlaces): string | null {
  const normalized = normalizeSavedPlaces(places);
  if (!normalized.homeAddress && !normalized.workAddress) return 'Saisissez au moins une adresse.';
  if (
    (normalized.homeAddress && normalized.homeAddress.length < 3) ||
    (normalized.workAddress && normalized.workAddress.length < 3)
  )
    return 'Chaque adresse doit contenir au moins 3 caractères.';
  if (normalized.homeAddress.length > 500 || normalized.workAddress.length > 500)
    return 'Chaque adresse doit contenir au maximum 500 caractères.';
  return null;
}

export async function readSavedPlaces(): Promise<SavedPlaces> {
  const { data, error } = await supabase
    .from('user_saved_places')
    .select('home_address,work_address')
    .maybeSingle();

  if (error) throw new Error('Impossible de charger vos adresses enregistrées.');
  if (!data) return EMPTY_PLACES;
  return {
    homeAddress: typeof data.home_address === 'string' ? data.home_address : '',
    workAddress: typeof data.work_address === 'string' ? data.work_address : '',
  };
}

export async function saveSavedPlaces(userId: string, places: SavedPlaces) {
  const normalized = normalizeSavedPlaces(places);
  const validation = validateSavedPlaces(normalized);
  if (validation) throw new Error(validation);

  const { error } = await supabase.from('user_saved_places').upsert(
    {
      user_id: userId,
      home_address: normalized.homeAddress,
      work_address: normalized.workAddress,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error('Impossible d’enregistrer vos adresses. Réessayez dans un instant.');
  return normalized;
}
