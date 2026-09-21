import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import {
  MAX_PHOTO_BYTES,
  splitIdentifiers,
  validateStep,
  type ReportDraft,
} from './model';

export const REPORT_PHOTO_BUCKET = 'accident-photos';

export async function submitAccidentReport(
  draft: ReportDraft,
  onProgress: (message: string) => void,
) {
  for (let step = 0; step < 3; step++) {
    const error = validateStep(draft, step);
    if (error) throw new Error(error);
  }
  onProgress('Connexion sécurisée…');
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError)
    throw new Error('La connexion a expiré. Réessayez dans un instant.');
  let userId = sessionData.session?.user.id;
  if (!userId) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) {
      throw new Error(
        'Connexion impossible. Vérifiez votre connexion Internet et réessayez.',
      );
    }
    userId = data.user.id;
  }

  // A lost response after commit must not produce a second report or replace its photos.
  const { data: existing, error: lookupError } = await supabase
    .from('accident_reports')
    .select('id')
    .eq('id', draft.id)
    .maybeSingle();
  if (lookupError)
    throw new Error(
      'Le service est momentanément indisponible. Votre formulaire est conservé.',
    );
  if (existing) return existing.id as string;

  const attemptedPaths: string[] = [];
  try {
    const photos: { storage_path: string; captured_at: string }[] = [];
    for (const [index, photo] of draft.photos.entries()) {
      onProgress(`Envoi de la photo ${index + 1} sur ${draft.photos.length}…`);
      const bytes = decode(photo.base64);
      if (bytes.byteLength > MAX_PHOTO_BYTES)
        throw new Error('Une photo dépasse 6 Mo. Retirez-la et reprenez-la.');
      const path = `${userId}/${draft.id}/${photo.id}.jpg`;
      attemptedPaths.push(path);
      const { error } = await supabase.storage
        .from(REPORT_PHOTO_BUCKET)
        .upload(path, bytes, {
          contentType: 'image/jpeg',
          upsert: true,
        });
      if (error)
        throw new Error(
          'Une photo n’a pas pu être envoyée. Votre formulaire est conservé ; réessayez.',
        );
      photos.push({ storage_path: path, captured_at: photo.capturedAt });
    }

    onProgress('Enregistrement du signalement…');
    const { data, error } = await supabase.rpc('submit_accident_report', {
      p_id: draft.id,
      p_location: draft.location.trim(),
      p_latitude: draft.coordinates?.latitude ?? null,
      p_longitude: draft.coordinates?.longitude ?? null,
      p_accuracy: draft.coordinates?.accuracy ?? null,
      p_accident_type: draft.accidentType,
      p_severity: draft.severity,
      p_notes: draft.notes.trim(),
      p_registrations: splitIdentifiers(draft.registrations),
      p_identities: splitIdentifiers(draft.identities),
      p_photos: photos,
    });
    if (error || !data)
      throw new Error(
        'L’envoi n’a pas pu être confirmé. Réessayez : aucun doublon ne sera créé.',
      );
    return data as string;
  } catch (error) {
    // A lost commit response may leave a valid report. Storage RLS prevents
    // deleting its evidence; only uncommitted uploads can be cleaned up.
    if (attemptedPaths.length) {
      let cleanupTimeout: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        supabase.storage
          .from(REPORT_PHOTO_BUCKET)
          .remove(attemptedPaths)
          .catch(() => undefined),
        new Promise<void>((resolve) => {
          cleanupTimeout = setTimeout(resolve, 3000);
        }),
      ]);
      clearTimeout(cleanupTimeout);
    }
    throw error;
  }
}
