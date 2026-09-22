import { AccidentDetailSheet } from '@/components/accident-detail-sheet';
import { KidnappingDetailSheet } from '@/components/kidnapping-detail-sheet';
import { parseReportSelection } from '@/features/safety-report/read';

export function SafetyReportDetailSheet({
  selection,
  onClose,
}: {
  selection: string;
  onClose: () => void;
}) {
  const report = parseReportSelection(selection);
  if (!report) return null;
  if (report.reportKind === 'kidnapping') {
    return <KidnappingDetailSheet id={report.id} onClose={onClose} />;
  }
  return <AccidentDetailSheet id={report.id} onClose={onClose} />;
}
