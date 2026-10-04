import * as Haptics from 'expo-haptics';
import { AnimatedPressable } from './ui/animated-pressable';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, PanResponder, Platform, StyleSheet } from 'react-native';
import Reanimated, { LinearTransition, ReduceMotion, useReducedMotion } from 'react-native-reanimated';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import { Text, View } from '@/features/language/native';
import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import type { SafetyReportSummary } from '@/features/safety-report/read';
import { stackReportKey } from '@/features/home/report-stack';
import { LatestAccidentCard } from './latest-accident-card';

export function RecentReportStack({ reports, loading, error, onRefresh, onOpen }: {
  reports: SafetyReportSummary[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpen: (id: string) => void;
}) {
  const styles = useStyles();
  const color = useThemeColor();
  const reducedMotion = useReducedMotion();
  const [selected, setSelected] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const busy = useRef(false);
  const gestureUntil = useRef(0);
  const width = useRef(360);
  const [offset] = useState(() => new Animated.Value(0));
  const [cardWidth, setCardWidth] = useState(360);
  const handoff = useRef(false);
  const index = Math.max(0, reports.findIndex(report => stackReportKey(report) === selected));
  // Commit the already mounted incoming card before resetting its translation.
  useLayoutEffect(() => {
    if (!handoff.current) return;
    offset.setValue(0);
    handoff.current = false;
    busy.current = false;
    setMoving(false);
  }, [selected, offset]);
  const canOlder = index < reports.length - 1;
  const canNewer = index > 0;

  const settle = useCallback(() => {
    if (reducedMotion) { offset.setValue(0); busy.current = false; setMoving(false); return; }
    Animated.spring(offset, { toValue: 0, useNativeDriver: true, stiffness: 280, damping: 28, mass: 0.8 }).start(() => {
      busy.current = false;
      setMoving(false);
    });
  }, [offset, reducedMotion]);
  const navigate = useCallback((direction: number) => {
    const next = reports[index + direction];
    if (!next) { settle(); return; }
    busy.current = true;
    setMoving(true);
    if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {});
    Animated.timing(offset, {
      toValue: -direction * cardWidth,
      duration: reducedMotion ? 0 : 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) { settle(); return; }
      handoff.current = true;
      setSelected(stackReportKey(next));
    });
  }, [index, reports, offset, reducedMotion, settle, cardWidth]);
  // PanResponder stores these callbacks; ref reads happen only during gestures.
  // eslint-disable-next-line react-hooks/refs
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) => !busy.current && reports.length > 1 && Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
    // Gesture callbacks run on input, never during render.
    // eslint-disable-next-line react-hooks/purity
    onPanResponderGrant: () => { gestureUntil.current = Date.now() + 1000; busy.current = true; setMoving(true); offset.stopAnimation(); },
    onPanResponderMove: (_, gesture) => {
      const allowed = gesture.dx < 0 ? canOlder : canNewer;
      offset.setValue(gesture.dx * (allowed ? 1 : 0.18));
    },
    onPanResponderRelease: (_, gesture) => {
      // eslint-disable-next-line react-hooks/purity
      gestureUntil.current = Date.now() + 400;
      if (Math.abs(gesture.dx) > width.current * 0.2 || (Math.abs(gesture.dx) > 24 && Math.abs(gesture.vx) > 0.5)) navigate(gesture.dx < 0 ? 1 : -1);
      else settle();
    },
    onPanResponderTerminate: settle,
    onPanResponderTerminationRequest: () => false,
  }), [reports.length, canOlder, canNewer, offset, navigate, settle]);
  return <View style={styles.section}>
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.title}>Signalements récents</Text>
      <AnimatedPressable haptic="none" pressedScale={0.9} accessibilityRole="button" accessibilityLabel="Actualiser les signalements récents" disabled={loading || moving} onPress={onRefresh} style={styles.button}>
        {loading ? <ActivityIndicator size="small" color={color('#737C89', 'muted')} /> : <RefreshCw size={18} color={color('#737C89', 'muted')} />}
      </AnimatedPressable>
    </View>
    <View style={reports.length > 1 && styles.deck} onLayout={event => { width.current = event.nativeEvent.layout.width;
      setCardWidth(previous => Math.abs(previous - event.nativeEvent.layout.width) > 1 ? event.nativeEvent.layout.width : previous); }}>
      {reports.length > 2 && <View pointerEvents="none" aria-hidden style={[styles.backCard, styles.farCard]} />}
      {reports.length > 1 && <Animated.View pointerEvents="none" aria-hidden style={[styles.backCard, { transform: [{ translateX: 1 }, { translateY: 4 }, { rotate: offset.interpolate({ inputRange: [-360, 0, 360], outputRange: ['-0.4deg', '-1.1deg', '-0.4deg'], extrapolate: 'clamp' }) }] }]} />}
      <Reanimated.View {...responder.panHandlers} layout={LinearTransition.duration(220).reduceMotion(ReduceMotion.System)} style={{ overflow: 'hidden', borderRadius: 26, zIndex: 2 }}>
        {reports.length ? reports.map((item, itemIndex) => {
          const distance = itemIndex - index;
          if (Math.abs(distance) > 1) return null;
          const current = distance === 0;
          return <Animated.View key={stackReportKey(item)}
            pointerEvents={current && !moving ? 'auto' : 'none'} aria-hidden={!current}
            style={[
              !current && { position: 'absolute', top: 0, left: 0, right: 0 },
              { opacity: offset.interpolate({
                inputRange: [-(distance + 1) * cardWidth, -distance * cardWidth, -(distance - 1) * cardWidth],
                outputRange: [0, 1, 0], extrapolate: 'clamp',
              }), transform: [{ translateX: Animated.add(offset, distance * cardWidth) }] },
            ]}>
            <LatestAccidentCard canInteract={() => !busy.current && Date.now() > gestureUntil.current} report={item} loading={loading} error={error} onRefresh={onRefresh} onOpen={onOpen} hideHeader />
          </Animated.View>;
        }) : <LatestAccidentCard report={null} loading={loading} error={error} onRefresh={onRefresh} onOpen={onOpen} hideHeader />}
      </Reanimated.View>
    </View>
    {reports.length > 1 && <View style={styles.navigation}>
      <AnimatedPressable haptic="none" pressedScale={0.9} accessibilityRole="button" accessibilityLabel="Signalement plus récent" disabled={!canNewer || moving} onPress={() => { if (!busy.current) navigate(-1); }} style={[styles.button, !canNewer && styles.disabled]}>
        <ChevronLeft size={20} color={color('#49614D', 'secondary')} />
      </AnimatedPressable>
      <Text translate={false} accessibilityLiveRegion="polite" style={styles.counter}>{index + 1} / {reports.length}</Text>
      <AnimatedPressable haptic="none" pressedScale={0.9} accessibilityRole="button" accessibilityLabel="Signalement précédent" disabled={!canOlder || moving} onPress={() => { if (!busy.current) navigate(1); }} style={[styles.button, !canOlder && styles.disabled]}>
        <ChevronRight size={20} color={color('#49614D', 'secondary')} />
      </AnimatedPressable>
    </View>}
  </View>;
}
const useStyles = createThemedStyles(color => StyleSheet.create({
  section: { marginTop: 12, width: '100%', maxWidth: 640, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { color: color('#24262C', 'text'), fontSize: 19, fontWeight: '700', letterSpacing: -0.4 },
  deck: { marginTop: 12, marginHorizontal: 10, marginBottom: 38, transform: [{ translateX: -2.5 }, { translateY: -8 }] },
  backCard: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 1,
    borderRadius: 28,
    backgroundColor: color('#E0ECDD', 'successSoft'),
    borderWidth: 1.5, borderColor: color('#AEC7A6', 'success'),
    borderTopWidth: 4,
    boxShadow: '0px 8px 16px -6px rgba(15, 30, 24, 0.25)',
  },
  farCard: {
    zIndex: 0,
    transform: [{ translateX: 5 }, { translateY: 9 }, { rotate: '1.3deg' }],
    backgroundColor: color('#E0E7FA', 'infoSoft'),
    borderColor: color('#AFBEE4', 'info'),
    boxShadow: '0px 12px 20px -8px rgba(20, 30, 55, 0.25)',
  },
  navigation: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 18, marginTop: 4 },
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  counter: { color: color('#737C89', 'muted'), fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  disabled: { opacity: 0.3 },
}));
