import type { AccidentType, Severity } from './model';
import type { AccidentSummary } from './read';

export const accidentTypeLabels: Record<AccidentType, string> = {
  two_cars: 'Deux voitures',
  single_car: 'Une seule voiture',
  motorcycle: 'Motocyclette',
  car_motorcycle: 'Voiture et moto',
  car_pedestrian: 'Voiture et piéton',
  car_tuktuk: 'Voiture et tuk-tuk',
  single_motorcycle: 'Moto seule',
  other: 'Autre accident',
};

const severityPresentation: Record<
  Severity,
  { label: string; color: string; tint: string }
> = {
  material: { label: 'Dégâts matériels', color: '#23766A', tint: '#EAF6F1' },
  injuries: { label: 'Des blessés', color: '#92600F', tint: '#FFF5E4' },
  serious: { label: 'Blessures graves', color: '#B94025', tint: '#FFF0E9' },
  fatal: { label: 'Décès signalé', color: '#BD2E40', tint: '#FDECEF' },
  unknown: { label: 'À déterminer', color: '#657084', tint: '#F0F2F6' },
};

export function accidentTypeLabel(report: AccidentSummary) {
  return report.accident_type
    ? accidentTypeLabels[report.accident_type]
    : 'Type à préciser';
}

export function accidentSeverity(report: AccidentSummary) {
  if (report.completed_step < 3) {
    return { ...severityPresentation.unknown, label: 'À préciser' };
  }
  return severityPresentation[report.severity];
}

export function accidentLocation(report: AccidentSummary) {
  if (report.location_description.trim())
    return report.location_description.trim();
  if (report.latitude !== null && report.longitude !== null) {
    return `${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}`;
  }
  return 'Lieu à préciser';
}

export function formatAccidentDate(value: string) {
  return new Date(value).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
