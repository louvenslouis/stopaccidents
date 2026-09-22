export const PROXIMITY_OPTIONS = [
  { value: "near", label: "Proches" },
  { value: "far", label: "Lointains" },
  { value: "unknown", label: "Difficile à estimer" },
] as const;
export const SHOT_COUNT_OPTIONS = [
  { value: "one", label: "1 tir" },
  { value: "two_to_five", label: "2 à 5 tirs" },
  { value: "six_to_ten", label: "6 à 10 tirs" },
  { value: "more_than_ten", label: "Plus de 10 tirs" },
  { value: "unknown", label: "Impossible à compter" },
] as const;
export const CADENCE_OPTIONS = [
  { value: "isolated", label: "Tirs isolés" },
  { value: "bursts", label: "Rafales" },
  { value: "continuous", label: "Tirs continus" },
  { value: "unknown", label: "Indéterminé" },
] as const;
export function gunfireOptionLabel(
  options: readonly { value: string; label: string }[],
  value: string,
) {
  return (
    options.find((option) => option.value === value)?.label ?? "Non renseigné"
  );
}
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
      typeof coordinates.accuracy === "number" &&
      Number.isFinite(coordinates.accuracy) &&
      coordinates.accuracy >= 0 &&
      coordinates.accuracy <= 30,
  );
}

export type GunfireReportDraft = {
  id: string;
  location: string;
  locationHint: string;
  coordinates: Coordinates | null;
  shotCount: (typeof SHOT_COUNT_OPTIONS)[number]["value"] | "";
  proximity: (typeof PROXIMITY_OPTIONS)[number]["value"] | "";
  cadence: (typeof CADENCE_OPTIONS)[number]["value"] | "";
  details: string;
};

export function gunfireLocationDescription(draft: GunfireReportDraft) {
  return [draft.location.trim(), draft.locationHint.trim()]
    .filter(Boolean)
    .join(" — ");
}

export function validateGunfireStep(
  draft: GunfireReportDraft,
  step: number,
): string | null {
  if (step === 0 && !isPreciseLocation(draft.coordinates)) {
    return "Une position GPS précise à 30 mètres ou mieux est nécessaire.";
  }
  if (gunfireLocationDescription(draft).length > 500) {
    return "Le lieu et son repère doivent contenir au maximum 500 caractères.";
  }
  if (step < 0 || step > 2 || !Number.isInteger(step)) return "Étape inconnue.";
  if (step === 1) {
    if (!PROXIMITY_OPTIONS.some((option) => option.value === draft.proximity))
      return "Précisez la proximité perçue des tirs.";
    if (!SHOT_COUNT_OPTIONS.some((option) => option.value === draft.shotCount))
      return "Indiquez la quantité approximative de tirs.";
    if (!CADENCE_OPTIONS.some((option) => option.value === draft.cadence))
      return "Précisez le rythme des tirs ou choisissez « Indéterminé ».";
  }
  if (step === 2) {
    if (draft.details.trim().length > MAX_DETAILS_LENGTH) {
      return `Les précisions doivent contenir au maximum ${MAX_DETAILS_LENGTH} caractères.`;
    }
  }
  return null;
}
