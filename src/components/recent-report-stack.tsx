import { useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { LinearTransition, ReduceMotion, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { View } from '@/features/language/native';
import { createThemedStyles } from '@/features/appearance/theme-provider';
import type { SafetyReportSummary } from '@/features/safety-report/read';
import { stackReportKey } from '@/features/home/report-stack';
import { useReportStackGesture } from '@/features/home/use-report-stack-gesture';
import { LatestAccidentCard } from './latest-accident-card';

function StackCard({ index, current, position, width, children }: {
  index: number;
  current: boolean;
  position: SharedValue<number>;
  width: SharedValue<number>;
  children: ReactNode;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    // Absolute page coordinates survive the React selection commit unchanged.
    transform: [{ translateX: (index - position.value) * width.value }],
  }));
  return <Animated.View
    pointerEvents={current ? 'auto' : 'none'} aria-hidden={!current}
    style={[!current && { position: 'absolute', top: 0, left: 0, right: 0 }, animatedStyle]}>
    {children}
  </Animated.View>;
}

export function RecentReportStack({ reports, loading, error, onRefresh, onOpen }: {
  reports: SafetyReportSummary[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpen: (id: string) => void;
}) {
  const styles = useStyles();
  const [selected, setSelected] = useState<string | null>(null);
  const keys = reports.map(stackReportKey);
  const index = Math.max(0, keys.indexOf(selected ?? ''));
  const { gesture, position, width, canInteract } = useReportStackGesture(keys, index, setSelected);
  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: 1 }, { translateY: 4 },
      { rotate: `${-1.1 + Math.abs(position.value - Math.round(position.value)) * 1.4}deg` },
    ],
  }));

  return <View style={styles.section}>
    <View style={reports.length > 1 && styles.deck} onLayout={({ nativeEvent }) => {
      width.value = Math.max(1, nativeEvent.layout.width);
    }}>
      {reports.length > 2 && <View pointerEvents="none" aria-hidden style={[styles.backCard, styles.farCard]} />}
      {reports.length > 1 && <Animated.View pointerEvents="none" aria-hidden style={[styles.backCard, backStyle]} />}
      <GestureDetector gesture={gesture} touchAction="pan-y">
        <Animated.View collapsable={false} layout={LinearTransition.duration(220).reduceMotion(ReduceMotion.System)} style={styles.viewport}>
          {reports.length ? reports.map((item, itemIndex) => Math.abs(itemIndex - index) <= 1 && (
            <StackCard key={stackReportKey(item)} index={itemIndex} current={itemIndex === index} position={position} width={width}>
              <LatestAccidentCard canInteract={canInteract} report={item} loading={loading} error={error} onRefresh={onRefresh} onOpen={onOpen} hideHeader />
            </StackCard>
          )) : <LatestAccidentCard report={null} loading={loading} error={error} onRefresh={onRefresh} onOpen={onOpen} hideHeader />}
        </Animated.View>
      </GestureDetector>
    </View>
  </View>;
}
const useStyles = createThemedStyles(color => StyleSheet.create({
  section: { marginTop: 16, width: '100%', maxWidth: 640, alignSelf: 'center' },
  viewport: { overflow: 'hidden', borderRadius: 26, zIndex: 2 },
  deck: { marginTop: 8, marginHorizontal: 10, marginBottom: 12, transform: [{ translateX: -2.5 }, { translateY: -8 }] },
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
}));
