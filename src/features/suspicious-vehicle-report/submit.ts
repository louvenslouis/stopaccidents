import { completeSuspiciousVehicleReport } from './photos';
import { supabase } from '@/lib/supabase';
import {
  suspiciousVehicleLocationDescription,
  suspiciousVehicleDescription,
  validateSuspiciousVehicleStep,
  type SuspiciousVehicleReportDraft,
} from './model';

/** Save one stage while keeping the same report ID for retries and corrections. */
export async function saveSuspiciousVehicleReportStep(
  draft: SuspiciousVehicleReportDraft,
  step: number,
  onProgress: (message: string) => void,
) {
  const validation = validateSuspiciousVehicleStep(draft, step);
  if (validation) throw new Error(validation);
  if (step < 0 || step > 2) throw new Error('Étape inconnue.');

  onProgress('Connexion sécurisée…');
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError) {
    throw new Error('La connexion a expiré. Réessayez dans un instant.');
  }
  let userId = sessionData.session?.user.id;
  if (!userId) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error?.code === 'anonymous_provider_disabled') {
      throw new Error(
        'Le signalement sans compte n’est pas encore activé. Réessayez après son activation.',
      );
    }
    if (error || !data.user) {
      throw new Error(
        'Connexion impossible. Vérifiez votre connexion Internet et réessayez.',
      );
    }
    userId = data.user.id;
  }
  if (step === 2) return completeSuspiciousVehicleReport(draft, userId, onProgress);

  const payload: Record<string, unknown> = {
    p_id: draft.id,
    p_step: step + 1,
  };
  if (step === 0) {
    Object.assign(payload, {
      p_location: suspiciousVehicleLocationDescription(draft),
      p_latitude: draft.coordinates?.latitude ?? null,
      p_longitude: draft.coordinates?.longitude ?? null,
      p_accuracy: draft.coordinates?.accuracy ?? null,
    });
  }
  if (step === 1) {
    Object.assign(payload, {
      p_vehicle_description: suspiciousVehicleDescription(draft),
      p_observed_behavior: draft.observedBehavior.trim(),
    });
  }

  onProgress(
    step === 0
      ? 'Enregistrement du signalement…'
      : 'Enregistrement des informations…',
  );
  const { data, error } = await supabase.rpc(
    'save_suspicious_vehicle_report_step',
    payload,
  );
  if (error || !data) {
    throw new Error(
      'Cette étape n’a pas pu être confirmée. Réessayez : les étapes déjà enregistrées sont conservées et aucun doublon ne sera créé.',
    );
  }
  return data as string;
}
