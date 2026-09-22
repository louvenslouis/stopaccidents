import { OpenStreetMap } from '@/components/open-street-map';
import { SafetyReportDetailSheet } from '@/components/safety-report-detail-sheet';
import { useAccident } from '@/features/accident-report/use-accident';
import { safetyReportMarkers } from '@/features/safety-report/map-markers';
import { readMapReports } from '@/features/safety-report/read';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

export default function MapScreen() {
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const reports = useAccident(readMapReports, !selectedReport, 30000);
  const markers = useMemo(() => safetyReportMarkers(reports.data?.reports ?? []), [reports.data]);
  return (
    <>
      <View style={styles.screen}>
        <Head>
          <title>Carte — Stop Accidents</title>
        </Head>
        <StatusBar style="dark" />
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#E8EEF0',
  },
});
