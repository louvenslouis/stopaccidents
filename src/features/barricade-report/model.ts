export const barricadeTypes = [
  { id: 'stones', label: 'Pierres' },
  { id: 'wrecks', label: 'Carcasses de véhicules' },
  { id: 'burning-tires', label: 'Pneus enflammés' },
  { id: 'tree-trunks', label: 'Troncs d’arbres' },
  { id: 'other', label: 'Autre' },
] as const;
export type BarricadeType = (typeof barricadeTypes)[number]['id'];

export const MAX_OBSTACLES_LENGTH = 1500;
export const MAX_PASSAGE_LENGTH = 1000;
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

export type BarricadeReportDraft = {
  id: string;
  location: string;
  locationHint: string;
  coordinates: Coordinates | null;
  barricadeTypes: BarricadeType[];
  obstacles: string;
  passage: string;
  details: string;
};

export function barricadeLocationDescription(draft: BarricadeReportDraft) {
  return [draft.location.trim(), draft.locationHint.trim()]
    .filter(Boolean)
    .join(' — ');
}

// Keep types and eyewitness notes together in the existing public obstacle field.
// Catalog order makes retries stable, regardless of selection order.
export function barricadeObstaclesDescription(draft: BarricadeReportDraft) {
  const labels = barricadeTypes
    .filter((type) => draft.barricadeTypes.includes(type.id))
    .map((type) => type.label);
  return [labels.join(', '), draft.obstacles.trim()].filter(Boolean).join(' — ');
}

export function validateBarricadeStep(
  draft: BarricadeReportDraft,
  step: number,
): string | null {
  if (step === 0 && !isPreciseLocation(draft.coordinates)) {
    return 'Une position GPS précise à 30 mètres ou mieux est nécessaire.';
  }
  if (barricadeLocationDescription(draft).length > 500) {
    return 'Le lieu et son repère doivent contenir au maximum 500 caractères.';
  }
  if (step === 1) {
    if (!draft.barricadeTypes.length || draft.barricadeTypes.some(
      (id) => !barricadeTypes.some((type) => type.id === id),
    )) {
      return 'Choisissez au moins un type de barricade.';
    }
    if (draft.barricadeTypes.includes('other') && draft.obstacles.trim().length < 3) {
      return 'Précisez le type de barricade pour « Autre ».';
    }
    if (barricadeObstaclesDescription(draft).length > MAX_OBSTACLES_LENGTH) {
      return `Les obstacles doivent contenir au maximum ${MAX_OBSTACLES_LENGTH} caractères.`;
    }
    if (draft.passage.trim().length < 3) {
      return 'Indiquez si le passage est bloqué ou encore possible.';
    }
    if (draft.passage.trim().length > MAX_PASSAGE_LENGTH) {
      return `Le passage doit contenir au maximum ${MAX_PASSAGE_LENGTH} caractères.`;
    }
  }
  if (step === 2) {
    if (draft.details.trim().length < 3) {
      return 'Ajoutez des informations utiles sur la route barricadée.';
    }
    if (draft.details.trim().length > MAX_DETAILS_LENGTH) {
      return `Les informations complémentaires doivent contenir au maximum ${MAX_DETAILS_LENGTH} caractères.`;
    }
  }
  return null;
}
