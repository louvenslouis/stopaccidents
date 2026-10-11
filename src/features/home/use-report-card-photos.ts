import { useEffect, useState } from 'react';
import type { SafetyReportSummary } from '@/features/safety-report/read';
import { readReportCardPhotos } from './report-photo';

const photoCache = new Map<string, { urls: string[]; expiresAt: number }>();
function cachedPhotos(identity: string) {
  const entry = photoCache.get(identity);
  if (!entry || entry.expiresAt <= Date.now()) {
    photoCache.delete(identity);
    return [];
  }
  return entry.urls;
}

export function useReportCardPhotos(report: SafetyReportSummary | null, refreshing = false, revision = 0) {
  const identity = report ? `${report.report_kind}:${report.event_id || report.id}` : '';
  const key = report ? [report.report_kind, report.id, report.event_id, report.last_observed_at, report.completed_step, report.testimony_count].join(':') : '';
  const [result, setResult] = useState<{ identity: string; urls: string[] }>(() => ({ identity, urls: cachedPhotos(identity) }));
  useEffect(() => {
    if (!report || refreshing) return;
    const request = new AbortController();
    const timeout = setTimeout(() => request.abort(), 12000);
    void readReportCardPhotos(report, request.signal).then(urls => {
      if (!request.signal.aborted) {
        photoCache.delete(identity);
        photoCache.set(identity, { urls, expiresAt: Date.now() + 10 * 60 * 1000 });
        if (photoCache.size > 60) photoCache.delete(photoCache.keys().next().value!);
        setResult({ identity, urls });
      }
    }).catch(() => {
      // Keep the last usable image when a background refresh fails.
    }).finally(() => clearTimeout(timeout));
    return () => { request.abort(); clearTimeout(timeout); };
    // A saved testimony can add photos before the event summary has refreshed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, key, refreshing, revision]);
  return result.identity === identity ? result.urls : cachedPhotos(identity);
}
