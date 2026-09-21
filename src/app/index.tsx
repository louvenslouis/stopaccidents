import { AppScreen } from '@/components/app-screen';
import { SymbolView } from 'expo-symbols';
import { Alert, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const REPORT_BUTTON_WIDTH = 224;
const REPORT_FAB_SIZE = 58;
const TAB_BAR_WIDTH = 430;
const WIDE_LAYOUT_BREAKPOINT = 960;
const WIDE_LAYOUT_GAP = 16;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWideLayout = width >= WIDE_LAYOUT_BREAKPOINT;
  const scrollY = useSharedValue(0);

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
          <Pressable
            accessibilityLabel="Notifications"
            accessibilityRole="button"
            hitSlop={8}
            style={({ pressed }) => [styles.notificationButton, pressed && styles.buttonPressed]}>
            <SymbolView
              name={{ ios: 'bell', android: 'notifications', web: 'notifications' }}
              size={23}
              tintColor="#9F9F9F"
            />
          </Pressable>
        }
      />

      <Animated.View
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
            <Pressable
              accessibilityHint="Ouvre le signalement d'un accident"
              accessibilityLabel="Signaler un accident"
              accessibilityRole="button"
              onPress={() =>
                Alert.alert('Signaler un accident', 'Le formulaire sera bientôt disponible.')
              }
              style={({ pressed }) => [
                styles.reportButtonPressable,
                pressed && styles.buttonPressed,
              ]}>
              <Animated.View style={[styles.reportIcon, reportIconStyle]}>
                <SymbolView
                  name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }}
                  size={24}
                  tintColor="#FFFFFF"
                  weight="semibold"
                />
              </Animated.View>
              <Animated.Text numberOfLines={1} style={[styles.reportLabel, reportLabelStyle]}>
                Signaler un Accident
              </Animated.Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      </Animated.View>
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
  buttonPressed: {
    opacity: 0.65,
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
