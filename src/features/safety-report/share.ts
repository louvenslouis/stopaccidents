import { accidentSeverity, accidentTypeLabel, formatAccidentDate } from '../accident-report/presentation';
import { parseReportSelection, reportSelection, type SafetyReportSummary } from './read';

const PUBLIC_SITE_URL = 'https://louvenslouis.github.io/stopaccidents/';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sharedReportSelection(value: string | string[] | undefined) {
  if (typeof value !== 'string') return null;
  const selection = parseReportSelection(value);
  return selection && UUID.test(selection.id) ? value : null;
}

export function reportShareUrl(report: SafetyReportSummary, siteUrl = process.env.EXPO_PUBLIC_SITE_URL || PUBLIC_SITE_URL) {
  const url = new URL(siteUrl);
  if (url.protocol !== 'https:') throw new Error('Le lien public doit utiliser HTTPS.');
  url.hash = '';
  url.search = '';
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  url.searchParams.set('signalement', reportSelection(report));
  return url.toString();
}

export function reportLabel(report: SafetyReportSummary) {
  switch (report.report_kind) {
    case 'accident': return accidentTypeLabel(report);
    case 'gunfire': return 'Tirs entendus';
    case 'suspicious_vehicle': return 'Voiture suspecte';
    case 'armed_presence': return 'Présence d’hommes armés';
    case 'barricade': return 'Route barricadée';
    case 'breakdown': return 'Véhicule en panne';
    case 'kidnapping': return 'Enlèvement';
  }
}

export function createReportShare(report: SafetyReportSummary, location: { label: string; estimated: boolean }) {
  const label = reportLabel(report);
  const title = report.report_kind === 'accident' ? `Accident · ${label}` : label;
  const severity = report.report_kind === 'accident' ? accidentSeverity(report) : null;
  const date = formatAccidentDate(report.created_at);
  const url = reportShareUrl(report);
  // Only the public summary is shared, never private details from the full report.
  const description = [
    title,
    `${location.estimated ? 'Zone estimée' : 'Lieu'} : ${location.label.trim() || 'Lieu à préciser'}`,
    `Signalé le ${date}`,
    ...(severity ? [`Gravité : ${severity.label}`] : []),
  ].join('\n');
  return {
    label, title, severity, date, url, description,
    location: location.label.trim() || 'Lieu à préciser',
    estimated: location.estimated,
    message: `${description}\n\nVoir l’événement sur Stop Accidents :\n${url}`,
    filename: `stop-accidents-${report.report_kind}-${report.id}.png`,
    kind: report.report_kind,
  };
}

export type ReportShare = ReturnType<typeof createReportShare>;
