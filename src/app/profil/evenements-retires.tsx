import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import { AppScreen } from '@/components/app-screen';
import { PublicationModeration } from '@/components/publication-moderation';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon } from '@/components/ui/app-icon';
import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { Pressable, Text, View } from '@/features/language/native';
import { useRole } from '@/features/moderation/use-role';
import { kindLabels } from '@/features/reports/model';
import type { SafetyReportSummary } from '@/features/safety-report/read';
import { supabase } from '@/lib/supabase';

type SuspendedReport = SafetyReportSummary & { reason: string };

export default function RemovedEventsScreen() {
  const router = useRouter();
  const { canModerate } = useRole();
  const color = useThemeColor();
  const styles = useStyles();
  const [reports, setReports] = useState<SuspendedReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { data, error } = await supabase.rpc('read_suspended_publications');
      if (error) throw error;
      setReports(data ?? []);
    } catch {
      setLoadError('Chargement impossible. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active && canModerate) void reload(); });
    return () => { active = false; };
  }, [canModerate, reload]);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/profil');
  }

  return <AppScreen
    title="Événements retirés"
    headerLeft={<AnimatedPressable accessibilityRole="button" accessibilityLabel="Retour au profil" haptic="selection" onPress={goBack} style={styles.backButton}>
      <AppIcon icon={ChevronLeft} size={22} color={color('#485469', 'secondary')} />
    </AnimatedPressable>}
    contentContainerStyle={styles.screenContent}>
    <View style={styles.content}>
      {canModerate && <Pressable accessibilityRole="button" onPress={() => void reload()} style={styles.refreshButton}>
        <Text style={styles.refreshText}>Actualiser</Text>
      </Pressable>}
      {loading && <ActivityIndicator accessibilityLabel="Chargement des événements retirés" color={color('#E14D3E', 'accent')} />}
      {!!loadError && <Text accessibilityRole="alert" style={styles.error}>{loadError}</Text>}
      {canModerate && !loading && !loadError && reports.length === 0 && <Text style={styles.empty}>Aucun événement retiré.</Text>}
      {canModerate && reports.map(report => <View key={`${report.report_kind}:${report.id}`} style={styles.card}>
        <Text style={styles.kind}>{kindLabels[report.report_kind]}</Text>
        <Text style={styles.location} translate={false}>{report.location_description || report.id}</Text>
        <Text style={styles.reason} translate={false}>{report.reason}</Text>
        <PublicationModeration kind={report.report_kind} reportId={report.id} suspended onDone={() => void reload()} />
      </View>)}
    </View>
  </AppScreen>;
}

const useStyles = createThemedStyles((color) => StyleSheet.create({
  screenContent: { paddingBottom: 132 },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', marginTop: 30, gap: 14 },
  backButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: color('#FFFFFF', 'surface') },
  refreshButton: { alignSelf: 'flex-end', paddingVertical: 10, paddingHorizontal: 14 },
  refreshText: { color: color('#485469', 'secondary'), fontSize: 14, fontWeight: '700' },
  card: { padding: 20, gap: 5, borderRadius: 20, borderWidth: 1, borderColor: color('#E7E8EB', 'border'), backgroundColor: color('#FFFFFF', 'surface') },
  kind: { color: color('#E14D3E', 'accent'), fontSize: 12, fontWeight: '700' },
  location: { color: color('#243147', 'text'), fontSize: 17, fontWeight: '700' },
  reason: { color: color('#485469', 'secondary'), fontSize: 14, lineHeight: 20 },
  empty: { color: color('#768091', 'muted'), textAlign: 'center', paddingVertical: 24 },
  error: { color: color('#BA3540', 'accent'), textAlign: 'center', paddingVertical: 16 },
}));
