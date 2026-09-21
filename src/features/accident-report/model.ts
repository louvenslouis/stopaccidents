export const MAX_PHOTOS = 4;
export const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
export type AccidentType = 'two_cars' | 'single_car' | 'motorcycle' | 'other';
export type Severity =
  | 'material'
  | 'injuries'
  | 'serious'
  | 'fatal'
  | 'unknown';
export type Coordinates = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};
export type CapturedPhoto = {
  id: string;
  uri: string;
  base64: string;
  capturedAt: string;
};
export type ReportDraft = {
  id: string;
  location: string;
  coordinates: Coordinates | null;
  accidentType: AccidentType | null;
  severity: Severity | null;
  registrations: string;
  identities: string;
  notes: string;
  photos: CapturedPhoto[];
};

export function splitIdentifiers(value: string) {
  return [
    ...new Set(
      value
        .split(/[,;\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

export function validateStep(draft: ReportDraft, step: number): string | null {
  if (step === 0) {
    if (draft.location.trim().length < 3 && !draft.coordinates)
      return 'Précisez le lieu de l’accident ou utilisez votre position GPS.';
    if (!draft.accidentType) return 'Choisissez le type d’accident.';
  }
  if (step === 1 && !draft.severity)
    return 'Indiquez la gravité, ou choisissez « Je ne sais pas ».';
  if (step === 2) {
    for (const value of [draft.registrations, draft.identities]) {
      const items = splitIdentifiers(value);
      if (items.length > 10)
        return 'Vous pouvez ajouter jusqu’à 10 numéros par catégorie.';
      if (items.some((item) => item.length > 80))
        return 'Chaque numéro doit contenir au maximum 80 caractères.';
    }
    if (draft.photos.length > MAX_PHOTOS)
      return `Ajoutez au maximum ${MAX_PHOTOS} photos.`;
  }
  return null;
}
