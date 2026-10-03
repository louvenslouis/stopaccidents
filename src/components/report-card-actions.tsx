import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet } from 'react-native';
import MessageSquarePlus from 'lucide-react-native/icons/message-square-plus';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import Flag from 'lucide-react-native/icons/flag';
import Share2 from 'lucide-react-native/icons/share-2';
import X from 'lucide-react-native/icons/x';
import { Pressable, Text, TextInput, View } from '@/features/language/native';
import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { type SafetyReportSummary } from '@/features/safety-report/read';
import { useReportLocation } from '@/features/safety-report/use-report-location';
import { createReportShare, type ReportShare } from '@/features/safety-report/share';
import { ensureReporter } from '@/features/report-events/api';
import { TestimonyContext } from '@/features/report-events/testimony-context';
import { supabase } from '@/lib/supabase';
import { ReportSheet } from './report-sheet';
import { ReportShareSheet } from './report-share-sheet';

export const ReportCardActivityContext = createContext<(active: boolean) => void>(() => {});

export function ReportCardActions({ report, onUpdated }: { report: SafetyReportSummary; onUpdated?: () => void }) {
  const setCardActive = useContext(ReportCardActivityContext);
  const styles = useStyles();
  const color = useThemeColor();
  const location = useReportLocation(report);
  const [updating, setUpdating] = useState(false);
  const [menu, setMenu] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [sent, setSent] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<ReportShare | null>(null);
  const active = updating || flagging || !!share || menu;
  useEffect(() => {
    if (!active) return;
    setCardActive(true);
    return () => setCardActive(false);
  }, [active, setCardActive]);
  const canUpdate = report.latitude !== null && report.longitude !== null;
  const closeUpdate = () => { setUpdating(false); onUpdated?.(); };
  async function flag() {
    if (sending.current || reason.trim().length < 3) return;
    sending.current = true; setBusy(true); setError(null);
    try {
      await ensureReporter();
      const result = await supabase.rpc('flag_publication', { p_kind: report.report_kind, p_report_id: report.id, p_reason: reason.trim() });
      if (result.error) throw result.error;
      setSent(true);
    } catch { setError('Envoi impossible. Réessayez.'); }
    finally { sending.current = false; setBusy(false); }
  }
  return <>
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel="Mettre à jour l’info" accessibilityState={{ disabled: !canUpdate }} disabled={!canUpdate}
        onPress={() => { setMenu(false); setUpdating(true); }} style={({ pressed }) => [styles.update, (pressed || !canUpdate) && styles.dimmed]}>
        <MessageSquarePlus size={18} color="#FFFFFF" />
        <Text style={styles.updateText}>Mettre à jour l’info</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Partager ce signalement" onPress={() => {
        setMenu(false); setError(null);
        try { setShare(createReportShare(report, location)); } catch { setError('Impossible de préparer le partage. Réessayez.'); }
      }} style={({ pressed }) => [styles.icon, pressed && styles.dimmed]}>
        <Share2 size={19} color={color('#315AC4', 'info')} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Options du signalement" accessibilityState={{ expanded: menu }} onPress={() => setMenu(!menu)} style={styles.icon}>
        <Ellipsis size={23} color={color('#405066', 'secondary')} />
      </Pressable>
    </View>
    {menu && <View style={styles.menu}>
      <Pressable accessibilityRole="button" onPress={() => { setMenu(false); setFlagging(true); setSent(false); setError(null); setReason(''); }} style={styles.menuItem}>
        <Flag size={18} color={color('#C43F32', 'accent')} /><Text style={styles.menuText}>Signaler</Text>
      </Pressable>
      <View accessibilityState={{ disabled: true }} style={[styles.menuItem, styles.dimmed]}>
        <Ellipsis size={18} color={color('#737C89', 'muted')} /><Text style={styles.soon}>Autres · bientôt</Text>
      </View>
    </View>}
    {error && !flagging && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {updating && <TestimonyContext value={report}>
      <ReportSheet visible reportType={report.report_kind} onSelectType={() => {}} onBackToTypes={closeUpdate} onClose={closeUpdate} />
    </TestimonyContext>}
    {share && <ReportShareSheet report={share} onClose={() => setShare(null)} />}
    <Modal visible={flagging} transparent animationType="fade" onRequestClose={() => { if (!busy) setFlagging(false); }}>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="Fermer" accessibilityRole="button" disabled={busy} onPress={() => setFlagging(false)} style={StyleSheet.absoluteFill} />
        <View style={styles.dialog} accessibilityViewIsModal>
          <View style={styles.dialogHeader}>
            <Text accessibilityRole="header" style={styles.title}>{sent ? 'Signalement envoyé' : 'Signaler ce contenu'}</Text>
            <Pressable accessibilityLabel="Fermer" accessibilityRole="button" disabled={busy} onPress={() => setFlagging(false)} style={styles.icon}><X size={20} color={color('#405066', 'secondary')} /></Pressable>
          </View>
          {!sent && <>
            <TextInput accessibilityLabel="Motif du signalement" placeholder="Motif du signalement" placeholderTextColor={color('#737C89', 'muted')} value={reason} onChangeText={setReason} maxLength={500} multiline editable={!busy} style={styles.input} />
            {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            <Pressable accessibilityRole="button" disabled={busy || reason.trim().length < 3} onPress={() => void flag()} style={[styles.update, (busy || reason.trim().length < 3) && styles.dimmed]}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.updateText}>Envoyer</Text>}
            </Pressable>
          </>}
        </View>
      </View>
    </Modal>
  </>;
}
const useStyles = createThemedStyles(color => StyleSheet.create({
  actions: { flexDirection: 'row', gap: 8, marginTop: 16, alignItems: 'center' },
  update: { flexGrow: 1, flexShrink: 1, minHeight: 46, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 12, backgroundColor: '#296957', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  updateText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', flexShrink: 1 },
  icon: { width: 46, height: 46, borderRadius: 16, backgroundColor: color('#EEF2FB', 'elevated'), alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.5 },
  menu: { alignSelf: 'flex-end', width: 205, marginTop: 8, padding: 6, borderWidth: 1, borderColor: color('#E1E7EE', 'border'), borderRadius: 18, backgroundColor: color('#FFFFFF', 'surface') },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46, paddingHorizontal: 12 },
  menuText: { color: color('#C43F32', 'accent'), fontWeight: '600', fontSize: 14 },
  soon: { color: color('#737C89', 'muted'), fontSize: 13 },
  error: { color: color('#C43F32', 'accent'), fontSize: 13, marginTop: 8 },
  overlay: { flex: 1, backgroundColor: '#101C2E88', justifyContent: 'center', alignItems: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 420, padding: 22, borderRadius: 26, gap: 18, backgroundColor: color('#FFFFFF', 'surface') },
  dialogHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: color('#243147', 'text') },
  input: { minHeight: 120, textAlignVertical: 'top', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: color('#DFE3EA', 'border'), color: color('#243147', 'text'), fontSize: 15 },
}));
