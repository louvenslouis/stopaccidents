import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import { MAX_VEHICLE_PHOTO_BYTES, type SuspiciousVehicleReportDraft } from './model';

export const VEHICLE_PHOTO_BUCKET = 'suspicious-vehicle-photos';

async function cleanUnattached(paths: string[]) {
  if (!paths.length) return;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    supabase.storage.from(VEHICLE_PHOTO_BUCKET).remove(paths).catch(() => undefined),
    new Promise<void>((resolve) => { timeout = setTimeout(resolve, 3000); }),
  ]);
  clearTimeout(timeout);
}

export async function completeSuspiciousVehicleReport(
  draft: SuspiciousVehicleReportDraft,
  userId: string,
  onProgress: (message: string) => void,
) {
  const { data: existing, error: readError } = await supabase
    .from('suspicious_vehicle_report_photos').select('storage_path').eq('report_id', draft.id);
  if (readError) throw new Error('Impossible de vérifier la photo. Les étapes précédentes restent enregistrées. Réessayez.');
  const savedPaths = (existing ?? []).map((photo) => photo.storage_path as string);
  const photos: { storage_path: string; captured_at: string }[] = [];
  const attempted: string[] = [];
  try {
    if (draft.photo) {
      const path = `${userId}/${draft.id}/${draft.photo.id}.jpg`;
      if (!savedPaths.includes(path)) {
        const bytes = decode(draft.photo.base64);
        if (bytes.byteLength > MAX_VEHICLE_PHOTO_BYTES) throw new Error('La photo dépasse 6 Mo. Retirez-la et reprenez-la.');
        onProgress('Envoi de la photo…');
        attempted.push(path);
        const { error } = await supabase.storage.from(VEHICLE_PHOTO_BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
        if (error) throw new Error('La photo n’a pas pu être envoyée. Réessayez ou retirez-la pour terminer sans photo.');
      }
      photos.push({ storage_path: path, captured_at: draft.photo.capturedAt });
    }
    onProgress('Enregistrement des compléments…');
    const { data, error } = await supabase.rpc('complete_suspicious_vehicle_report', {
      p_id: draft.id, p_details: draft.details.trim(), p_photos: photos,
    });
    if (error || !data) throw new Error('Cette étape n’a pas pu être confirmée. Réessayez : aucun doublon ne sera créé.');
    await cleanUnattached(savedPaths.filter((path) => !photos.some((photo) => photo.storage_path === path)));
    return data as string;
  } catch (error) {
    // Storage RLS prevents deletion of evidence if the RPC committed but its response was lost.
    await cleanUnattached(attempted);
    throw error;
  }
}
