import { supabase } from '@/lib/supabase';
import type { AccidentType, Severity } from '@/features/accident-report/model';

type ReportLocation = {
  id: string;
  location_description: string;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  completed_step: number;
};

export type AccidentReportSummary = ReportLocation & {
  report_kind: 'accident';
  accident_type: AccidentType | null;
  severity: Severity;
};

export type KidnappingReportSummary = ReportLocation & {
  report_kind: 'kidnapping';
  accident_type: null;
  severity: null;
};

export type SafetyReportSummary = AccidentReportSummary | KidnappingReportSummary;

export type MapSafetyReports = {
  reports: SafetyReportSummary[];
  truncated: boolean;
};

export type KidnappingReportDetail = KidnappingReportSummary & {
  location_accuracy_m: number | null;
  status: 'received' | 'reviewing' | 'closed';
  updated_at: string;
  is_owner: boolean;
  vehicle_clues?: string;
  direction_taken?: string;
  abducted_person_clues?: string;
};

export async function readLatestReport(signal: AbortSignal): Promise<SafetyReportSummary | null> {
  const { data, error } = await supabase.rpc('read_latest_report').abortSignal(signal);
  if (error) {
    throw new Error('Impossible de charger le dernier signalement. Réessayez.');
  }
  return data as SafetyReportSummary | null;
}

export async function readMapReports(signal: AbortSignal): Promise<MapSafetyReports> {
  const { data, error } = await supabase.rpc('read_map_reports').abortSignal(signal);
  if (error || !data || !Array.isArray(data.reports)) {
    throw new Error('Impossible de charger les signalements. Réessayez.');
  }
  return data as MapSafetyReports;
}

export async function readKidnappingReport(
  id: string,
  signal: AbortSignal,
): Promise<KidnappingReportDetail | null> {
  const { data, error } = await supabase
    .rpc('read_kidnapping_report', { p_id: id })
    .abortSignal(signal);
  if (error) {
    throw new Error('Impossible de charger ce cas d’enlèvement. Réessayez.');
  }
  return data as KidnappingReportDetail | null;
}

export function reportSelection(report: Pick<SafetyReportSummary, 'id' | 'report_kind'>) {
  return `${report.report_kind}:${report.id}`;
}

export function parseReportSelection(value: string) {
  const separator = value.indexOf(':');
  if (separator < 1) return null;
  const reportKind = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if ((reportKind !== 'accident' && reportKind !== 'kidnapping') || !id) {
    return null;
  }
  return { reportKind, id } as const;
}
