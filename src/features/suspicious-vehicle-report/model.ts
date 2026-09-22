import type { CapturedPhoto } from '@/features/accident-report/model';

export const vehicleTypes = [
  { id: 'sedan', label: 'Berline' }, { id: 'suv', label: 'SUV / 4×4' },
  { id: 'pickup', label: 'Pick-up' }, { id: 'van', label: 'Fourgon / minibus' },
  { id: 'truck', label: 'Camion' }, { id: 'bus', label: 'Autobus' },
  { id: 'other', label: 'Autre' }, { id: 'unknown', label: 'Impossible à déterminer' },
] as const;
export const windowTintOptions = [
  { id: 'yes', label: 'Oui' }, { id: 'no', label: 'Non' },
  { id: 'unknown', label: 'Impossible à déterminer' },
] as const;
export type VehicleType = (typeof vehicleTypes)[number]['id'];
export type WindowTint = (typeof windowTintOptions)[number]['id'];
export const MAX_VEHICLE_PHOTO_BYTES = 6 * 1024 * 1024;

export const MAX_VEHICLE_DESCRIPTION_LENGTH = 1500;
export const MAX_OBSERVED_BEHAVIOR_LENGTH = 1000;
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

export type SuspiciousVehicleReportDraft = {
  id: string;
  location: string;
  locationHint: string;
  coordinates: Coordinates | null;
  color: string;
  vehicleType: VehicleType | null;
  windowTint: WindowTint | null;
  registration: string;
  photo: CapturedPhoto | null;
  vehicleDescription: string;
  observedBehavior: string;
  details: string;
};

export function suspiciousVehicleLocationDescription(draft: SuspiciousVehicleReportDraft) {
  return [draft.location.trim(), draft.locationHint.trim()]
    .filter(Boolean)
    .join(' — ');
}

// Preserve explicit answers in the existing public description, including older reports.
export function suspiciousVehicleDescription(draft: SuspiciousVehicleReportDraft) {
  return [
    `Couleur : ${draft.color.trim()}`,
    `Type : ${vehicleTypes.find((type) => type.id === draft.vehicleType)?.label ?? ''}`,
    `Vitres teintées : ${windowTintOptions.find((option) => option.id === draft.windowTint)?.label ?? ''}`,
    draft.registration.trim() ? `Immatriculation : ${draft.registration.trim()}` : '',
    draft.vehicleDescription.trim(),
  ].filter(Boolean).join('\n');
}

export function validateSuspiciousVehicleStep(
  draft: SuspiciousVehicleReportDraft,
  step: number,
): string | null {
  if (step === 0 && !isPreciseLocation(draft.coordinates)) {
    return 'Une position GPS précise à 30 mètres ou mieux est nécessaire.';
  }
  if (suspiciousVehicleLocationDescription(draft).length > 500) {
    return 'Le lieu et son repère doivent contenir au maximum 500 caractères.';
  }
  if (step === 1) {
    if (draft.color.trim().length < 2 || draft.color.trim().length > 80) return 'Indiquez la couleur (2 à 80 caractères), ou « inconnue ».';
    if (!vehicleTypes.some((type) => type.id === draft.vehicleType)) return 'Choisissez le type de véhicule.';
    if (!windowTintOptions.some((option) => option.id === draft.windowTint)) return 'Précisez si les vitres sont teintées.';
    if (draft.registration.trim().length > 80) return 'L’immatriculation doit contenir au maximum 80 caractères.';
    if (suspiciousVehicleDescription(draft).length > MAX_VEHICLE_DESCRIPTION_LENGTH) {
      return `La description du véhicule doit contenir au maximum ${MAX_VEHICLE_DESCRIPTION_LENGTH} caractères.`;
    }
    if (draft.observedBehavior.trim().length < 3) {
      return 'Décrivez les faits observés qui motivent ce signalement.';
    }
    if (draft.observedBehavior.trim().length > MAX_OBSERVED_BEHAVIOR_LENGTH) {
      return `La description des faits doit contenir au maximum ${MAX_OBSERVED_BEHAVIOR_LENGTH} caractères.`;
    }
  }
  if (step === 2) {
    if (draft.photo && (!draft.photo.base64 || draft.photo.base64.length * 0.75 > MAX_VEHICLE_PHOTO_BYTES)) return 'La photo est vide ou dépasse 6 Mo. Retirez-la et reprenez-la.';
    if (draft.details.trim().length > MAX_DETAILS_LENGTH) {
      return `Les précisions doivent contenir au maximum ${MAX_DETAILS_LENGTH} caractères.`;
    }
  }
  return null;
}
