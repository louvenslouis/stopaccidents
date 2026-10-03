import type { SafetyReportSummary } from '@/features/safety-report/read';

export function stackReportKey(report: SafetyReportSummary) {
  return `${report.report_kind}:${report.event_id || report.id}`;
}

export function recentReportStack(latest: SafetyReportSummary | null, reports: SafetyReportSummary[]) {
  const seen = new Set<string>();
  return [...(latest ? [latest] : []), ...reports]
    .sort((a, b) => Date.parse(b.last_observed_at || b.created_at) - Date.parse(a.last_observed_at || a.created_at))
    .filter(report => {
      const key = stackReportKey(report);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}
