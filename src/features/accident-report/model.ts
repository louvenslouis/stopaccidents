export const MAX_PHOTOS = 4;
export const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
export const MAX_LOCATION_ACCURACY = 30;
export type AccidentType =
  | "two_cars"
  | "single_car"
  | "motorcycle"
  | "car_motorcycle"
  | "car_pedestrian"
  | "car_tuktuk"
  | "single_motorcycle"
  | "other";
export type Severity =
  | "material"
  | "injuries"
  | "serious"
  | "fatal"
  | "unknown";
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
  locationHint?: string;
  coordinates: Coordinates | null;
  accidentType: AccidentType | null;
  severity: Severity | null;
  registrations: string;
  identities: string;
  notes: string;
  photos: CapturedPhoto[];
};

export function isPreciseLocation(coordinates: Coordinates | null): boolean {
  return Boolean(
    coordinates &&
      Number.isFinite(coordinates.latitude) &&
      Math.abs(coordinates.latitude) <= 90 &&
      Number.isFinite(coordinates.longitude) &&
      Math.abs(coordinates.longitude) <= 180 &&
      typeof coordinates.accuracy === "number" &&
      Number.isFinite(coordinates.accuracy) &&
      coordinates.accuracy >= 0 &&
      coordinates.accuracy <= MAX_LOCATION_ACCURACY,
  );
}

export function locationDescription(draft: ReportDraft): string {
  return [draft.location.trim(), draft.locationHint?.trim()]
    .filter(Boolean)
    .join(" — ");
}

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
    if (!isPreciseLocation(draft.coordinates))
      return "Une position GPS précise à 30 mètres ou mieux est nécessaire.";
  }
  if (locationDescription(draft).length > 500)
    return "Le lieu et son repère doivent contenir au maximum 500 caractères.";
  if (step === 1 && !draft.accidentType)
    return "Choisissez le type d’accident.";
  if (step === 2 && !draft.severity)
    return "Indiquez la gravité, ou choisissez « Je ne sais pas ».";
  if (step === 3) {
    for (const value of [draft.registrations, draft.identities]) {
      const items = splitIdentifiers(value);
      if (items.length > 10)
        return "Vous pouvez ajouter jusqu’à 10 numéros par catégorie.";
      if (items.some((item) => item.length > 80))
        return "Chaque numéro doit contenir au maximum 80 caractères.";
    }
    if (draft.photos.length > MAX_PHOTOS)
      return `Ajoutez au maximum ${MAX_PHOTOS} photos.`;
  }
  return null;
}
