import { useState, type ReactNode } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, type SharedValue } from 'react-native-reanimated';
import { Text, View } from '@/features/language/native';
import { createThemedStyles } from '@/features/appearance/theme-provider';
import type { SafetyReportSummary } from '@/features/safety-report/read';
import { stackReportKey } from '@/features/home/report-stack';
import { useReportStackGesture } from '@/features/home/use-report-stack-gesture';
import { reportDeckTransform } from '@/features/home/report-deck-transform';
import { LatestAccidentCard } from './latest-accident-card';
import { RecentReportCard } from './recent-report-card';

function StackCard({ index, current, position, width, children }: {
  index: number; current: boolean; position: SharedValue<number>; width: SharedValue<number>; children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const animatedStyle = useAnimatedStyle(() => {
    const frame = reportDeckTransform(index - position.value, width.value);
    return {
      zIndex: 100 - index,
      opacity: frame.opacity,
      transform: [{ translateX: frame.x }, { translateY: frame.y }, { rotate: `${reducedMotion ? 0 : frame.rotation}deg` }, { scale: frame.scale }],
    };
  });
  return <Animated.View pointerEvents={current ? 'auto' : 'none'} aria-hidden={!current} {...(Platform.OS !== 'web' ? { accessibilityElementsHidden: !current, importantForAccessibility: current ? 'auto' as const : 'no-hide-descendants' as const } : { inert: !current })}
    style={[!current && StyleSheet.absoluteFill, animatedStyle]}>{children}</Animated.View>;
}
export function RecentReportStack({ reports, loading, error, onRefresh, onOpen }: {
  reports: SafetyReportSummary[]; loading: boolean; error: string | null; onRefresh: () => void; onOpen: (id: string) => void;
}) {
  const styles = useStyles();
  const [selected, setSelected] = useState<string | null>(null);
  const keys = reports.map(stackReportKey);
  const index = Math.max(0, keys.indexOf(selected ?? ''));
  const { gesture, position, width, canInteract } = useReportStackGesture(keys, index, setSelected);
  return <View style={styles.section}>
    {reports.length ? <>
      <View style={styles.stage}>
        <View pointerEvents="none" style={styles.glow} />
        <GestureDetector gesture={gesture} touchAction="pan-y">
          <Animated.View collapsable={false} style={styles.deck} onLayout={({ nativeEvent }) => { width.value = Math.max(1, nativeEvent.layout.width); }}>
            {reports.map((item, itemIndex) => itemIndex >= index - 1 && itemIndex <= index + 2 && <StackCard key={stackReportKey(item)} index={itemIndex} current={itemIndex === index} position={position} width={width}>
              <RecentReportCard report={item} active={itemIndex === index} loading={loading} canInteract={canInteract} onRefresh={onRefresh} onOpen={onOpen} />
            </StackCard>)}
          </Animated.View>
        </GestureDetector>
      </View>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </> : <LatestAccidentCard report={null} loading={loading} error={error} onRefresh={onRefresh} onOpen={onOpen} hideHeader />}
  </View>;
}
const useStyles = createThemedStyles(color => StyleSheet.create({
  section: { marginTop: 8, width: '100%', maxWidth: 640, alignSelf: 'center' },
  stage: { paddingTop: 8, paddingBottom: 36, overflow: 'hidden' },
  deck: { marginHorizontal: 24 },
  glow: { position: 'absolute', left: '5%', right: '5%', top: 40, bottom: 12, borderRadius: 90, backgroundColor: color('#E4EAF8', 'elevated') },
  error: { color: color('#A53930', 'accent'), fontSize: 12, marginTop: 8 },
}));
