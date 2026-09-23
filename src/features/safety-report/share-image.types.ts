import type { View } from 'react-native';
import type { ReportShare } from './share';

export type PreparedReportImage = {
  uri: string;
  canShare: boolean;
  share: () => Promise<void>;
  download?: () => void;
  dispose: () => void;
};

export type PrepareReportImage = (view: View, report: ReportShare, size: { width: number; height: number }) => Promise<PreparedReportImage>;
