import { Text, View } from '@/features/language/native';
import { BlurTargetView } from 'expo-blur';
import { usePathname } from 'expo-router';
import {
  TabList,
  TabSlot,
  Tabs,
  TabTrigger,
  type TabListProps,
  type TabTriggerSlotProps,
} from 'expo-router/ui';
import ClipboardList from 'lucide-react-native/icons/clipboard-list';
import House from 'lucide-react-native/icons/house';
import Map from 'lucide-react-native/icons/map';
import UsersRound from 'lucide-react-native/icons/users-round';
import { useEffect, useRef, useState, type Ref, type RefObject } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  withTiming,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabContrastProvider, useTabContrastColor, useTabContrastControls } from '@/features/navigation/tab-contrast-provider';
import { AppIcon, type AppIconComponent } from '@/components/ui/app-icon';
import { FloatingGlass } from './ui/floating-glass';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';

type TabButtonProps = TabTriggerSlotProps & {
  label: string;
  contrastIndex: number;
  icon: AppIconComponent;
  ref?: Ref<View>;
};

function FadingTabIcon({ icon, color, focused }: { icon: AppIconComponent; color: string; focused?: boolean }) {
  const [transition, setTransition] = useState({ from: color, to: color });
  const progress = useSharedValue(1);
  if (color !== transition.to) {
    setTransition({ from: transition.to, to: color });
  }
  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: 180, reduceMotion: ReduceMotion.System });
  }, [color, progress]);
  const outgoing = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const incoming = useAnimatedStyle(() => ({ opacity: progress.value }));
  return <View style={{ width: 23, height: 23 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Animated.View style={[StyleSheet.absoluteFill, outgoing]}>
      <AppIcon icon={icon} size={23} color={transition.from} strokeWidth={focused ? 2.5 : 2} />
    </Animated.View>
    <Animated.View style={[StyleSheet.absoluteFill, incoming]}>
      <AppIcon icon={icon} size={23} color={transition.to} strokeWidth={focused ? 2.5 : 2} />
    </Animated.View>
  </View>;
}

const AnimatedLabel = Animated.createAnimatedComponent(Text);

function TabButton({ icon, isFocused, label, contrastIndex, ...props }: TabButtonProps) {
  const styles = useStyles();
  const themeColor = useThemeColor();
  const adaptiveColor = useTabContrastColor(contrastIndex);
  const color = isFocused ? themeColor('#FF5A45', 'accent') : adaptiveColor ?? themeColor('#59616B', 'text');
  const foreground = useSharedValue(color);
  useEffect(() => {
    foreground.value = withTiming(color, { duration: 180, reduceMotion: ReduceMotion.System });
  }, [color, foreground]);
  const labelStyle = useAnimatedStyle(() => ({ color: foreground.value }));
  const focusProgress = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    focusProgress.value = withSpring(isFocused ? 1 : 0, {
      damping: 18,
      mass: 0.7,
      reduceMotion: ReduceMotion.System,
      stiffness: 260,
    });
  }, [focusProgress, isFocused]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -focusProgress.value },
      { scale: 1 + focusProgress.value * 0.08 },
    ],
  }));

  return (
    <AnimatedPressable
      {...props}
      accessibilityLabel={label}
      haptic="selection"
      pressedScale={0.93}
      style={styles.tabButton}>
      <Animated.View style={iconStyle}>
        <FadingTabIcon icon={icon} color={color} focused={isFocused} />
      </Animated.View>
      <AnimatedLabel style={[styles.tabLabel, labelStyle]}>{label}</AnimatedLabel>
    </AnimatedPressable>
  );
}

function FloatingTabList({ blurTarget, ...props }: TabListProps & {
  blurTarget: RefObject<View | null>;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const contrast = useTabContrastControls();
  const pathname = usePathname();
  const selectedIndex = pathname.startsWith('/carte') ? 1
    : pathname.startsWith('/rapports') ? 2
      : pathname.startsWith('/mes-proches') ? 3 : 0;
  const [barSize, setBarSize] = useState({ width: 0, height: 0 });
  const buttonWidth = Math.max(0, (barSize.width - 16) / 4);
  const previousWidth = useRef(0);
  const indicatorX = useSharedValue(0);

  useEffect(() => {
    const destination = selectedIndex * buttonWidth;
    // Place the bubble immediately on first layout and when the window resizes.
    indicatorX.value = previousWidth.current !== buttonWidth
      ? destination
      : withSpring(destination, {
          damping: 24,
          stiffness: 650,
          mass: 0.5,
          reduceMotion: ReduceMotion.System,
        });
    previousWidth.current = buttonWidth;
  }, [buttonWidth, indicatorX, selectedIndex]);
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  return (
    <View
      {...props}
      pointerEvents="box-none"
      style={[styles.tabBarPosition, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
      <View ref={contrast?.bar} onLayout={({ nativeEvent: { layout } }) => {
        setBarSize((current) => current.width === layout.width && current.height === layout.height
          ? current : { width: layout.width, height: layout.height });
        contrast?.start();
        contrast?.stop();
      }} style={styles.tabBar}>
        <FloatingGlass blurTarget={blurTarget} radius={34} />
        {buttonWidth > 0 && <Animated.View
          pointerEvents="none"
          style={[styles.selectionBubble, {
            width: buttonWidth,
            height: Math.max(54, barSize.height - 16),
          }, indicatorStyle]}
        />}
        {props.children}
      </View>
    </View>
  );
}

export default function PillTabs() {
  const styles = useStyles();
  const blurTarget = useRef<View | null>(null);
  return (
    <TabContrastProvider>
    <Tabs style={styles.container}>
      <BlurTargetView ref={blurTarget} style={styles.content}>
        <TabSlot style={styles.content} />
      </BlurTargetView>

      <TabList asChild>
        <FloatingTabList blurTarget={blurTarget}>
          <TabTrigger name="home" href="/" asChild>
            <TabButton contrastIndex={0} label="Accueil" icon={House} />
          </TabTrigger>

          <TabTrigger name="map" href="/carte" asChild>
            <TabButton contrastIndex={1} label="Carte" icon={Map} />
          </TabTrigger>

          <TabTrigger name="reports" href="/rapports" asChild>
            <TabButton contrastIndex={2} label="Rapports" icon={ClipboardList} />
          </TabTrigger>

          <TabTrigger name="relatives" href="/mes-proches" asChild>
            <TabButton contrastIndex={3} label="Mes proches" icon={UsersRound} />
          </TabTrigger>
        </FloatingTabList>
      </TabList>
    </Tabs>
    </TabContrastProvider>
  );
}

const useStyles = createThemedStyles((color) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color('#F7F7F7', 'background'),
  },
  content: {
    flex: 1,
    backgroundColor: color('#F7F7F7', 'background'),
  },
  tabBarPosition: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  tabBar: {
    width: '100%',
    maxWidth: 430,
    minHeight: 68,
    padding: 7,
    borderRadius: 34,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: color('#FFFFFF', 'border'),
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 8,
  },
  tabButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  selectionBubble: {
    position: 'absolute',
    top: 7,
    left: 7,
    borderRadius: 27,
    backgroundColor: color('#FFE5DA', 'accentSoft'),
    borderWidth: 1,
    borderColor: color('#FFD0BD', 'accent'),
    boxShadow: [
      { offsetX: 0, offsetY: 4, blurRadius: 9, spreadDistance: -2, color: 'rgba(174,65,31,0.25)' },
      { offsetX: 0, offsetY: 1, blurRadius: 1, color: 'rgba(255,255,255,0.72)', inset: true },
      { offsetX: 0, offsetY: -2, blurRadius: 3, color: 'rgba(210,92,51,0.13)', inset: true },
    ],
  },
  tabLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
}));
