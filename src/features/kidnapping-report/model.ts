export const MAX_VEHICLE_CLUES_LENGTH = 1500;
export const MAX_DIRECTION_LENGTH = 1000;
export const MAX_PERSON_CLUES_LENGTH = 2000;

type Coordinates = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

function isPreciseLocation(coordinates: Coordinates | null) {
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

export type KidnappingReportDraft = {
  eventId?: string | null;
  eventChoiceMade?: boolean;
  id: string;
  location: string;
  locationHint: string;
  coordinates: Coordinates | null;
  vehicleClues: string;
  directionTaken: string;
  abductedPersonClues: string;
};

export function kidnappingLocationDescription(draft: KidnappingReportDraft) {
  return [draft.location.trim(), draft.locationHint.trim()]
    .filter(Boolean)
    .join(' — ');
}

export function validateKidnappingStep(
  draft: KidnappingReportDraft,
  step: number,
): string | null {
  if (step === 0 && !isPreciseLocation(draft.coordinates)) {
    return 'Une position GPS précise à 30 mètres ou mieux est nécessaire.';
  }
  if (kidnappingLocationDescription(draft).length > 500) {
    return 'Le lieu et son repère doivent contenir au maximum 500 caractères.';
  }
  if (step === 1) {
    if (draft.vehicleClues.trim().length < 3) {
      return 'Décrivez le ou les véhicules impliqués.';
    }
    if (draft.vehicleClues.trim().length > MAX_VEHICLE_CLUES_LENGTH) {
      return `Les indices sur les véhicules doivent contenir au maximum ${MAX_VEHICLE_CLUES_LENGTH} caractères.`;
    }
    if (draft.directionTaken.trim().length < 3) {
      return 'Indiquez la direction prise par le ou les véhicules.';
    }
    if (draft.directionTaken.trim().length > MAX_DIRECTION_LENGTH) {
      return `La direction doit contenir au maximum ${MAX_DIRECTION_LENGTH} caractères.`;
    }
  }
  if (step === 2) {
    if (draft.abductedPersonClues.trim().length < 3) {
      return 'Ajoutez des indices sur la personne enlevée.';
    }
    if (draft.abductedPersonClues.trim().length > MAX_PERSON_CLUES_LENGTH) {
      return `Les indices sur la personne doivent contenir au maximum ${MAX_PERSON_CLUES_LENGTH} caractères.`;
    }
  }
  return null;
}
