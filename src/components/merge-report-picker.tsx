import { SafetyReportDetailSheet } from './safety-report-detail-sheet';
import { Image } from 'expo-image';
import { ReportIllustration } from './report-illustration';
import { useReportCardPhotos } from '@/features/home/use-report-card-photos';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import Check from 'lucide-react-native/icons/check';
import { Pressable, Text, TextInput, View } from '@/features/language/native';
import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { useAccident } from '@/features/accident-report/use-accident';
import { formatAccidentDate } from '@/features/accident-report/presentation';
import { readMapReports, reportSelection, type SafetyReportSummary } from '@/features/safety-report/read';
import { reportLabel } from '@/features/safety-report/share';
import type { ReportKind } from '@/features/report-events/api';

export function MergeReportPicker({ kind, sourceId, value, onChange, disabled }: {
  kind: ReportKind;
  sourceId: string;
  value: string;
  onChange: (eventId: string) => void;
  disabled: boolean;
}) {
  const styles = useStyles();
  const color = useThemeColor();
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<SafetyReportSummary | null>(null);
  const { data, loading, error, refresh } = useAccident(readMapReports);
  const seen = new Set<string>();
  const candidates = (data?.reports ?? []).filter(report => {
    if (report.report_kind !== kind || !report.event_id || report.event_id === sourceId || seen.has(report.event_id)) return false;
    seen.add(report.event_id);
    return true;
  });
  const query = search.trim().toLocaleLowerCase();
  const visible = candidates.filter(report => `${reportLabel(report)} ${report.location_description}`.toLocaleLowerCase().includes(query));
  return <View style={styles.container}>
    <TextInput accessibilityLabel="Rechercher un signalement" placeholder="Rechercher un signalement" value={search} onChangeText={setSearch} editable={!disabled} style={styles.search} />
    {loading ? <ActivityIndicator /> : error ? <Pressable accessibilityRole="button" onPress={refresh} style={styles.item}><Text style={styles.title}>Chargement impossible. Réessayer.</Text></Pressable> : <>
      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={styles.list} contentContainerStyle={styles.container}>
        {visible.map(report => <View key={report.event_id} style={[styles.item, value === report.event_id && styles.selected]}>
          <Pressable accessibilityRole="radio" accessibilityState={{ checked: value === report.event_id, disabled }} disabled={disabled} onPress={() => onChange(report.event_id!)} style={styles.selectRow}>
          <MergeReportThumbnail report={report} />
          <View style={styles.copy}>
            <Text style={styles.title}>{reportLabel(report)}</Text>
            <Text translate={false} style={styles.location}>{report.location_description || 'Lieu à préciser'}</Text>
            <Text style={styles.date}>{formatAccidentDate(report.last_observed_at ?? report.created_at)}</Text>
          </View>
          {value === report.event_id && <Check size={20} color={color('#296957', 'success')} />}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Voir les détails : ${reportLabel(report)}, ${report.location_description}`} disabled={disabled} onPress={() => setPreview(report)} style={styles.detailsButton}>
            <Text style={styles.detailsText}>Voir les détails</Text>
          </Pressable>
        </View>)}
        {visible.length === 0 && <Text style={styles.date}>{query ? 'Aucun résultat.' : 'Aucun signalement à fusionner.'}</Text>}
      </ScrollView>
      {data?.truncated && <Text style={styles.date}>Les 500 signalements les plus récents.</Text>}
    </>}
    {preview && <SafetyReportDetailSheet selection={reportSelection(preview)} onClose={() => setPreview(null)} footer={
      <View style={styles.previewFooter}>
        <Pressable accessibilityRole="button" disabled={disabled || !preview.event_id} onPress={() => {
          if (disabled || !preview.event_id) return;
          onChange(preview.event_id);
          setPreview(null);
        }} style={styles.detailsButton}>
          <Text style={styles.detailsText}>Sélectionner ce signalement</Text>
        </Pressable>
      </View>
    } />}
  </View>;
}
function MergeReportThumbnail({ report }: { report: SafetyReportSummary }) {
  const styles = useStyles();
  const photos = useReportCardPhotos(report);
  const [failedPhotos, setFailedPhotos] = useState<string[]>([]);
  const photo = photos.find(url => !failedPhotos.includes(url));
  return <View style={styles.thumbnail}>
    {photo ? <Image source={{ uri: photo }} recyclingKey={photo} contentFit="cover" cachePolicy="memory-disk" accessible={false} alt="" onError={() => setFailedPhotos(previous => [...previous, photo])} style={StyleSheet.absoluteFill} /> : <ReportIllustration kind={report.report_kind} size={48} />}
  </View>;
}
const useStyles = createThemedStyles(color => StyleSheet.create({
  previewFooter: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 },
  thumbnail: { width: 60, height: 60, flexShrink: 0, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: color('#E8EDEF', 'surface') },
  container: { gap: 8 },
  list: { maxHeight: 260 },
  search: { minHeight: 46, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: color('#CEDDD6', 'border'), color: color('#243147', 'text') },
  selectRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailsButton: { minHeight: 44, borderRadius: 22, backgroundColor: '#141C24', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  detailsText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  item: { gap: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: color('#DFE3EA', 'border'), backgroundColor: color('#F4F6F7', 'elevated') },
  selected: { borderColor: color('#296957', 'success'), borderWidth: 2 },
  copy: { flex: 1, gap: 4 },
  title: { fontSize: 14, fontWeight: '700', color: color('#243147', 'text') },
  location: { fontSize: 13, color: color('#405066', 'secondary') },
  date: { fontSize: 12, color: color('#737C89', 'muted') },
}));
