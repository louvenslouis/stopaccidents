import { useLanguage } from '@/features/language/language-provider';
import { View } from '@/features/language/native';
import { createThemedStyles } from '@/features/appearance/theme-provider';
import { OpenStreetMap } from '@/components/open-street-map';
import { SafetyReportDetailSheet } from '@/components/safety-report-detail-sheet';
import { useAccident } from '@/features/accident-report/use-accident';
import { safetyReportMarkers } from '@/features/safety-report/map-markers';
import { readMapReports } from '@/features/safety-report/read';
import Head from 'expo-router/head';
import { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

export default function MapScreen() {
  const { t } = useLanguage();
  const styles = useStyles();

  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const reports = useAccident(readMapReports, !selectedReport, 30000);
  const markers = useMemo(() => safetyReportMarkers(reports.data?.reports ?? []), [reports.data]);
  return (
    <>
      <View style={styles.screen}>
        <Head>
          <title>{t('Carte — Stop Accidents')}</title>
        </Head>
        <OpenStreetMap markers={markers} onSelect={setSelectedReport} reportsState={{ loading: reports.loading, error: reports.error, truncated: reports.data?.truncated ?? false, available: reports.data !== null, refresh: reports.refresh }} />
      </View>
      {selectedReport && (
        <SafetyReportDetailSheet
          key={selectedReport}
          selection={selectedReport}
          onClose={() => setSelectedReport(null)}
        />
      )}
    </>
  );
}

const useStyles = createThemedStyles((themeColor) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: themeColor('#E8EEF0', 'background'),
  },
}));
