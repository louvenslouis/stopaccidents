import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import { MAX_PHOTOS, MAX_PHOTO_BYTES } from '@/features/accident-report/model';
import { ensureReporter, type ReportKind } from './api';
import type { ReportContext } from './context';

export const REPORT_PHOTO_BUCKET = 'report-photos';
export type ReportPhoto = { storage_path: string; captured_at: string; source?: string; url: string | null };

export function validateReportPhotos(draft: ReportContext) {
  const photos = draft.photos ?? [];
  if (photos.length > MAX_PHOTOS) return 'Vous pouvez ajouter jusqu’à 4 photos.';
  if (photos.some(photo => !photo.base64 || photo.base64.length * 0.75 > MAX_PHOTO_BYTES))
    return 'Une photo est vide ou dépasse 6 Mo. Retirez-la et reprenez-la.';
  if (draft.locationSource !== 'manual' && photos.some(photo => photo.source === 'library'))
    return 'Utilisez la caméra pour un signalement sur place.';
  return null;
}

async function cleanUnattached(paths: string[]) {
  if (!paths.length) return;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    supabase.storage.from(REPORT_PHOTO_BUCKET).remove(paths).catch(() => undefined),
    new Promise<void>(resolve => { timeout = setTimeout(resolve, 3000); }),
  ]);
  clearTimeout(timeout);
}

export async function saveReportPhotos(kind: ReportKind, draft: ReportContext & { id: string }, onProgress: (message: string) => void) {
  const validation = validateReportPhotos(draft);
  if (validation) throw new Error(validation);
  const userId = await ensureReporter();
  const { data: existing, error: readError } = await supabase.rpc('read_report_photos', { p_kind: kind, p_id: draft.id });
  if (readError) throw new Error('Impossible de vérifier les photos. Réessayez.');
  const savedPaths = new Set<string>((existing ?? []).map((photo: ReportPhoto) => photo.storage_path));
  const photos: Omit<ReportPhoto, 'url'>[] = [];
  const attempted: string[] = [];
  try {
    for (const [index, photo] of (draft.photos ?? []).entries()) {
      const path = `${userId}/${kind}/${draft.id}/${photo.id}.jpg`;
      if (!savedPaths.has(path)) {
        const bytes = decode(photo.base64);
        if (!bytes.byteLength || bytes.byteLength > MAX_PHOTO_BYTES) throw new Error('Une photo est vide ou dépasse 6 Mo.');
        onProgress(`Envoi de la photo ${index + 1} sur ${draft.photos?.length}…`);
        attempted.push(path);
        const { error } = await supabase.storage.from(REPORT_PHOTO_BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
        if (error) throw new Error('Une photo n’a pas pu être envoyée. Réessayez ou retirez-la pour terminer sans photo.');
      }
      photos.push({ storage_path: path, captured_at: photo.capturedAt, source: photo.source ?? 'camera' });
    }
    onProgress('Enregistrement des photos…');
    const { data, error } = await supabase.rpc('save_report_photos', { p_kind: kind, p_id: draft.id, p_photos: photos });
    if (error || !data) throw new Error('Les photos n’ont pas pu être confirmées. Réessayez : aucun doublon ne sera créé.');
    await cleanUnattached([...savedPaths].filter(path => !photos.some(photo => photo.storage_path === path)));
    return data as string;
  } catch (error) {
    // Referenced files cannot be deleted if the response was lost after commit.
    await cleanUnattached(attempted);
    throw error;
  }
}

export async function readReportPhotos(kind: ReportKind, id: string, signal: AbortSignal): Promise<ReportPhoto[]> {
  const { data, error } = await supabase.rpc('read_report_photos', { p_kind: kind, p_id: id }).abortSignal(signal);
  if (error) throw new Error('Impossible de charger les photos. Réessayez.');
  const photos = (data ?? []) as ReportPhoto[];
  if (!photos.length || signal.aborted) return [];
  try {
    const { data: urls } = await supabase.storage.from(REPORT_PHOTO_BUCKET).createSignedUrls(photos.map(photo => photo.storage_path), 900);
    return photos.map(photo => ({ ...photo, url: urls?.find(item => item.path === photo.storage_path && !item.error)?.signedUrl ?? null }));
  } catch {
    return photos.map(photo => ({ ...photo, url: null }));
  }
}
