export const MAX_PRESENCE_LENGTH = 1500;
export const MAX_ACTIVITY_LENGTH = 1000;
export const MAX_DETAILS_LENGTH = 2000;

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

export type ArmedPresenceReportDraft = {
  eventId?: string | null;
  eventChoiceMade?: boolean;
  id: string;
  location: string;
  locationHint: string;
  coordinates: Coordinates | null;
  presence: string;
  activity: string;
  details: string;
};

export function armedPresenceLocationDescription(draft: ArmedPresenceReportDraft) {
  return [draft.location.trim(), draft.locationHint.trim()]
    .filter(Boolean)
    .join(' — ');
}

export function validateArmedPresenceStep(
  draft: ArmedPresenceReportDraft,
  step: number,
): string | null {
  if (step === 0 && !isPreciseLocation(draft.coordinates)) {
    return 'Une position GPS précise à 30 mètres ou mieux est nécessaire.';
  }
  if (armedPresenceLocationDescription(draft).length > 500) {
    return 'Le lieu et son repère doivent contenir au maximum 500 caractères.';
  }
  if (step === 1) {
    if (draft.presence.trim().length < 1) {
      return 'Indiquez le nombre approximatif de personnes ou « inconnu ».';
    }
    if (draft.presence.trim().length > MAX_PRESENCE_LENGTH) {
      return `La présence observée doit contenir au maximum ${MAX_PRESENCE_LENGTH} caractères.`;
    }
    if (draft.activity.trim().length < 3) {
      return 'Décrivez l’activité observée ou indiquez « inconnue ».';
    }
    if (draft.activity.trim().length > MAX_ACTIVITY_LENGTH) {
      return `L’activité doit contenir au maximum ${MAX_ACTIVITY_LENGTH} caractères.`;
    }
  }
  if (step === 2) {
    if (draft.details.trim().length > MAX_DETAILS_LENGTH) {
      return `Les précisions doivent contenir au maximum ${MAX_DETAILS_LENGTH} caractères.`;
    }
  }
  return null;
}
