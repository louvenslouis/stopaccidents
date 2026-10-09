import { AnimatedPressable } from './ui/animated-pressable';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Dimensions, Modal, StyleSheet, useWindowDimensions } from 'react-native';
import MessageCircle from 'lucide-react-native/icons/message-circle';
import { ReportCommentsSheet } from './report-comments-sheet';
import MessageSquarePlus from 'lucide-react-native/icons/message-square-plus';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import Flag from 'lucide-react-native/icons/flag';
import Share2 from 'lucide-react-native/icons/share-2';
import X from 'lucide-react-native/icons/x';
import ThumbsUp from 'lucide-react-native/icons/thumbs-up';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReportConfirmation } from '@/features/report-events/use-report-confirmation';
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

export function ReportCardActions({ report, onUpdated, canInteract, children }: {
  report: SafetyReportSummary;
  onUpdated?: () => void;
  canInteract?: () => boolean;
  children?: (parts: { header: ReactNode; footer: ReactNode }) => ReactNode;
}) {
  const setCardActive = useContext(ReportCardActivityContext);
  const styles = useStyles();
  const color = useThemeColor();
  const location = useReportLocation(report);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);
  const menuAnchor = useRef<View>(null);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const confirmation = useReportConfirmation(report);
  const confirmed = confirmation.value?.confirmed ?? false;
  const confirmationDisabled = confirmation.pending || (!!confirmation.value && !confirmation.value.can_confirm && !confirmed);
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', () => setMenu(null));
    return () => subscription.remove();
  }, []);
  function openMenu() {
    if (canInteract && !canInteract()) return;
    menuAnchor.current?.measureInWindow((x, y, anchorWidth, anchorHeight) => {
      const below = y + anchorHeight + 8;
      setMenu({
        left: Math.max(insets.left + 12, Math.min(x + anchorWidth - 205, width - insets.right - 217)),
        top: Math.max(insets.top + 8, below + 106 > height - insets.bottom ? y - 114 : below),
      });
    });
  }
  const [flagging, setFlagging] = useState(false);
  const [sent, setSent] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<ReportShare | null>(null);
  const active = commentsOpen || updating || flagging || !!share || !!menu || confirmation.pending;
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
  const header = <View style={styles.headerActions}>
    <AnimatedPressable haptic="selection" pressedScale={0.9} accessibilityRole="button" accessibilityLabel="Partager ce signalement" onPress={() => {
      if (canInteract && !canInteract()) return;
      setMenu(null); setError(null);
      try { setShare(createReportShare(report, location)); } catch { setError('Impossible de préparer le partage. Réessayez.'); }
    }} style={styles.headerIcon}>
      <Share2 size={19} color="#182C2A" />
    </AnimatedPressable>
    <View ref={menuAnchor} collapsable={false}>
      <AnimatedPressable haptic="selection" pressedScale={0.9} accessibilityRole="button" accessibilityLabel="Options du signalement" accessibilityState={{ expanded: !!menu }} onPress={openMenu} style={styles.headerIcon}>
        <Ellipsis size={23} color="#182C2A" />
      </AnimatedPressable>
    </View>
  </View>;
  const footer = <>
    <View style={styles.actions}>
      <AnimatedPressable haptic="selection" pressedScale={0.97} accessibilityRole="button" accessibilityLabel="Mettre à jour l’info" accessibilityState={{ disabled: !canUpdate }} disabled={!canUpdate}
        onPress={() => { if (canInteract && !canInteract()) return; setMenu(null); setUpdating(true); }} style={[styles.update, !canUpdate && styles.dimmed]}>
        <MessageSquarePlus size={18} color="#FFFFFF" />
        <Text style={styles.updateText}>Mettre à jour</Text>
      </AnimatedPressable>
      <AnimatedPressable haptic="selection" pressedScale={0.94} accessibilityRole="button"
        accessibilityLabel={confirmed ? 'Retirer ma confirmation' : 'Confirmer cette information'}
        accessibilityHint={confirmationDisabled && !confirmation.pending ? 'Vous avez déjà témoigné sur cet événement ou il est clos' : undefined}
        accessibilityState={{ selected: confirmed, busy: confirmation.pending, disabled: confirmationDisabled }} disabled={confirmationDisabled}
        onPress={() => { if (!canInteract || canInteract()) void confirmation.toggle(); }} style={[styles.confirm, confirmed && styles.confirmed, confirmationDisabled && !confirmation.pending && styles.dimmed]}>
        {confirmation.pending ? <ActivityIndicator size="small" color={color('#296957', 'success')} /> : <ThumbsUp size={18} color={color('#296957', 'success')} fill={confirmed ? color('#296957', 'success') : 'none'} />}
        <Text style={styles.confirmText}>{confirmed ? 'Confirmé' : 'Confirmer'}</Text>
        <View style={[styles.count, confirmed && styles.countSelected]}>
          <Text translate={false} style={styles.countText}>{confirmation.value ? (confirmation.value.count > 999 ? '999+' : confirmation.value.count) : '–'}</Text>
        </View>
      </AnimatedPressable>
      <AnimatedPressable haptic="selection" pressedScale={0.94} accessibilityRole="button" accessibilityLabel="Ouvrir les commentaires" onPress={() => { if (canInteract && !canInteract()) return; setMenu(null); setCommentsOpen(true); }} style={styles.comments}>
        <MessageCircle size={21} color={color('#296957', 'success')} />
      </AnimatedPressable>
    </View>
    {(confirmation.error || (error && !flagging)) && <Text accessibilityRole="alert" style={styles.error}>{confirmation.error || error}</Text>}
  </>;
  return <>
    {children ? children({ header, footer }) : <><View style={styles.inlineHeader}>{header}</View>{footer}</>}
    {updating && <TestimonyContext value={report}>
      <ReportSheet visible reportType={report.report_kind} onSelectType={() => {}} onBackToTypes={closeUpdate} onClose={closeUpdate} />
    </TestimonyContext>}
    {commentsOpen && <ReportCommentsSheet report={report} onClose={() => setCommentsOpen(false)} />}
    {share && <ReportShareSheet report={share} onClose={() => setShare(null)} />}
    <Modal visible={flagging || !!menu} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { if (!busy) { setFlagging(false); setMenu(null); } }}>
      {flagging ? <View style={styles.overlay}>
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
      </View> : <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
        <Pressable accessibilityRole="button" accessibilityLabel="Fermer le menu" onPress={() => setMenu(null)} style={StyleSheet.absoluteFill} />
        {menu && <Animated.View entering={FadeIn.duration(120).reduceMotion(ReduceMotion.System)} style={[styles.menu, menu]}>
          <Pressable accessibilityRole="button" onPress={() => { setMenu(null); setFlagging(true); setSent(false); setError(null); setReason(''); }} style={styles.menuItem}>
            <Flag size={18} color={color('#C43F32', 'accent')} /><Text style={styles.menuText}>Signaler</Text>
          </Pressable>
          <View accessibilityState={{ disabled: true }} style={[styles.menuItem, styles.dimmed]}>
            <Ellipsis size={18} color={color('#737C89', 'muted')} /><Text style={styles.soon}>Autres · bientôt</Text>
          </View>
        </Animated.View>}
      </View>}
    </Modal>
  </>;
}
const useStyles = createThemedStyles(color => StyleSheet.create({
  inlineHeader: { alignItems: 'flex-end', marginTop: 12 },
  headerActions: { flexDirection: 'row', gap: 6 },
  headerIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#FFFFFF80', borderWidth: 1, borderColor: '#FFFFFF65', alignItems: 'center', justifyContent: 'center' },
  confirm: { flex: 1, minHeight: 46, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: color('#EDF3E9', 'elevated'), borderWidth: 1, borderColor: color('#D7E3D1', 'border') },
  confirmed: { backgroundColor: color('#DCEED8', 'successSoft'), borderColor: color('#98BD90', 'success') },
  confirmText: { fontSize: 13, fontWeight: '700', color: color('#296957', 'success'), flexShrink: 1 },
  count: { minWidth: 23, paddingHorizontal: 5, height: 23, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: color('#FFFFFF', 'surface') },
  countSelected: { backgroundColor: color('#F2FAEF', 'surface') },
  countText: { fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'], color: color('#296957', 'success') },
  comments: { width: 46, minHeight: 46, borderRadius: 16, borderWidth: 1, borderColor: color('#D7E3D1', 'border'), backgroundColor: color('#EDF3E9', 'elevated'), justifyContent: 'center', alignItems: 'center' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 16, alignItems: 'center' },
  update: { flex: 1, minHeight: 46, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 12, backgroundColor: '#296957', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  updateText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', flexShrink: 1 },
  icon: { width: 46, height: 46, borderRadius: 16, backgroundColor: color('#EEF2FB', 'elevated'), alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.5 },
  menu: { position: 'absolute', width: 205, shadowColor: '#10231C', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 20, elevation: 12, padding: 6, borderWidth: 1, borderColor: color('#E1E7EE', 'border'), borderRadius: 18, backgroundColor: color('#FFFFFF', 'surface') },
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
