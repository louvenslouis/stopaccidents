import { supabase } from '@/lib/supabase';
import type { Coordinates } from '@/features/accident-report/model';
import type { SafetyReportSummary } from '@/features/safety-report/read';

export type ReportKind = SafetyReportSummary['report_kind'];
export type EventDraft = { id: string; coordinates: Coordinates | null; eventId?: string | null; eventChoiceMade?: boolean };
export type NearbyEvent = SafetyReportSummary & { event_id: string; distance_m: number; testimony_count: number; witness_count: number; last_observed_at: string };
export type ReportEvent = { event_id: string; is_moderator: boolean; summary: NearbyEvent; contributions: SafetyReportSummary[]; merges: { id: string; reason: string; created_at: string }[] };
let signingIn: Promise<string> | null = null;
export async function ensureReporter(): Promise<string> {
  if (signingIn) return signingIn;
  signingIn = (async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session) return data.session.user.id;
    const result = await supabase.auth.signInAnonymously();
    if (result.error || !result.data.user) throw new Error('Connexion impossible. Réessayez pour reprendre votre signalement.');
    return result.data.user.id;
  })();
  try { return await signingIn; } finally { signingIn = null; }
}
export async function nearbyEvents(kind: ReportKind, draft: EventDraft, signal?: AbortSignal): Promise<NearbyEvent[]> {
  if (!draft.coordinates) throw new Error('La position est nécessaire.');
  await ensureReporter();
  const query = supabase.rpc('nearby_report_events', {
    p_kind: kind, p_latitude: draft.coordinates.latitude, p_longitude: draft.coordinates.longitude,
    p_accuracy: draft.coordinates.accuracy, p_exclude: draft.id,
  });
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  if (error) throw new Error('Impossible de vérifier les événements proches. Réessayez.');
  return data as NearbyEvent[];
}
export async function prepareReportEvent(kind: ReportKind, draft: EventDraft) {
  const { error } = await supabase.rpc('prepare_report_event', {
    p_kind: kind, p_report_id: draft.id, p_event_id: draft.eventId ?? null,
    p_latitude: draft.coordinates?.latitude, p_longitude: draft.coordinates?.longitude,
    p_accuracy: draft.coordinates?.accuracy,
  });
  if (error) throw new Error(error.code === '22023' ? 'Cet événement n’est plus proposé. Fermez puis reprenez le formulaire pour actualiser.' : 'Le rattachement à l’événement n’a pas pu être confirmé. Réessayez.');
}
export async function readReportEvent(kind: ReportKind, id: string, signal?: AbortSignal): Promise<ReportEvent | null> {
  const query = supabase.rpc('read_report_event', { p_kind: kind, p_report_id: id });
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  if (error) throw new Error('Les témoignages sont indisponibles.');
  return data as ReportEvent | null;
}
