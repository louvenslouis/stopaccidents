import { readAccident } from '@/features/accident-report/read';
import { readSuspiciousVehicleReport, type SafetyReportSummary } from '@/features/safety-report/read';
import { readReportEvent } from '@/features/report-events/api';
import { readReportPhotos } from '@/features/report-events/photos';

type Photo = { url: string | null; captured_at: string; storage_path: string };

// Relevance uses the report/event relationship and recency, not a guess about image contents.
export function rankReportPhotos(photos: readonly Photo[]): string[] {
  return [...photos]
    .filter((photo) => Boolean(photo.url))
    .sort((a, b) => (Date.parse(b.captured_at) || 0) - (Date.parse(a.captured_at) || 0) || a.storage_path.localeCompare(b.storage_path))
    .map((photo) => photo.url!);
}

export async function readReportCardPhotos(report: SafetyReportSummary, signal: AbortSignal): Promise<string[]> {
  const read = report.report_kind === 'accident' ? readAccident
    : report.report_kind === 'suspicious_vehicle' ? readSuspiciousVehicleReport
    : async (id: string, request: AbortSignal) => ({ photos: await readReportPhotos(report.report_kind, id, request) });
  if (signal.aborted) return [];
  const detail = await read(report.id, signal);
  if (signal.aborted || !detail) return [];
  const own = rankReportPhotos(detail.photos ?? []);
  if (own.length) return own;
  if (!report.event_id || (report.testimony_count ?? 1) < 2) return [];
  const event = await readReportEvent(report.report_kind, report.id, signal);
  if (signal.aborted || !event || event.event_id !== report.event_id) return [];
  const candidates = event.contributions
    .filter((item) => item.id !== report.id && item.report_kind === report.report_kind)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  for (const candidate of candidates) {
    if (signal.aborted) return [];
    const contribution = await read(candidate.id, signal);
    if (signal.aborted) return [];
    const photos = rankReportPhotos(contribution?.photos ?? []);
    if (photos.length) return photos;
  }
  return [];
}
