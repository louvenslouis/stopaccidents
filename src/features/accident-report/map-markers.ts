import { HAITI_BOUNDS } from '@/components/map-document';
import type { AccidentMarker } from '@/components/map-frame-props';
import {
  accidentSeverity,
  accidentTypeLabel,
  formatAccidentDate,
} from './presentation';
import type { AccidentSummary } from './read';

export function accidentMarkers(reports: AccidentSummary[]): AccidentMarker[] {
  return reports.flatMap((report) => {
    const { latitude, longitude } = report;
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < HAITI_BOUNDS[0][0] ||
      latitude > HAITI_BOUNDS[1][0] ||
      longitude < HAITI_BOUNDS[0][1] ||
      longitude > HAITI_BOUNDS[1][1]
    )
      return [];
    const severity = accidentSeverity(report);
    return [
      {
        id: report.id,
        latitude,
        longitude,
        color: severity.color,
        priority: {
          unknown: 0,
          material: 1,
          injuries: 2,
          serious: 3,
          fatal: 4,
        }[report.completed_step < 3 ? 'unknown' : report.severity],
        illustration: 'accident',
        title: `${accidentTypeLabel(report)} · ${severity.label} · ${formatAccidentDate(report.created_at)}`,
      },
    ];
  });
}
