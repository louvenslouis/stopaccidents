export const vehicleTypes = [
  { id: "car", label: "Voiture" },
  { id: "motorcycle", label: "Moto" },
  { id: "suv", label: "SUV / 4×4" },
  { id: "pickup", label: "Pick-up" },
  { id: "van", label: "Fourgon / minibus" },
  { id: "truck", label: "Camion" },
  { id: "bus", label: "Autobus" },
  { id: "other", label: "Autre" },
] as const;
export type SafetyRecord = {
  id: string;
  kind: "registration" | "identity";
  value: string;
  vehicle_type: string | null;
  color: string | null;
  photo_path: string | null;
};
export type SafetyProfile = {
  alerts_enabled: boolean;
  records: SafetyRecord[];
};
export type SafetyAlert = {
  id: string;
  alias: string;
  report_id: string;
  report_kind: "accident" | "suspicious_vehicle";
  location: string;
  occurred_at: string;
  match_kind: "registration" | "identity";
  created_at: string;
  read_at: string | null;
};
export function normalizeIdentifier(value: string): string | null {
  if (!/^[A-Za-z0-9\s-]+$/.test(value)) return null;
  return value.replace(/[\s-]/g, "").toUpperCase() || null;
}
export function validateRecord(record: SafetyRecord): string | null {
  const value = normalizeIdentifier(record.value);
  if (
    !value ||
    record.value.length > 100 ||
    value.length < (record.kind === "identity" ? 4 : 3) ||
    value.length > (record.kind === "identity" ? 80 : 32)
  ) {
    return "Saisissez un numéro complet, avec uniquement des lettres, chiffres, espaces ou tirets.";
  }
  if (
    record.kind === "registration" &&
    (!vehicleTypes.some((type) => type.id === record.vehicle_type) ||
      !record.color ||
      record.color.trim().length < 2 ||
      record.color.trim().length > 40)
  ) {
    return "Renseignez le type et la couleur du véhicule.";
  }
  return null;
}
