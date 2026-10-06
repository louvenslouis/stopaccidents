// Add future report categories here; each choice routes to its own form.
export const reportTypes = [
  {
    id: "accident",
    title: "Accident",
    tint: "#FFF0E9",
    border: "#F7D9CC",
    description: "Collision, sortie de route ou personne renversée.",
  },
  {
    id: "barricade",
    tint: "#FFF5DF",
    border: "#F2E3BC",
    title: "Route barricadée",
    description: "Route bloquée, obstacles et possibilités de passage.",
  },
  {
    id: "breakdown",
    title: "Véhicule en panne",
    tint: "#FFF4E8",
    border: "#F0D9BD",
    description: "Emplacement, type de véhicule et impact sur la circulation.",
  },
  { id: "gathering", title: "Rassemblement", tint: "#EAF5F5", border: "#B8DEDD", description: "Rassemblement" },
  { id: "fire", title: "Incendie", tint: "#FFF0E5", border: "#F6CFB2", description: "Incendie" },
  { id: "gunfire", title: "Tirs entendus", tint: "#FFF0EE", border: "#F3D1CB", description: "Proximité perçue, quantité approximative et rythme des tirs." },
  {
    id: "kidnapping",
    title: "Enlèvement",
    tint: "#F0EDFF",
    border: "#E0D9F8",
    description: "Véhicules, direction prise et indices sur la personne.",
  },
  {
    id: "armed_presence",
    tint: "#EDF3F8",
    border: "#D9E4ED",
    title: "Présence d’hommes armés",
    description: "Localisation, nombre approximatif et situation observée.",
  },
  {
    id: "suspicious_vehicle",
    tint: "#EAF6F0",
    border: "#D1E9DC",
    title: "Vehicule Suspect",
    description: "Description du véhicule et faits observés.",
  },
] as const;
export type ReportType = (typeof reportTypes)[number]["id"];


export const REPORT_PREFERENCES_KEY = 'stopaccidents.report-types';
export type ReportVisibility = Record<ReportType, boolean>;
export const defaultVisibility = Object.fromEntries(reportTypes.map(({ id }) => [
  id, !['suspicious_vehicle', 'armed_presence', 'kidnapping', 'gunfire'].includes(id),
])) as ReportVisibility;

export function parseVisibility(value: string | null): ReportVisibility {
  const result = { ...defaultVisibility };
  try {
    const stored: unknown = JSON.parse(value ?? 'null');
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      for (const { id } of reportTypes) {
        const enabled = (stored as Record<string, unknown>)[id];
        if (typeof enabled === 'boolean') result[id] = enabled;
      }
    }
  } catch { /* Invalid local preferences fall back to defaults. */ }
  return result;
}
