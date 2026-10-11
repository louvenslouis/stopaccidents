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
  const [detailResult, eventResult] = await Promise.allSettled([
    read(report.id, signal),
    report.event_id ? readReportEvent(report.report_kind, report.id, signal) : Promise.resolve(null),
  ]);
  if (signal.aborted) return [];
  const photos: Photo[] = detailResult.status === 'fulfilled' ? [...(detailResult.value?.photos ?? [])] : [];
  const event = eventResult.status === 'fulfilled' ? eventResult.value : null;
  if (!event || event.event_id !== report.event_id) return rankReportPhotos(photos);
  const candidates = event.contributions
    .filter((item) => item.id !== report.id && item.report_kind === report.report_kind)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  // Bound concurrent reads while collecting photos from every testimony of this event.
  for (let offset = 0; offset < candidates.length; offset += 4) {
    if (signal.aborted) return [];
    const results = await Promise.allSettled(candidates.slice(offset, offset + 4).map(candidate => read(candidate.id, signal)));
    if (signal.aborted) return [];
    for (const result of results) {
      if (result.status === 'fulfilled') photos.push(...(result.value?.photos ?? []));
    }
  }
  return rankReportPhotos(photos);
}
