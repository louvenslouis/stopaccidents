import type { LocationObject } from 'expo-location';
import { supabase } from '@/lib/supabase';

export type ShareSession = { token: string; expires_at: string; owner: string; background?: boolean };
export type IncomingLocation = {
  connection_id: string; alias: string; latitude: number; longitude: number;
  accuracy: number | null; captured_at: string; expires_at: string;
};
export type ShareSnapshot = {
  outgoing: { connections: string[]; expires_at: string } | null;
  incoming: IncomingLocation[];
};
export const EMPTY_SHARES: ShareSnapshot = { outgoing: null, incoming: [] };

export async function readLocationShares(signal?: AbortSignal): Promise<ShareSnapshot> {
  const query = supabase.rpc('read_location_shares');
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  if (error || !data || !Array.isArray(data.incoming)) throw new Error('Impossible de charger les positions.');
  return data;
}

export async function startLocationShare(connections: string[], minutes: number, owner: string): Promise<ShareSession> {
  if (!connections.length || ![15, 60, 480].includes(minutes)) throw new Error('Choisissez au moins un proche.');
  const { data, error } = await supabase.rpc('start_location_share', { p_connections: [...new Set(connections)], p_minutes: minutes });
  if (error || !data?.token) throw new Error('Impossible de démarrer le partage.');
  return { ...data, owner };
}

export async function stopLocationShare(token: string | null = null) {
  const { error } = await supabase.rpc('stop_location_share', { p_token: token });
  if (error) throw new Error('Arrêt non confirmé. Réessayez.');
}

export async function publishLocation(session: ShareSession, location: LocationObject): Promise<boolean> {
  // Never forward a cached fix as a new live position.
  if (Date.now() - location.timestamp > 90_000 || location.timestamp > Date.now() + 10_000) return true;
  const { latitude, longitude, accuracy } = location.coords;
  const { data, error } = await supabase.rpc('publish_live_location', {
    p_token: session.token, p_latitude: latitude, p_longitude: longitude,
    p_accuracy: accuracy, p_captured_at: new Date(location.timestamp).toISOString(),
  });
  if (error) throw new Error('Envoi de la position interrompu.');
  return data === true;
}
