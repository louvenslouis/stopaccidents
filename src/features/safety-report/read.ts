import { supabase } from '@/lib/supabase';
import type { AccidentType, Severity } from '@/features/accident-report/model';
import type {
  BreakdownPosition,
  BreakdownVehicleType,
  TrafficImpact,
} from '@/features/breakdown-report/model';

type ReportLocation = {
  event_id?: string;
  testimony_count?: number;
  witness_count?: number;
  last_observed_at?: string;
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

export type BarricadeReportSummary = ReportLocation & { report_kind: 'barricade'; accident_type: null; severity: null };
export type BarricadeReportDetail = BarricadeReportSummary & { location_accuracy_m: number | null; status: 'received' | 'reviewing' | 'closed'; updated_at: string; obstacles: string; passage: string; details: string };
export type GunfireReportSummary = ReportLocation & { report_kind: 'gunfire'; accident_type: null; severity: null };
export type GunfireReportDetail = GunfireReportSummary & { location_accuracy_m: number | null; status: 'received' | 'reviewing' | 'closed'; updated_at: string; shot_count: string; cadence: string; proximity: string; details: string };
export type ArmedPresenceReportSummary = ReportLocation & { report_kind: 'armed_presence'; accident_type: null; severity: null };
export type ArmedPresenceReportDetail = ArmedPresenceReportSummary & { location_accuracy_m: number | null; status: 'received' | 'reviewing' | 'closed'; updated_at: string; presence: string; activity: string; details: string };
export type SuspiciousVehicleReportSummary = ReportLocation & { report_kind: 'suspicious_vehicle'; accident_type: null; severity: null };
export type SuspiciousVehicleReportDetail = SuspiciousVehicleReportSummary & { location_accuracy_m: number | null; status: 'received' | 'reviewing' | 'closed'; updated_at: string; vehicle_description: string; observed_behavior: string; details: string; photos?: { storage_path: string; captured_at: string; url: string | null }[] };
export type BreakdownReportSummary = ReportLocation & { report_kind: 'breakdown'; accident_type: null; severity: null };
export type BreakdownReportDetail = BreakdownReportSummary & {
  location_accuracy_m: number | null;
  status: 'received' | 'reviewing' | 'closed';
  updated_at: string;
  breakdown_position: BreakdownPosition;
  vehicle_type: BreakdownVehicleType;
  traffic_impact: TrafficImpact;
  details: string;
};
export type SafetyReportSummary = GunfireReportSummary | AccidentReportSummary | KidnappingReportSummary | BarricadeReportSummary | ArmedPresenceReportSummary | SuspiciousVehicleReportSummary | BreakdownReportSummary;

export async function readSuspiciousVehicleReport(id: string, signal: AbortSignal): Promise<SuspiciousVehicleReportDetail | null> {
  const { data, error } = await supabase.rpc('read_suspicious_vehicle_report', { p_id: id }).abortSignal(signal);
  if (error) throw new Error('Impossible de charger ce signalement de voiture suspecte. Réessayez.');
  if (!data) return null;
  const report = data as SuspiciousVehicleReportDetail;
  if (!report.photos?.length || signal.aborted) return report;
  try {
    const { data: urls } = await supabase.storage.from('suspicious-vehicle-photos').createSignedUrls(report.photos.map((photo) => photo.storage_path), 900);
    return { ...report, photos: report.photos.map((photo) => ({ ...photo, url: urls?.find((item) => item.path === photo.storage_path && !item.error)?.signedUrl ?? null })) };
  } catch {
    return { ...report, photos: report.photos.map((photo) => ({ ...photo, url: null })) };
  }
}

export async function readGunfireReport(id: string, signal: AbortSignal): Promise<GunfireReportDetail | null> {
  const { data, error } = await supabase.rpc('read_gunfire_report', { p_id: id }).abortSignal(signal);
  if (error) throw new Error('Impossible de charger ce signalement de tirs entendus. Réessayez.');
  return data as GunfireReportDetail | null;
}

export async function readArmedPresenceReport(id: string, signal: AbortSignal): Promise<ArmedPresenceReportDetail | null> {
  const { data, error } = await supabase.rpc('read_armed_presence_report', { p_id: id }).abortSignal(signal);
  if (error) throw new Error('Impossible de charger ce signalement d’hommes armés. Réessayez.');
  return data as ArmedPresenceReportDetail | null;
}

export async function readBarricadeReport(id: string, signal: AbortSignal): Promise<BarricadeReportDetail | null> {
  const { data, error } = await supabase.rpc('read_barricade_report', { p_id: id }).abortSignal(signal);
  if (error) throw new Error('Impossible de charger cette route barricadée. Réessayez.');
  return data as BarricadeReportDetail | null;
}

export async function readBreakdownReport(id: string, signal: AbortSignal): Promise<BreakdownReportDetail | null> {
  const { data, error } = await supabase.rpc('read_breakdown_report', { p_id: id }).abortSignal(signal);
  if (error) throw new Error('Impossible de charger ce signalement de véhicule en panne. Réessayez.');
  return data as BreakdownReportDetail | null;
}

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
  if ((reportKind !== 'gunfire' && reportKind !== 'accident' && reportKind !== 'kidnapping' && reportKind !== 'barricade' && reportKind !== 'armed_presence' && reportKind !== 'suspicious_vehicle' && reportKind !== 'breakdown') || !id) {
    return null;
  }
  return { reportKind, id } as const;
}
