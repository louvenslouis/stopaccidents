import { AppScreen } from '@/components/app-screen';
import { ReportSheet } from '@/components/report-sheet';
import type { ReportType } from '@/components/report-type-picker';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon } from '@/components/ui/app-icon';
import Bell from 'lucide-react-native/icons/bell';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation,
  FadeInUp,
  ReduceMotion,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const REPORT_BUTTON_WIDTH = 154;
const REPORT_FAB_SIZE = 58;
const TAB_BAR_WIDTH = 430;
const WIDE_LAYOUT_BREAKPOINT = 960;
const WIDE_LAYOUT_GAP = 16;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width: initialWidth } = useWindowDimensions();
  const [webWidth, setWebWidth] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportType, setReportType] = useState<ReportType | null>(null);
  const width = Platform.OS === 'web' ? webWidth : initialWidth;
  const isWideLayout = width >= WIDE_LAYOUT_BREAKPOINT;
  const scrollY = useSharedValue(0);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    const updateWebWidth = () => setWebWidth(window.innerWidth);

    updateWebWidth();
    window.addEventListener('resize', updateWebWidth);

    return () => window.removeEventListener('resize', updateWebWidth);
  }, []);

  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = Math.max(0, event.contentOffset.y);
    },
  });

  const reportButtonStyle = useAnimatedStyle(() => {
    const progress = interpolate(scrollY.value, [0, 64], [0, 1], Extrapolation.CLAMP);

    return {
      width: interpolate(progress, [0, 1], [REPORT_BUTTON_WIDTH, REPORT_FAB_SIZE]),
      borderRadius: interpolate(progress, [0, 1], [20, REPORT_FAB_SIZE / 2]),
    };
  });

  const reportIconStyle = useAnimatedStyle(() => {
    const progress = interpolate(scrollY.value, [0, 64], [0, 1], Extrapolation.CLAMP);

    return {
      left: interpolate(progress, [0, 1], [20, 17]),
    };
  });

  const reportLabelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 30], [1, 0], Extrapolation.CLAMP),
    transform: [
      {
        translateX: interpolate(scrollY.value, [0, 48], [0, 10], Extrapolation.CLAMP),
      },
    ],
  }));

  return (
    <>
      <AppScreen
        eyebrow="STOP ACCIDENTS"
        title="Accueil"
        description="Votre espace de prévention et de sécurité routière."
        contentContainerStyle={styles.homeContent}
        onScroll={handleScroll}
        headerRight={
          <AnimatedPressable
            accessibilityLabel="Notifications"
            accessibilityRole="button"
            haptic="light"
            hitSlop={8}
            pressedScale={0.9}
            style={styles.notificationButton}>
            <AppIcon icon={Bell} size={23} color="#9F9F9F" />
          </AnimatedPressable>
        }
      />

      <Animated.View
        entering={FadeInUp.delay(180).duration(360).reduceMotion(ReduceMotion.System)}
        pointerEvents="box-none"
        style={[
          styles.reportButtonPosition,
          isWideLayout
            ? {
                bottom: Math.max(insets.bottom, 12) + 13,
                left: width / 2 + TAB_BAR_WIDTH / 2 + WIDE_LAYOUT_GAP,
                width: REPORT_BUTTON_WIDTH,
              }
            : {
                bottom: Math.max(insets.bottom, 12) + 88,
                left: 20,
                right: 20,
              },
        ]}>
        <Animated.View
          pointerEvents="box-none"
          style={[styles.reportButtonRail, isWideLayout && styles.reportButtonRailWide]}>
          <Animated.View style={[styles.reportButton, reportButtonStyle]}>
            <AnimatedPressable
              accessibilityHint="Choisir le type de signalement"
              accessibilityLabel="SIGNALER"
              accessibilityRole="button"
              haptic="warning"
              onPress={() => {
                setReportType(null);
                setReportOpen(true);
              }}
              pressedOpacity={0.9}
              pressedScale={0.97}
              style={styles.reportButtonPressable}>
              <Animated.View style={[styles.reportIcon, reportIconStyle]}>
                <AppIcon
                  icon={TriangleAlert}
                  size={24}
                  color="#FFFFFF"
                  strokeWidth={2.5}
                />
              </Animated.View>
              <Animated.Text numberOfLines={1} style={[styles.reportLabel, reportLabelStyle]}>
                SIGNALER
              </Animated.Text>
            </AnimatedPressable>
          </Animated.View>
        </Animated.View>
      </Animated.View>
      <ReportSheet
        visible={reportOpen}
        reportType={reportType}
        onSelectType={setReportType}
        onBackToTypes={() => setReportType(null)}
        onClose={() => setReportOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  notificationButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: '#9F9F9F',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeContent: {
    minHeight: '115%',
  },
  reportButtonPosition: {
    position: 'absolute',
    alignItems: 'center',
  },
  reportButtonRail: {
    width: '100%',
    maxWidth: 430,
    alignItems: 'flex-end',
  },
  reportButtonRailWide: {
    alignItems: 'flex-start',
  },
  reportButton: {
    height: REPORT_FAB_SIZE,
    overflow: 'hidden',
    backgroundColor: '#E72D2D',
    shadowColor: '#8A1111',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 10,
  },
  reportButtonPressable: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
  },
  reportIcon: {
    position: 'absolute',
    width: 24,
    height: 24,
    top: 17,
  },
  reportLabel: {
    position: 'absolute',
    left: 56,
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
