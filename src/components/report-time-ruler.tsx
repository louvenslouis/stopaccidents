import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet } from 'react-native';
import { Pressable, ScrollView, Text, View } from '@/features/language/native';
import { createThemedStyles } from '@/features/appearance/theme-provider';
import { useLanguage } from '@/features/language/language-provider';
import {
  REPORT_TIME_STEP_MINUTES, REPORT_TIME_STEPS, reportTimeAt, reportTimeIndex,
} from '@/features/report-events/context';

const SPACING = 64;
const offsets = Array.from({ length: REPORT_TIME_STEPS + 1 }, (_, index) => index * REPORT_TIME_STEP_MINUTES);
function offsetLabel(minutes: number) {
  if (minutes === 0) return 'Maintenant';
  if (minutes < 60) return `−${minutes} min`;
  return `−${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60}` : ''}`;
}

export function ReportTimeRuler({ minutesAgo, onChange, disabled, active }: {
  minutesAgo: number; onChange: (minutes: number) => void; disabled: boolean; active: boolean;
}) {
  const styles = useStyles();
  const { language, t } = useLanguage();
  const [now, setNow] = useState(Date.now);
  const [width, setWidth] = useState(300);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [scrollX] = useState(() => new Animated.Value(minutesAgo / 15 * SPACING));
  const [pulse] = useState(() => new Animated.Value(1));
  const scroll = useRef<ScrollView>(null);
  const lastIndex = useRef(minutesAgo / 15);
  const programmaticTarget = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (mounted) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  useEffect(() => {
    if (reducedMotion) return;
    pulse.setValue(0);
    const animation = Animated.timing(pulse, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [minutesAgo, pulse, reducedMotion]);

  function select(index: number, animate = true) {
    if (disabled) return;
    lastIndex.current = index;
    programmaticTarget.current = index * SPACING;
    onChange(index * REPORT_TIME_STEP_MINUTES);
    scroll.current?.scrollTo({ x: index * SPACING, animated: animate && !reducedMotion });
  }
  const date = new Date(reportTimeAt(minutesAgo, now));
  const locale = language === 'ht' ? 'fr-HT' : 'fr-FR';
  return (
    <View style={styles.container}>
      <Animated.View style={[styles.timestamp, !reducedMotion && {
        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] }),
        transform: [{ translateY: pulse.interpolate({ inputRange: [0, 1], outputRange: [5, 0] }) }],
      }]}>
        <Text translate={false} style={styles.date}>{date.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
        <Text translate={false} style={styles.time}>{date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</Text>
      </Animated.View>
      <View style={styles.track} onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
        scroll.current?.scrollTo({ x: lastIndex.current * SPACING, animated: false });
      }}>
        <View pointerEvents="none" style={styles.cursor}><View style={styles.cursorDot} /></View>
        <ScrollView ref={scroll} horizontal bounces={false} overScrollMode="never" decelerationRate="fast"
          snapToInterval={SPACING} showsHorizontalScrollIndicator={false} scrollEnabled={!disabled}
          onContentSizeChange={() => scroll.current?.scrollTo({ x: lastIndex.current * SPACING, animated: false })}
          onScrollBeginDrag={() => { programmaticTarget.current = null; }}
          onScroll={(event) => {
            const x = event.nativeEvent.contentOffset.x;
            scrollX.setValue(x);
            if (programmaticTarget.current !== null) {
              if (Math.abs(x - programmaticTarget.current) < 1) programmaticTarget.current = null;
              return;
            }
            const index = reportTimeIndex(x, SPACING);
            if (index !== lastIndex.current && !disabled) {
              lastIndex.current = index;
              onChange(index * REPORT_TIME_STEP_MINUTES);
            }
          }} scrollEventThrottle={16}
          contentContainerStyle={[styles.ruler, { paddingHorizontal: Math.max(0, width / 2 - SPACING / 2) }]}>
          {offsets.map((minutes, index) => {
            const range = [(index - 1) * SPACING, index * SPACING, (index + 1) * SPACING];
            const selected = minutes === minutesAgo;
            return <Pressable key={minutes} accessibilityRole="radio" accessibilityLabel={minutes === 0 ? t('Maintenant') : `Il y a ${minutes} minutes`}
              accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={() => select(index)} style={styles.notch}>
              <Animated.View style={[styles.tick, minutes % 60 === 0 && styles.hourTick, selected && styles.activeTick, !reducedMotion && {
                opacity: scrollX.interpolate({ inputRange: range, outputRange: [0.4, 1, 0.4], extrapolate: 'clamp' }),
                transform: [{ scaleY: scrollX.interpolate({ inputRange: range, outputRange: [0.8, 1.2, 0.8], extrapolate: 'clamp' }) }],
              }]} />
              <Text style={[styles.label, selected && styles.selectedLabel]}>{offsetLabel(minutes)}</Text>
            </Pressable>;
          })}
        </ScrollView>
      </View>
    </View>
  );
}
const useStyles = createThemedStyles((color) => StyleSheet.create({
  container: { gap: 24 }, timestamp: { alignItems: 'center', gap: 5 },
  date: { fontSize: 15, fontWeight: '600', color: color('#697687', 'muted') },
  time: { fontSize: 46, lineHeight: 54, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -1.5, color: color('#267E70', 'success') },
  track: { overflow: 'hidden', borderRadius: 22, backgroundColor: color('#F1F6F4', 'elevated') },
  cursor: { position: 'absolute', top: 12, height: 59, left: '50%', width: 2, marginLeft: -1, backgroundColor: color('#267E70', 'success'), borderRadius: 2, zIndex: 1 },
  cursorDot: { position: 'absolute', top: -3, left: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: color('#267E70', 'success') },
  ruler: { height: 114, alignItems: 'flex-start' }, notch: { width: SPACING, height: 114, alignItems: 'center', paddingTop: 24, justifyContent: 'flex-start' },
  tick: { width: 2, height: 30, marginTop: 8, marginBottom: 19, borderRadius: 2, backgroundColor: color('#8EAAA1', 'muted') },
  hourTick: { height: 42, marginTop: 2, marginBottom: 13 }, activeTick: { width: 3, backgroundColor: color('#267E70', 'success') },
  label: { fontSize: 10, fontWeight: '600', color: color('#697687', 'muted') }, selectedLabel: { color: color('#267E70', 'success'), fontWeight: '800' },
}));
