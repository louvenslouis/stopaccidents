import { supabase } from '@/lib/supabase';
import type { AccidentType, Severity } from './model';

export type AccidentSummary = {
  id: string;
  location_description: string;
  latitude: number | null;
  longitude: number | null;
  accident_type: AccidentType | null;
  severity: Severity;
  created_at: string;
  completed_step: number;
};

export type AccidentPhoto = {
  id: string;
  storage_path: string;
  captured_at: string;
  url: string | null;
};

export type AccidentDetail = AccidentSummary & {
  location_accuracy_m: number | null;
  notes: string;
  status: 'received' | 'reviewing' | 'closed';
  updated_at: string;
  is_owner: boolean;
  identifiers: { kind: 'registration' | 'identity'; value: string }[];
  photos: AccidentPhoto[];
};

export async function readLatestAccident(
  signal: AbortSignal,
): Promise<AccidentSummary | null> {
  const { data, error } = await supabase
    .rpc('read_accident')
    .abortSignal(signal);
  if (error)
    throw new Error('Impossible de charger le dernier accident. Réessayez.');
  return data;
}

export async function readAccident(
  id: string,
  signal: AbortSignal,
): Promise<AccidentDetail | null> {
  const { data, error } = await supabase
    .rpc('read_accident', { p_id: id })
    .abortSignal(signal);
  if (error) throw new Error('Impossible de charger cet accident. Réessayez.');
  if (!data) return null;
  const report = data as AccidentDetail;
  let urls: {
    path?: string | null;
    signedUrl?: string | null;
    error?: string | null;
  }[] = [];
  if (report.photos.length && !signal.aborted) {
    // Photo failures must not hide the report. Missing images have their own fallback.
    try {
      const result = await supabase.storage
        .from('accident-photos')
        .createSignedUrls(
          report.photos.map((photo) => photo.storage_path),
          900,
        );
      urls = result.data ?? [];
    } catch {
      /* Offline image fallback. */
    }
  }
  return {
    ...report,
    photos: report.photos.map((photo) => ({
      ...photo,
      url:
        urls.find((url) => url.path === photo.storage_path && !url.error)
          ?.signedUrl ?? null,
    })),
  };
}
