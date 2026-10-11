import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { scheduleOnRN } from 'react-native-worklets';
import { Image } from 'expo-image';
import { Modal, StyleSheet, useWindowDimensions, type View as NativeView } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming, withDelay, withRepeat, withSequence, cancelAnimation, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ArrowUpRight from 'lucide-react-native/icons/arrow-up-right';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Clock3 from 'lucide-react-native/icons/clock-3';
import { ScrollView, Text, View } from '@/features/language/native';
import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { reportSelection, type SafetyReportSummary } from '@/features/safety-report/read';
import { useReportLocation } from '@/features/safety-report/use-report-location';
import { useReportCardPhotos } from '@/features/home/use-report-card-photos';
import { reportAge } from '@/features/home/model';
import { accidentSeverity } from '@/features/accident-report/presentation';
import { AnimatedPressable } from './ui/animated-pressable';
import { ReportCardActions, ReportCardActivityContext } from './report-card-actions';
import { ReportLocationPreview } from './report-location-preview';
import { SafetyReportDetailSheet } from './safety-report-detail-sheet';
import { ReportIllustration } from './report-illustration';

const labels: Record<SafetyReportSummary['report_kind'], string> = {
  accident: 'Accident', barricade: 'Route barricadée', breakdown: 'Véhicule en panne', kidnapping: 'Enlèvement', gunfire: 'Tirs entendus', armed_presence: 'Présence d’hommes armés', suspicious_vehicle: 'Véhicule suspect', gathering: 'Rassemblement', fire: 'Incendie',
};
const timing = { duration: 340, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System };
type Origin = { x: number; y: number; width: number; height: number };

export function RecentReportCard({ report, active, loading, canInteract, onRefresh }: {
  report: SafetyReportSummary; active: boolean; loading: boolean; canInteract: () => boolean; onRefresh: () => void; onOpen: (id: string) => void;
}) {
  const styles = useStyles();
  const setCardActive = useContext(ReportCardActivityContext);
  const color = useThemeColor();
  const [detailRevision, setDetailRevision] = useState(0);
  const photos = useReportCardPhotos(report, loading, detailRevision);
  const [failedPhotos, setFailedPhotos] = useState<string[]>([]);
  const photo = photos.find(url => !failedPhotos.includes(url));
  const location = useReportLocation(report);
  const severity = report.report_kind === 'accident' ? accidentSeverity(report) : null;
  const ref = useRef<NativeView>(null);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);
  const targetWidth = Math.min(width - 24, 640);
  const targetHeight = height - insets.top - insets.bottom - 24;
  const age = reportAge(Date.parse(report.last_observed_at || report.created_at));
  useEffect(() => {
    progress.set(withTiming(origin ? 1 : 0, timing));
  }, [origin, progress]);
  const morph = useAnimatedStyle(() => {
    const p = progress.value;
    const start = origin ?? { x: 12, y: 12, width: targetWidth, height: targetHeight };
    return {
      left: start.x + ((width - targetWidth) / 2 - start.x) * p,
      top: start.y + (insets.top + 12 - start.y) * p,
      width: start.width + (targetWidth - start.width) * p,
      height: start.height + (targetHeight - start.height) * p,
    };
  });
  function open() {
    if (!active || !canInteract()) return;
    ref.current?.measureInWindow((x, y, w, h) => { progress.set(0); setOrigin({ x, y, width: w, height: h }); });
  }
  function finishClose() { setOrigin(null); }
  function close() {
    progress.set(withTiming(0, timing, finished => { if (finished) scheduleOnRN(finishClose); }));
  }
  useEffect(() => {
    if (!origin) return;
    setCardActive(true);
    return () => setCardActive(false);
  }, [origin, setCardActive]);
  function content(header: ReactNode, footer: ReactNode, expanded: boolean) {
    return <>
      <View style={[styles.photo, expanded && { flexGrow: 0, flexShrink: 0, height: Math.max(270, Math.min(420, targetHeight * 0.51)) }]}>
        {photo ? <Image recyclingKey={`${report.report_kind}:${report.event_id || report.id}`} source={{ uri: photo, cacheKey: photo.split('?')[0] }} cachePolicy="memory-disk" transition={180} contentFit="cover" onError={() => setFailedPhotos(old => [...old, photo])} style={StyleSheet.absoluteFill} /> : <View pointerEvents="none" style={styles.noPhoto}><View style={styles.orbit} /><ReportIllustration kind={report.report_kind} size={80} /><Text style={styles.fallbackTitle}>{labels[report.report_kind]}</Text></View>}
        <View pointerEvents="none" style={styles.shade} />
        {!expanded && <AnimatedPressable accessibilityRole="button" accessibilityLabel={`Ouvrir : ${labels[report.report_kind]}`} onPress={open} style={StyleSheet.absoluteFill}><View /></AnimatedPressable>}
        <View style={styles.top}>
          {expanded ? <View style={styles.closePlaceholder} /> : <AnimatedPressable accessibilityRole="button" accessibilityLabel="Ouvrir" onPress={open} style={styles.expandButton}><ArrowUpRight size={16} color="#FFFFFF" /><Text numberOfLines={1} style={styles.expandLabel}>Ouvrir</Text></AnimatedPressable>}
          {header}
        </View>
        <View style={styles.photoBottom}>
          {expanded && <View style={styles.photoTitle}><Text style={styles.openTitle}>{labels[report.report_kind]}</Text><Text translate={false} style={styles.openLocation}>{location.label}</Text></View>}
          {footer}
        </View>
      </View>
      <View style={styles.panel}>
        {!expanded ? <View style={styles.summary}>
          <AnimatedPressable accessibilityRole="button" accessibilityLabel="Ouvrir le signalement" onPress={open} style={styles.summaryText}>
            <Text numberOfLines={2} style={styles.title}>{labels[report.report_kind]}</Text>
            <ScrollingAddress key={location.label} address={location.label} active={active && !origin} />
            <View style={styles.age}><Clock3 size={13} color={color('#737D8B', 'muted')} /><Text style={styles.ageText}>{age}</Text></View>
            {severity && <Text numberOfLines={1} style={[styles.badge, { color: severity.color, backgroundColor: severity.tint }]}>{severity.label}</Text>}
          </AnimatedPressable>
          <View style={styles.miniMap}><ReportLocationPreview latitude={report.latitude} longitude={report.longitude} active={active} showAttribution={false} /></View>
        </View> : <>
          <View style={styles.expandedMap}><ReportLocationPreview latitude={report.latitude} longitude={report.longitude} active={active} /></View>
          <SafetyReportDetailSheet key={detailRevision} selection={reportSelection(report)} onClose={close} embedded />
        </>}
      </View>
    </>;
  }
  return <ReportCardActions report={report} onUpdated={() => { setDetailRevision(value => value + 1); onRefresh(); }} canInteract={origin ? undefined : canInteract} overlay>
    {({ header, footer }) => <>
      <View ref={ref} collapsable={false} style={styles.card}>{content(header, footer, false)}</View>
      <Modal visible={!!origin} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
        <View style={styles.backdrop}>
          <Animated.View style={[styles.openCard, morph]} accessibilityViewIsModal>
            <View style={styles.openToolbar}><AnimatedPressable accessibilityRole="button" accessibilityLabel="Fermer le signalement" onPress={close} style={styles.circle}><ArrowLeft size={21} color="#FFFFFF" /></AnimatedPressable></View>
            <ScrollView style={styles.openScroll} bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={styles.openContent}>{origin && content(header, footer, true)}</ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </>}
  </ReportCardActions>;
}
function ScrollingAddress({ address, active }: { address: string; active: boolean }) {
  const styles = useStyles();
  const [viewport, setViewport] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const offset = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    cancelAnimation(offset);
    offset.set(0);
    const distance = Math.max(0, textWidth - viewport);
    if (active && !reducedMotion && viewport > 0 && distance > 0) {
      offset.set(withRepeat(withSequence(
        withDelay(1600, withTiming(-distance, { duration: Math.max(2400, distance * 35), easing: Easing.linear })),
        withDelay(1600, withTiming(0, { duration: Math.max(2400, distance * 35), easing: Easing.linear })),
      ), -1));
    }
    return () => cancelAnimation(offset);
  }, [active, offset, reducedMotion, textWidth, viewport]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  return <ScrollView horizontal scrollEnabled={reducedMotion} showsHorizontalScrollIndicator={false} style={styles.addressViewport} onLayout={event => setViewport(event.nativeEvent.layout.width)}>
    <Animated.View style={animatedStyle}>
      <Text translate={false} numberOfLines={1} onLayout={event => setTextWidth(event.nativeEvent.layout.width)} style={styles.location}>{address}</Text>
    </Animated.View>
  </ScrollView>;
}
const useStyles = createThemedStyles(color => StyleSheet.create({
  card: { aspectRatio: 307 / 361, borderRadius: 28, overflow: 'hidden', borderWidth: 1.5, borderColor: '#FFFFFFCC', backgroundColor: color('#FFFFFF', 'surface'), boxShadow: '0px 12px 28px rgba(45,65,100,0.16)' },
  photo: { flexGrow: 1, flexShrink: 1, backgroundColor: '#274355', justifyContent: 'space-between' },
  noPhoto: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 16, overflow: 'hidden' },
  orbit: { position: 'absolute', width: 320, height: 320, borderRadius: 160, borderWidth: 48, borderColor: '#FFFFFF0B', top: -90, right: -100 },
  fallbackTitle: { color: '#D2E5F5', fontSize: 22, fontWeight: '600', textAlign: 'center', paddingHorizontal: 20 },
  shade: { ...StyleSheet.absoluteFill, backgroundColor: '#08162218' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  openToolbar: { height: 62, paddingHorizontal: 12, justifyContent: 'center' },
  openScroll: { flex: 1 },
  closePlaceholder: { width: 42, height: 42 },
  circle: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#10232DC0', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FFFFFF60' },
  expandButton: { width: 'auto', height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 24, borderWidth: 1, borderColor: '#FFFFFF80', backgroundColor: '#14202B88', flexShrink: 0 },
  expandLabel: { color: '#FFFFFF', fontSize: 10, fontWeight: '600', flexShrink: 1 },
  photoBottom: { paddingHorizontal: 8, paddingBottom: 27 },
  photoTitle: { paddingHorizontal: 6, marginBottom: 16 },
  openTitle: { color: '#FFFFFF', fontWeight: '800', fontSize: 30, textShadowColor: '#00000088', textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 } },
  openLocation: { color: '#FFFFFF', fontSize: 16, marginTop: 4, textShadowColor: '#000000', textShadowRadius: 6 },
  panel: { backgroundColor: color('#FFFFFF', 'surface'), padding: 14, marginTop: -16, borderRadius: 26 },
  summary: { flexDirection: 'row', gap: 10, minHeight: 96 },
  summaryText: { flex: 1, gap: 6, justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', letterSpacing: -0.5, color: color('#19222D', 'text') },
  addressViewport: { flexGrow: 0, overflow: 'hidden' },
  location: { fontSize: 14, color: color('#657080', 'secondary') },
  age: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  ageText: { fontSize: 11, color: color('#737D8B', 'muted'), flexShrink: 1 },
  badge: { alignSelf: 'flex-start', fontSize: 10, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
  expandedMap: { height: 180, marginBottom: 14 },
  miniMap: { width: '32%', minHeight: 96 },
  backdrop: { flex: 1, backgroundColor: color('#EAF0F9F5', 'background') },
  openCard: { position: 'absolute', borderRadius: 30, overflow: 'hidden', backgroundColor: color('#FFFFFF', 'surface') },
  openContent: { flexGrow: 1 },
}));
