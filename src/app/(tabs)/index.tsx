import { ReportCardActivityContext } from '@/components/report-card-actions';
import { surfaceDepth } from '@/components/ui/surface-depth';
import { useLanguage } from '@/features/language/language-provider';
import { Text, View } from '@/features/language/native';
import { useAppLocation } from '@/features/location/app-location';
import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { AppScreen } from '@/components/app-screen';
import { RecentReportStack } from '@/components/recent-report-stack';
import { recentReportStack } from '@/features/home/report-stack';
import { HomeSections } from '@/components/home/home-sections';
import { HomeMenu } from '@/components/home/home-menu';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { sharedReportSelection } from '@/features/safety-report/share';
import { SafetyReportDetailSheet } from '@/components/safety-report-detail-sheet';
import { readLatestReport, readMapReports } from '@/features/safety-report/read';
import { useAccident } from '@/features/accident-report/use-accident';
import { ReportSheet } from '@/components/report-sheet';
import type { ReportType } from '@/components/report-type-picker';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon } from '@/components/ui/app-icon';
import Bell from 'lucide-react-native/icons/bell';
import MapPin from 'lucide-react-native/icons/map-pin';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation,
  FadeInUp,
  ReduceMotion,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const REPORT_BUTTON_WIDTH = 154;
const REPORT_FAB_SIZE = 58;
const TAB_BAR_WIDTH = 430;
const WIDE_LAYOUT_BREAKPOINT = 960;
const WIDE_LAYOUT_GAP = 16;

export default function HomeScreen() {
  const { t } = useLanguage();
  const styles = useStyles();
  const themeColor = useThemeColor();
  const { location, locating, error } = useAppLocation();
  const locationLabel = error
    ? error.message === 'L’accès à la position exacte n’est pas autorisé.'
      ? 'Accès à la position refusé'
      : 'Localisation indisponible'
    : location?.location || (location && !locating ? 'Lieu indisponible' : 'Localisation…');

  const router = useRouter();
  const { signalement } = useLocalSearchParams<{ signalement?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const { width: initialWidth } = useWindowDimensions();
  const [webWidth, setWebWidth] = useState(0);
  const [cardActivities, setCardActivities] = useState(0);
  const cardActive = cardActivities > 0;
  const setCardActive = useCallback((active: boolean) => {
    setCardActivities(count => Math.max(0, count + (active ? 1 : -1)));
  }, []);
  const [reportOpen, setReportOpen] = useState(false);
  const [zonesOpen, setZonesOpen] = useState(false);
  const [reportType, setReportType] = useState<ReportType | null>(null);
  const selectedReport = sharedReportSelection(signalement);
  const latestReport = useAccident(readLatestReport, !reportOpen && !selectedReport && !cardActive, 30000);
  const recentReports = useAccident(readMapReports, !reportOpen && !selectedReport && !cardActive, 30000);
  const stackedReports = recentReportStack(latestReport.data, recentReports.data?.reports ?? []);
  const width = Platform.OS === 'web' ? webWidth : initialWidth;
  const isWideLayout = width >= WIDE_LAYOUT_BREAKPOINT;
  const reportButtonRailWidth = isWideLayout
    ? REPORT_BUTTON_WIDTH
    : Math.min(Math.max(width - 40, REPORT_FAB_SIZE), TAB_BAR_WIDTH);
  const reportButtonTravel = (reportButtonRailWidth - REPORT_FAB_SIZE) / 2;
  const reportCollapsed = useSharedValue(false);
  const reportProgress = useSharedValue(0);

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
      const offset = Math.max(0, event.contentOffset.y);
      const collapsed = reportCollapsed.value ? offset > 16 : offset >= 64;
      if (collapsed !== reportCollapsed.value) {
        reportCollapsed.value = collapsed;
        reportProgress.value = withSpring(collapsed ? 1 : 0, {
          damping: 10,
          stiffness: 180,
          mass: 0.8,
          overshootClamping: false,
          reduceMotion: ReduceMotion.System,
        });
      }
    },
  });

  const reportButtonStyle = useAnimatedStyle(() => {
    const progress = reportProgress.value;

    return {
      width: interpolate(progress, [0, 1], [REPORT_BUTTON_WIDTH, REPORT_FAB_SIZE]),
      transform: [
        {
          translateX: interpolate(progress, [0, 1], [0, reportButtonTravel]),
        },
      ],
    };
  });

  const reportIconStyle = useAnimatedStyle(() => {
    const progress = reportProgress.value;

    return {
      left: interpolate(progress, [0, 1], [20, 17]),
    };
  });

  const reportLabelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(reportProgress.value, [0, 0.47], [1, 0], Extrapolation.CLAMP),
    transform: [
      {
        translateX: interpolate(reportProgress.value, [0, 0.75], [0, 10], Extrapolation.CLAMP),
      },
    ],
  }));

  return (
    <ReportCardActivityContext value={setCardActive}>
      <AppScreen
        title="Accueil"
        hideIntro
        contentContainerStyle={styles.homeContent}
        onScroll={handleScroll}
        headerLeft={
          <View style={styles.currentLocation} accessibilityLabel={locationLabel}>
            <AppIcon icon={MapPin} size={20} color={themeColor('#49614D', 'secondary')} />
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              translate={!location?.location || Boolean(error)}
              style={styles.currentLocationText}>
              {locationLabel}
            </Text>
          </View>
        }
        headerRight={
          <View style={styles.headerActions}>
            <AnimatedPressable
              accessibilityLabel="Consulter mes alertes locales"
              accessibilityRole="button"
              onPress={() => setZonesOpen(true)}
              haptic="light"
              hitSlop={4}
              pressedScale={0.9}
              style={styles.headerButton}>
              <AppIcon icon={Bell} size={21} color={themeColor('#49614D', 'secondary')} />
            </AnimatedPressable>
            <HomeMenu />
          </View>
        }
      >
        <RecentReportStack
          reports={stackedReports}
          loading={latestReport.loading || recentReports.loading}
          error={latestReport.error || recentReports.error}
          onRefresh={() => { latestReport.refresh(); recentReports.refresh(); }}
          onOpen={(id) => router.setParams({ signalement: id })}
        />
        <HomeSections
          enabled={!reportOpen && !selectedReport && !cardActive}
          onOpen={(id) => router.setParams({ signalement: id })}
          zonesOpen={zonesOpen}
          onZonesOpen={() => setZonesOpen(true)}
          onZonesClose={() => setZonesOpen(false)}
        />
      </AppScreen>

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
        <Animated.View pointerEvents="box-none" style={styles.reportButtonRail}>
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
                {t('SIGNALER')}
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
      {selectedReport && (
        <SafetyReportDetailSheet
          key={selectedReport}
          selection={selectedReport}
          onClose={() => {
            router.setParams({ signalement: undefined });
          }}
        />
      )}
    </ReportCardActivityContext>
  );
}

const useStyles = createThemedStyles((themeColor) => StyleSheet.create({
  currentLocation: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 46,
  },
  currentLocationText: {
    flexShrink: 1,
    color: themeColor('#29392F', 'text'),
    fontSize: 14,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerButton: {
    ...surfaceDepth(themeColor, 'control'),
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: themeColor('#E0E5D7', 'border'),
    backgroundColor: themeColor('#FFFFFF', 'surface'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeContent: {
    paddingTop: 16,
    width: '100%',
    maxWidth: 688,
    alignSelf: 'center',
    paddingBottom: 208,
  },
  reportButtonPosition: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    alignItems: 'center',
  },
  reportButtonRail: {
    width: '100%',
    maxWidth: 430,
    alignItems: 'center',
  },
  reportButton: {
    ...surfaceDepth(themeColor, 'raised'),
    height: REPORT_FAB_SIZE,
    borderRadius: REPORT_FAB_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: '#E72D2D',
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
}));
