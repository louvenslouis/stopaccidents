import { validManualContext, type ReportContext } from '@/features/report-events/context';
export const fireTargets = [
  { value: 'car', label: 'Voiture' },
  { value: 'house', label: 'Maison domestique' },
  { value: 'commerce', label: 'Commerce' },
  { value: 'other_vehicle', label: 'Autre véhicule' },
  { value: 'building', label: 'Immeuble' },
  { value: 'warehouse', label: 'Entrepôt / atelier' },
  { value: 'vegetation', label: 'Terrain / végétation' },
  { value: 'other', label: 'Autre' },
  { value: 'unknown', label: 'Je ne sais pas' },
] as const;
export const fireStates = [
  { value: 'active', label: 'Flammes visibles' },
  { value: 'smoke', label: 'Fumée visible' },
  { value: 'extinguished', label: 'Feu éteint' },
  { value: 'unknown', label: 'Je ne sais pas' },
] as const;
export const peopleDangerOptions = [
  { value: 'yes', label: 'Oui' },
  { value: 'no', label: 'Non' },
  { value: 'unknown', label: 'Je ne sais pas' },
] as const;

export type FireTarget = (typeof fireTargets)[number]['value'];
export type FireState =
  (typeof fireStates)[number]['value'];
export type PeopleDanger = (typeof peopleDangerOptions)[number]['value'];

export type FireReportDraft = ReportContext & {
  eventId?: string | null;
  eventChoiceMade?: boolean;
  id: string;
  location: string;
  locationHint: string;
  coordinates: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
  } | null;
  fireTarget: FireTarget | null;
  fireState: FireState | null;
  peopleDanger: PeopleDanger | null;
  details: string;
};

export const MAX_FIRE_DETAILS_LENGTH = 2000;

function isPreciseLocation(coordinates: FireReportDraft['coordinates']) {
  return Boolean(
    coordinates &&
      Number.isFinite(coordinates.latitude) &&
      Math.abs(coordinates.latitude) <= 90 &&
      Number.isFinite(coordinates.longitude) &&
      Math.abs(coordinates.longitude) <= 180 &&
      typeof coordinates.accuracy === 'number' &&
      Number.isFinite(coordinates.accuracy) &&
      coordinates.accuracy >= 0 &&
      coordinates.accuracy <= 30,
  );
}

export function fireLocationDescription(draft: FireReportDraft) {
  return [draft.location.trim(), draft.locationHint.trim()]
    .filter(Boolean)
    .join(' — ');
}

export function fireOptionLabel<
  T extends readonly { value: string; label: string }[],
>(options: T, value: string | null | undefined) {
  return options.find((option) => option.value === value)?.label ??
    'Non renseigné';
}

export function validateFireStep(
  draft: FireReportDraft,
  step: number,
): string | null {
  if (!Number.isInteger(step) || step < 0 || step > 3) return 'Étape inconnue.';
  if (step === 0 && !isPreciseLocation(draft.coordinates) && !(draft.locationSource === 'manual' && validManualContext(draft))) {
    return 'Une position GPS précise à 30 mètres ou mieux est nécessaire.';
  }
  if (fireLocationDescription(draft).length > 500) {
    return 'Le lieu et son repère doivent contenir au maximum 500 caractères.';
  }
  if (
    step === 1 &&
    !fireTargets.some(
      (option) => option.value === draft.fireTarget,
    )
  ) {
    return 'Choisissez le bien ou le lieu touché.';
  }
  if (
    step === 2 &&
    !fireStates.some((option) => option.value === draft.fireState)
  ) {
    return 'Indiquez l’état du feu.';
  }
  if (
    step === 3 &&
    !peopleDangerOptions.some((option) => option.value === draft.peopleDanger)
  ) {
    return 'Indiquez si des personnes sont en danger.';
  }
  if (draft.details.trim().length > MAX_FIRE_DETAILS_LENGTH) {
    return `Les précisions doivent contenir au maximum ${MAX_FIRE_DETAILS_LENGTH} caractères.`;
  }
  return null;
}
