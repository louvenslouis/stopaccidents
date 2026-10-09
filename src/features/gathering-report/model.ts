import { validManualContext, type ReportContext } from '@/features/report-events/context';
export const gatheringTypes = [
  { value: 'demonstration', label: 'Manifestation' },
  { value: 'march', label: 'Marche' },
  { value: 'other', label: 'Autre' },
] as const;
export const gatheringStates = [
  { value: 'stationary', label: 'Sur place' },
  { value: 'moving', label: 'En déplacement' },
  { value: 'dispersed', label: 'Dispersé' },
  { value: 'unknown', label: 'Je ne sais pas' },
] as const;
export const trafficImpactOptions = [
  { value: 'normal', label: 'Circulation normale' },
  { value: 'slowed', label: 'Circulation ralentie' },
  { value: 'blocked', label: 'Circulation bloquée' },
  { value: 'unknown', label: 'Je ne sais pas' },
] as const;

export type GatheringType = (typeof gatheringTypes)[number]['value'];
export type GatheringState =
  (typeof gatheringStates)[number]['value'];
export type TrafficImpact = (typeof trafficImpactOptions)[number]['value'];

export type GatheringReportDraft = ReportContext & {
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
  gatheringType: GatheringType | null;
  gatheringState: GatheringState | null;
  trafficImpact: TrafficImpact | null;
  details: string;
};

export const MAX_GATHERING_DETAILS_LENGTH = 2000;

function isPreciseLocation(coordinates: GatheringReportDraft['coordinates']) {
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

export function gatheringLocationDescription(draft: GatheringReportDraft) {
  return [draft.location.trim(), draft.locationHint.trim()]
    .filter(Boolean)
    .join(' — ');
}

export function gatheringOptionLabel<
  T extends readonly { value: string; label: string }[],
>(options: T, value: string | null | undefined) {
  return options.find((option) => option.value === value)?.label ??
    'Non renseigné';
}

export function validateGatheringStep(
  draft: GatheringReportDraft,
  step: number,
): string | null {
  if (!Number.isInteger(step) || step < 0 || step > 3) return 'Étape inconnue.';
  if (step === 0 && !isPreciseLocation(draft.coordinates) && !(draft.locationSource === 'manual' && validManualContext(draft))) {
    return 'Une position GPS précise à 30 mètres ou mieux est nécessaire.';
  }
  if (gatheringLocationDescription(draft).length > 500) {
    return 'Le lieu et son repère doivent contenir au maximum 500 caractères.';
  }
  if (
    step === 1 &&
    draft.gatheringType !== null &&
    !gatheringTypes.some(
      (option) => option.value === draft.gatheringType,
    )
  ) {
    return 'Choisissez le type de rassemblement.';
  }
  if (
    step === 2 &&
    draft.gatheringState !== null &&
    !gatheringStates.some((option) => option.value === draft.gatheringState)
  ) {
    return 'Indiquez la situation du rassemblement.';
  }
  if (
    step === 3 &&
    draft.trafficImpact !== null &&
    !trafficImpactOptions.some((option) => option.value === draft.trafficImpact)
  ) {
    return 'Indiquez l’impact sur la circulation.';
  }
  if (draft.details.trim().length > MAX_GATHERING_DETAILS_LENGTH) {
    return `Les précisions doivent contenir au maximum ${MAX_GATHERING_DETAILS_LENGTH} caractères.`;
  }
  return null;
}
