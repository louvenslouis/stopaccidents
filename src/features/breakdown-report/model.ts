export const breakdownPositions = [
  {
    value: 'roadway',
    label: 'Sur la chaussée',
    description: 'Le véhicule occupe une voie de circulation',
  },
  {
    value: 'shoulder',
    label: 'Sur l’accotement',
    description: 'Le véhicule est rangé sur le bord de la route',
  },
  {
    value: 'sidewalk',
    label: 'Sur le trottoir',
    description: 'Le véhicule gêne le passage des piétons',
  },
  {
    value: 'off_road',
    label: 'Hors de la chaussée',
    description: 'Le véhicule ne se trouve pas sur la voie',
  },
  {
    value: 'unknown',
    label: 'Je ne sais pas',
    description: 'L’emplacement exact reste à confirmer',
  },
] as const;

export const breakdownVehicleTypes = [
  { value: 'car', label: 'Voiture' },
  { value: 'motorcycle', label: 'Moto' },
  { value: 'truck', label: 'Camion' },
  { value: 'minibus', label: 'Minibus / tap-tap' },
  { value: 'bus', label: 'Bus' },
  { value: 'tuktuk', label: 'Tuk-tuk' },
  { value: 'other', label: 'Autre véhicule' },
] as const;

export const trafficImpacts = [
  {
    value: 'blocked',
    label: 'Circulation bloquée',
    description: 'Les véhicules ne peuvent plus passer',
  },
  {
    value: 'major_slowdown',
    label: 'Fort ralentissement',
    description: 'Une longue file se forme ou avance très lentement',
  },
  {
    value: 'slowdown',
    label: 'Ralentissement',
    description: 'Le trafic reste fluide mais plus lent',
  },
  {
    value: 'none',
    label: 'Aucun impact apparent',
    description: 'La circulation passe normalement',
  },
  {
    value: 'unknown',
    label: 'Je ne sais pas',
    description: 'L’impact n’est pas encore visible',
  },
] as const;

export type BreakdownPosition = (typeof breakdownPositions)[number]['value'];
export type BreakdownVehicleType =
  (typeof breakdownVehicleTypes)[number]['value'];
export type TrafficImpact = (typeof trafficImpacts)[number]['value'];

export type BreakdownReportDraft = {
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
  breakdownPosition: BreakdownPosition | null;
  vehicleType: BreakdownVehicleType | null;
  trafficImpact: TrafficImpact | null;
  details: string;
};

export const MAX_BREAKDOWN_DETAILS_LENGTH = 2000;

function isPreciseLocation(coordinates: BreakdownReportDraft['coordinates']) {
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

export function breakdownLocationDescription(draft: BreakdownReportDraft) {
  return [draft.location.trim(), draft.locationHint.trim()]
    .filter(Boolean)
    .join(' — ');
}

export function breakdownOptionLabel<
  T extends readonly { value: string; label: string }[],
>(options: T, value: string | null | undefined) {
  return options.find((option) => option.value === value)?.label ??
    'Non renseigné';
}

export function validateBreakdownStep(
  draft: BreakdownReportDraft,
  step: number,
): string | null {
  if (step < 0 || step > 3) return 'Étape inconnue.';
  if (step === 0 && !isPreciseLocation(draft.coordinates)) {
    return 'Une position GPS précise à 30 mètres ou mieux est nécessaire.';
  }
  if (breakdownLocationDescription(draft).length > 500) {
    return 'Le lieu et son repère doivent contenir au maximum 500 caractères.';
  }
  if (
    step === 1 &&
    !breakdownPositions.some(
      (option) => option.value === draft.breakdownPosition,
    )
  ) {
    return 'Indiquez où se trouve le véhicule en panne.';
  }
  if (
    step === 2 &&
    !breakdownVehicleTypes.some((option) => option.value === draft.vehicleType)
  ) {
    return 'Choisissez le type de véhicule en panne.';
  }
  if (
    step === 3 &&
    !trafficImpacts.some((option) => option.value === draft.trafficImpact)
  ) {
    return 'Indiquez l’impact sur la circulation.';
  }
  if (draft.details.trim().length > MAX_BREAKDOWN_DETAILS_LENGTH) {
    return `Les précisions doivent contenir au maximum ${MAX_BREAKDOWN_DETAILS_LENGTH} caractères.`;
  }
  return null;
}
