import type { ReactNode } from 'react';
import { ReportDetailAppearanceContext } from './report-detail-appearance';
import { GatheringDetailSheet } from '@/components/gathering-detail-sheet';
import { FireDetailSheet } from '@/components/fire-detail-sheet';
import { SuspiciousVehicleDetailSheet } from '@/components/suspicious-vehicle-detail-sheet';
import { GunfireDetailSheet } from '@/components/gunfire-detail-sheet';
import { ArmedPresenceDetailSheet } from '@/components/armed-presence-detail-sheet';
import { BarricadeDetailSheet } from '@/components/barricade-detail-sheet';
import { AccidentDetailSheet } from '@/components/accident-detail-sheet';
import { KidnappingDetailSheet } from '@/components/kidnapping-detail-sheet';
import { BreakdownDetailSheet } from '@/components/breakdown-detail-sheet';
import { parseReportSelection } from '@/features/safety-report/read';

export function SafetyReportDetailSheet({
  selection,
  footer,
  onClose,
  hideContributions = false,
  embedded = false,
}: {
  selection: string;
  footer?: ReactNode;
  onClose: () => void;
  hideContributions?: boolean;
  embedded?: boolean;
}) {
  const report = parseReportSelection(selection);
  if (!report) return null;
  const Detail = {
    accident: AccidentDetailSheet,
    gathering: GatheringDetailSheet,
    fire: FireDetailSheet,
    suspicious_vehicle: SuspiciousVehicleDetailSheet,
    gunfire: GunfireDetailSheet,
    armed_presence: ArmedPresenceDetailSheet,
    barricade: BarricadeDetailSheet,
    breakdown: BreakdownDetailSheet,
    kidnapping: KidnappingDetailSheet,
  }[report.reportKind];
  return <ReportDetailAppearanceContext value={embedded}>
    <Detail footer={footer} id={report.id} onClose={onClose} hideContributions={hideContributions} embedded={embedded} />
  </ReportDetailAppearanceContext>;
}
