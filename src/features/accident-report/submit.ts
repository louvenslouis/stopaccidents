import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import { ensureReportSession } from './session';
import {
  MAX_PHOTO_BYTES,
  splitIdentifiers,
  validateStep,
  type ReportDraft,
} from './model';

export const REPORT_PHOTO_BUCKET = 'accident-photos';

/** Save one step only, reusing the draft ID for both retries and adjustments. */
export async function saveAccidentReportStep(
  draft: ReportDraft,
  step: number,
  onProgress: (message: string) => void,
) {
  const validation = validateStep(draft, step);
  if (validation) throw new Error(validation);
  if (step < 0 || step > 3) throw new Error('Étape inconnue.');
  onProgress('Connexion sécurisée…');
  const userId = await ensureReportSession();

  // Sparse parameters ensure an adjustment never erases fields from other steps.
  const payload: Record<string, unknown> = { p_id: draft.id, p_step: step + 1 };
  if (step === 0)
    Object.assign(payload, {
      p_location: draft.location.trim(),
      p_latitude: draft.coordinates?.latitude ?? null,
      p_longitude: draft.coordinates?.longitude ?? null,
      p_accuracy: draft.coordinates?.accuracy ?? null,
    });
  if (step === 1) payload.p_accident_type = draft.accidentType;
  if (step === 2) payload.p_severity = draft.severity;

  const attemptedPaths: string[] = [];
  let obsoletePaths: string[] = [];
  try {
    if (step === 3) {
      const { data: savedPhotos, error: readError } = await supabase
        .from('accident_report_photos')
        .select('storage_path')
        .eq('report_id', draft.id);
      if (readError)
        throw new Error(
          'Impossible de vérifier les photos. Réessayez ; les étapes précédentes sont enregistrées.',
        );
      const savedPaths = new Set<string>(
        (savedPhotos ?? []).map((photo) => photo.storage_path),
      );
      const photos: { storage_path: string; captured_at: string }[] = [];
      for (const [index, photo] of draft.photos.entries()) {
        const path = `${userId}/${draft.id}/${photo.id}.jpg`;
        if (!savedPaths.has(path)) {
          onProgress(
            `Envoi de la photo ${index + 1} sur ${draft.photos.length}…`,
          );
          const bytes = decode(photo.base64);
          if (bytes.byteLength > MAX_PHOTO_BYTES)
            throw new Error(
              'Une photo dépasse 6 Mo. Retirez-la et reprenez-la.',
            );
          attemptedPaths.push(path);
          const { error } = await supabase.storage
            .from(REPORT_PHOTO_BUCKET)
            .upload(path, bytes, {
              contentType: 'image/jpeg',
              upsert: true,
            });
          if (error)
            throw new Error(
              'Une photo n’a pas pu être envoyée. Les étapes précédentes restent enregistrées ; réessayez.',
            );
        }
        photos.push({ storage_path: path, captured_at: photo.capturedAt });
      }
      obsoletePaths = [...savedPaths].filter(
        (path) => !photos.some((photo) => photo.storage_path === path),
      );
      Object.assign(payload, {
        p_notes: draft.notes.trim(),
        p_registrations: splitIdentifiers(draft.registrations),
        p_identities: splitIdentifiers(draft.identities),
        p_photos: photos,
      });
    }
    onProgress(
      step === 0
        ? 'Enregistrement du signalement…'
        : 'Enregistrement des compléments…',
    );
    const { data, error } = await supabase.rpc(
      'save_accident_report_step',
      payload,
    );
    if (error || !data)
      throw new Error(
        'Cette étape n’a pas pu être confirmée. Réessayez : les étapes déjà enregistrées sont conservées et aucun doublon ne sera créé.',
      );
    if (obsoletePaths.length) await cleanUnattachedPhotos(obsoletePaths);
    return data as string;
  } catch (error) {
    // If the response was lost after commit, RLS protects referenced photos.
    if (attemptedPaths.length) await cleanUnattachedPhotos(attemptedPaths);
    throw error;
  }
}

async function cleanUnattachedPhotos(paths: string[]) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    supabase.storage
      .from(REPORT_PHOTO_BUCKET)
      .remove(paths)
      .catch(() => undefined),
    new Promise<void>((resolve) => {
      timeout = setTimeout(resolve, 3000);
    }),
  ]);
  clearTimeout(timeout);
}
