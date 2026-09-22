import { HAITI_BOUNDS } from '@/components/map-document';
import type { AccidentMarker } from '@/components/map-frame-props';
import {
  accidentSeverity,
  accidentTypeLabel,
  formatAccidentDate,
} from '@/features/accident-report/presentation';
import { reportSelection, type SafetyReportSummary } from './read';

export function safetyReportMarkers(reports: SafetyReportSummary[]): AccidentMarker[] {
  return reports.flatMap((report): AccidentMarker[] => {
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
    ) {
      return [];
    }

    if (report.report_kind === 'suspicious_vehicle') {
      return [{ id: reportSelection(report), latitude, longitude, color: '#95621C', priority: 3, illustration: 'suspicious_vehicle', title: `Voiture suspecte · ${formatAccidentDate(report.created_at)}` }];
    }
    if (report.report_kind === 'gunfire') {
      return [{ id: reportSelection(report), latitude, longitude, color: '#AF3848', priority: 5, illustration: 'gunfire', title: `Tirs entendus · lieu d’écoute · ${formatAccidentDate(report.created_at)}` }];
    }
    if (report.report_kind === 'armed_presence') {
      return [{ id: reportSelection(report), latitude, longitude, color: '#AF3848', priority: 5, illustration: 'armed_presence', title: `Présence d’hommes armés · ${formatAccidentDate(report.created_at)}` }];
    }
    if (report.report_kind === 'barricade') {
      return [{ id: reportSelection(report), latitude, longitude, color: '#B96B16', priority: 4, illustration: 'barricade', title: `Route barricadée · ${formatAccidentDate(report.created_at)}` }];
    }
    if (report.report_kind === 'kidnapping') {
      return [
        {
          id: reportSelection(report),
          latitude,
          longitude,
          color: '#7C3FA0',
          priority: 5,
          illustration: 'kidnapping',
          title: `Enlèvement · ${formatAccidentDate(report.created_at)}`,
        },
      ];
    }

    const severity = accidentSeverity(report);
    return [
      {
        id: reportSelection(report),
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
