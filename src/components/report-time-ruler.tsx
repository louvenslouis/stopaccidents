import { useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet } from 'react-native';
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

  function tickFeedback() {
    const feedback = Platform.OS === 'android'
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Clock_Tick)
      : Haptics.selectionAsync();
    void feedback.catch(() => {});
  }

  function select(index: number, animate = true) {
    if (disabled || !active) return;
    if (index !== lastIndex.current) tickFeedback();
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
        <Text translate={false} style={styles.time}>{date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</Text>
      </Animated.View>
      <View style={styles.track} onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
        scroll.current?.scrollTo({ x: lastIndex.current * SPACING, animated: false });
      }}>
        <View pointerEvents="none" style={styles.cursor} />
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
            if (index !== lastIndex.current && !disabled && active) {
              tickFeedback();
              lastIndex.current = index;
              onChange(index * REPORT_TIME_STEP_MINUTES);
            }
          }} scrollEventThrottle={16}
          contentContainerStyle={[styles.ruler, { paddingHorizontal: Math.max(0, width / 2 - SPACING / 2) }]}>
          {offsets.map((minutes, index) => {
            const selected = minutes === minutesAgo;
            const radius = Math.max(140, width * 0.55);
            return <Pressable key={minutes} accessibilityRole="radio" accessibilityLabel={minutes === 0 ? t('Maintenant') : `Il y a ${minutes} minutes`}
              accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={() => select(index)} style={styles.notch}>
              <View pointerEvents="none" style={styles.graduations}>
                {[-24, -12, 0, 12, 24].map((delta) => {
                  if ((index === 0 && delta < 0) || (index === REPORT_TIME_STEPS && delta > 0)) return null;
                  const center = index * SPACING + delta;
                  const range = [-1, -0.65, -0.3, 0, 0.3, 0.65, 1].map((distance) => center + distance * radius);
                  const distance = Math.abs(center - minutesAgo / REPORT_TIME_STEP_MINUTES * SPACING) / radius;
                  return <Animated.View key={delta} style={[styles.tick, { left: SPACING / 2 + delta - 1 }, reducedMotion ? {
                    height: 10 + 72 * Math.exp(-4 * distance * distance),
                    opacity: Math.max(0.12, 0.7 * Math.exp(-2 * distance * distance)),
                  } : {
                    height: scrollX.interpolate({ inputRange: range, outputRange: [10, 23, 61, 82, 61, 23, 10], extrapolate: 'clamp' }),
                    opacity: scrollX.interpolate({ inputRange: range, outputRange: [0.12, 0.25, 0.5, 0.7, 0.5, 0.25, 0.12], extrapolate: 'clamp' }),
                  }]} />;
                })}
              </View>
              {(minutes % 30 === 0 || selected) && <Text style={[styles.label, selected && styles.selectedLabel]}>{offsetLabel(minutes)}</Text>}
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
  track: { overflow: 'hidden' },
  cursor: { position: 'absolute', top: 8, height: 106, left: '50%', width: 5, marginLeft: -2.5, backgroundColor: color('#15191D', 'text'), borderRadius: 3, zIndex: 1 },
  ruler: { height: 150, alignItems: 'flex-start' },
  notch: { width: SPACING, height: 150, alignItems: 'center' },
  graduations: { height: 114, width: SPACING },
  tick: { position: 'absolute', bottom: 0, width: 2, borderRadius: 2, backgroundColor: color('#7E8286', 'muted') },
  label: { marginTop: 18, fontSize: 11, fontWeight: '500', color: color('#909498', 'muted') },
  selectedLabel: { color: color('#15191D', 'text'), fontWeight: '800' },
}));
