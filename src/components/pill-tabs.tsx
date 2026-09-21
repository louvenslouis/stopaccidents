import {
  TabList,
  TabSlot,
  Tabs,
  TabTrigger,
  type TabListProps,
  type TabTriggerSlotProps,
} from 'expo-router/ui';
import House from 'lucide-react-native/icons/house';
import Map from 'lucide-react-native/icons/map';
import User from 'lucide-react-native/icons/user';
import { useEffect, type Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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

const colors = {
  background: '#F7F7F7',
  bar: '#FFFFFF',
  active: '#FF5A45',
  activeBackground: '#FFF0EC',
  inactive: '#8A8A8E',
};

type TabButtonProps = TabTriggerSlotProps & {
  label: string;
  icon: AppIconComponent;
  ref?: Ref<View>;
};

function TabButton({ icon, isFocused, label, ...props }: TabButtonProps) {
  const color = isFocused ? colors.active : colors.inactive;
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
      ['rgba(255, 240, 236, 0)', colors.activeBackground],
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

function FloatingTabList(props: TabListProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      {...props}
      pointerEvents="box-none"
      style={[styles.tabBarPosition, { bottom: Math.max(insets.bottom, 12) + 8 }]}>
      <View style={styles.tabBar}>{props.children}</View>
    </View>
  );
}

export default function PillTabs() {
  return (
    <Tabs style={styles.container}>
      <TabSlot style={styles.content} />

      <TabList asChild>
        <FloatingTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton label="Accueil" icon={House} />
          </TabTrigger>

          <TabTrigger name="map" href="/carte" asChild>
            <TabButton label="Carte" icon={Map} />
          </TabTrigger>

          <TabTrigger name="profile" href="/profil" asChild>
            <TabButton label="Profil" icon={User} />
          </TabTrigger>
        </FloatingTabList>
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabBarPosition: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  tabBar: {
    width: '100%',
    maxWidth: 430,
    minHeight: 68,
    padding: 7,
    borderRadius: 34,
    backgroundColor: colors.bar,
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
});
