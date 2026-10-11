import { useEffect, useState } from 'react';
import type { SafetyReportSummary } from '@/features/safety-report/read';
import { readReportCardPhotos } from './report-photo';

export function useReportCardPhotos(report: SafetyReportSummary | null, refreshing = false, revision = 0) {
  const key = report ? [report.report_kind, report.id, report.event_id, report.last_observed_at, report.completed_step, report.testimony_count].join(':') : '';
  const [result, setResult] = useState<{ key: string; urls: string[] }>({ key: '', urls: [] });
  useEffect(() => {
    if (!report || refreshing) return;
    const request = new AbortController();
    const timeout = setTimeout(() => request.abort(), 12000);
    void readReportCardPhotos(report, request.signal).then(urls => {
      if (!request.signal.aborted) setResult({ key, urls });
    }).catch(() => {
      if (!request.signal.aborted) setResult({ key, urls: [] });
    }).finally(() => clearTimeout(timeout));
    return () => { request.abort(); clearTimeout(timeout); };
    // A saved testimony can add photos before the event summary has refreshed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshing, revision]);
  return result.key === key ? result.urls : [];
}
