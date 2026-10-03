import { supabase } from '@/lib/supabase';
import { validateSchedule, type RouteAlert, type RouteSchedule, type SavedRoute } from './model';
import type { RouteShape } from './routing';

const columns = 'id,name,waypoints,coordinates,distance_meters,duration_seconds,departure_time,weekdays,timezone,duration_minutes,lead_minutes,alerts_enabled';
function readRoute(row: Record<string, unknown>): SavedRoute {
  if (typeof row.id !== 'string' || typeof row.name !== 'string' ||
    !Array.isArray(row.waypoints) || !Array.isArray(row.coordinates) ||
    !Array.isArray(row.weekdays) || typeof row.departure_time !== 'string')
    throw new Error('Impossible de lire ce trajet.');
  return {
    id: row.id, name: row.name,
    departureTime: row.departure_time.slice(0, 5), weekdays: row.weekdays,
    timezone: String(row.timezone), durationMinutes: Number(row.duration_minutes),
    leadMinutes: Number(row.lead_minutes), alertsEnabled: row.alerts_enabled === true,
    shape: {
      waypoints: row.waypoints, coordinates: row.coordinates,
      distanceMeters: Number(row.distance_meters), durationSeconds: Number(row.duration_seconds), steps: [],
    },
  };
}
async function requireAccount(userId: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session || data.session.user.is_anonymous || data.session.user.id !== userId)
    throw new Error('Connectez-vous pour enregistrer vos trajets.');
}
export async function readSavedRoutes(userId: string, signal?: AbortSignal): Promise<SavedRoute[]> {
  await requireAccount(userId);
  const query = supabase.from('user_routes').select(columns).eq('user_id', userId).order('created_at', { ascending: false });
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  if (error || !Array.isArray(data)) throw new Error('Impossible de charger vos trajets. Réessayez.');
  await requireAccount(userId);
  return data.map(readRoute);
}
export async function saveRoute(userId: string, shape: RouteShape, schedule: RouteSchedule, id?: string): Promise<SavedRoute> {
  const validation = validateSchedule(schedule);
  if (validation) throw new Error(validation);
  await requireAccount(userId);
  const values = {
    name: schedule.name.trim(), waypoints: shape.waypoints, coordinates: shape.coordinates,
    distance_meters: shape.distanceMeters, duration_seconds: shape.durationSeconds,
    departure_time: schedule.departureTime, weekdays: [...schedule.weekdays].sort((a, b) => a - b),
    timezone: schedule.timezone, duration_minutes: schedule.durationMinutes,
    lead_minutes: schedule.leadMinutes, alerts_enabled: schedule.alertsEnabled,
  };
  const query = id
    ? supabase.from('user_routes').update(values).eq('id', id).eq('user_id', userId)
    : supabase.from('user_routes').insert({ ...values, user_id: userId });
  const { data, error } = await query.select(columns).single();
  if (error || !data) throw new Error('Impossible d’enregistrer le trajet. Réessayez.');
  await requireAccount(userId);
  return readRoute(data);
}
export async function setRouteAlerts(userId: string, id: string, enabled: boolean) {
  await requireAccount(userId);
  const { data, error } = await supabase.from('user_routes')
    .update({ alerts_enabled: enabled }).eq('id', id).eq('user_id', userId).select('id').single();
  if (error || !data) throw new Error('Impossible de modifier les alertes du trajet.');
}
export async function deleteRoute(userId: string, id: string) {
  await requireAccount(userId);
  const { data, error } = await supabase.from('user_routes').delete()
    .eq('id', id).eq('user_id', userId).select('id').single();
  if (error || !data) throw new Error('Impossible de supprimer le trajet.');
}
export async function readRouteAlerts(userId: string, signal?: AbortSignal): Promise<RouteAlert[]> {
  await requireAccount(userId);
  const query = supabase.rpc('read_route_alerts');
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  if (error || !Array.isArray(data)) throw new Error('Impossible de charger les alertes des trajets.');
  await requireAccount(userId);
  return data as RouteAlert[];
}
export async function markRouteAlertRead(userId: string, id: string) {
  await requireAccount(userId);
  const { error } = await supabase.rpc('mark_route_alert_read', { p_id: id });
  if (error) throw new Error('Impossible de marquer cette alerte comme lue.');
}
