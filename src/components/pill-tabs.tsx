import { Text, View } from '@/features/language/native';
import { BlurTargetView, BlurView } from 'expo-blur';
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
import User from 'lucide-react-native/icons/user';
import { useEffect, useRef, type Ref, type RefObject } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Animated, {
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon, type AppIconComponent } from '@/components/ui/app-icon';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { createThemedStyles, useAppTheme, useThemeColor } from '@/features/appearance/theme-provider';

type TabButtonProps = TabTriggerSlotProps & {
  label: string;
  icon: AppIconComponent;
  ref?: Ref<View>;
};

function TabButton({ icon, isFocused, label, ...props }: TabButtonProps) {
  const styles = useStyles();
  const themeColor = useThemeColor();
  const color = isFocused ? themeColor('#FF5A45', 'accent') : themeColor('#8A8A8E', 'muted');
  const activeBackground = themeColor('#FFF0EC', 'accentSoft');
  const inactiveBackground = 'transparent';
  const focusProgress = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    focusProgress.value = withSpring(isFocused ? 1 : 0, {
      damping: 18,
      mass: 0.7,
      reduceMotion: ReduceMotion.System,
      stiffness: 260,
    });
  }, [focusProgress, isFocused]);

  const activeStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      focusProgress.value,
      [0, 1],
      [inactiveBackground, activeBackground],
    ),
  }));

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
      style={[styles.tabButton, activeStyle]}>
      <Animated.View style={iconStyle}>
        <AppIcon icon={icon} size={23} color={color} strokeWidth={isFocused ? 2.5 : 2} />
      </Animated.View>
      <Text style={[styles.tabLabel, { color }]}>{label}</Text>
    </AnimatedPressable>
  );
}

function FloatingTabList({ blurTarget, ...props }: TabListProps & {
  blurTarget: RefObject<View | null>;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { scheme } = useAppTheme();

  return (
    <View
      {...props}
      pointerEvents="box-none"
      style={[styles.tabBarPosition, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
      <View style={styles.tabBar}>
        <BlurView
          pointerEvents="none"
          blurTarget={blurTarget}
          blurMethod="dimezisBlurViewSdk31Plus"
          intensity={20}
          tint={scheme === 'dark' ? 'dark' : 'light'}
          style={styles.pillBlur}
        />
        {props.children}
      </View>
    </View>
  );
}

export default function PillTabs() {
  const styles = useStyles();
  const blurTarget = useRef<View | null>(null);
  const tabSlot = (
    <TabSlot
      detachInactiveScreens={Platform.OS !== 'web'}
      style={styles.content}
    />
  );

  return (
    <Tabs style={styles.container}>
      {Platform.OS === 'web' ? tabSlot : (
        <BlurTargetView ref={blurTarget} style={styles.content}>
          {tabSlot}
        </BlurTargetView>
      )}

      <TabList asChild>
        <FloatingTabList blurTarget={blurTarget}>
          <TabTrigger name="home" href="/" asChild>
            <TabButton label="Accueil" icon={House} />
          </TabTrigger>

          <TabTrigger name="map" href="/carte" asChild>
            <TabButton label="Carte" icon={Map} />
          </TabTrigger>

          <TabTrigger name="reports" href="/rapports" asChild>
            <TabButton label="Rapports" icon={ClipboardList} />
          </TabTrigger>

          <TabTrigger name="profile" href="/profil" asChild>
            <TabButton label="Profil" icon={User} />
          </TabTrigger>
        </FloatingTabList>
      </TabList>
    </Tabs>
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
  pillBlur: {
    ...StyleSheet.absoluteFill,
    borderRadius: 34,
    overflow: 'hidden',
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
  tabLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
}));
