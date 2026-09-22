import { SuspiciousVehicleDetailSheet } from '@/components/suspicious-vehicle-detail-sheet';
import { GunfireDetailSheet } from '@/components/gunfire-detail-sheet';
import { ArmedPresenceDetailSheet } from '@/components/armed-presence-detail-sheet';
import { BarricadeDetailSheet } from '@/components/barricade-detail-sheet';
import { AccidentDetailSheet } from '@/components/accident-detail-sheet';
import { KidnappingDetailSheet } from '@/components/kidnapping-detail-sheet';
import { parseReportSelection } from '@/features/safety-report/read';

export function SafetyReportDetailSheet({
  selection,
  onClose,
  hideContributions = false,
}: {
  selection: string;
  onClose: () => void;
  hideContributions?: boolean;
}) {
  const report = parseReportSelection(selection);
  if (!report) return null;
  if (report.reportKind === 'suspicious_vehicle') return <SuspiciousVehicleDetailSheet id={report.id} onClose={onClose} hideContributions={hideContributions} />;
  if (report.reportKind === 'gunfire') return <GunfireDetailSheet id={report.id} onClose={onClose} hideContributions={hideContributions} />;
  if (report.reportKind === 'armed_presence') return <ArmedPresenceDetailSheet id={report.id} onClose={onClose} hideContributions={hideContributions} />;
  if (report.reportKind === 'barricade') return <BarricadeDetailSheet id={report.id} onClose={onClose} hideContributions={hideContributions} />;
  if (report.reportKind === 'kidnapping') {
    return <KidnappingDetailSheet id={report.id} onClose={onClose} hideContributions={hideContributions} />;
  }
  return <AccidentDetailSheet id={report.id} onClose={onClose} hideContributions={hideContributions} />;
}
