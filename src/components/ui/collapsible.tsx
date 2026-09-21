import ChevronRight from 'lucide-react-native/icons/chevron-right';
import { PropsWithChildren, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutUp,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon } from '@/components/ui/app-icon';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Collapsible({ children, title }: PropsWithChildren & { title: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const theme = useTheme();
  const openProgress = useSharedValue(0);

  useEffect(() => {
    openProgress.value = withSpring(isOpen ? 1 : 0, {
      damping: 16,
      reduceMotion: ReduceMotion.System,
      stiffness: 260,
    });
  }, [isOpen, openProgress]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${90 - openProgress.value * 90}deg` }],
  }));

  return (
    <ThemedView>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        haptic="selection"
        pressedScale={0.985}
        style={styles.heading}
        onPress={() => setIsOpen((value) => !value)}>
        <ThemedView type="backgroundElement" style={styles.button}>
          <Animated.View style={chevronStyle}>
            <AppIcon icon={ChevronRight} size={14} strokeWidth={3} color={theme.text} />
          </Animated.View>
        </ThemedView>

        <ThemedText type="small">{title}</ThemedText>
      </AnimatedPressable>
      {isOpen && (
        <Animated.View
          entering={FadeInDown.duration(180).reduceMotion(ReduceMotion.System)}
          exiting={FadeOutUp.duration(120).reduceMotion(ReduceMotion.System)}>
          <ThemedView type="backgroundElement" style={styles.content}>
            {children}
          </ThemedView>
        </Animated.View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  button: {
    width: Spacing.four,
    height: Spacing.four,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    marginTop: Spacing.three,
    borderRadius: Spacing.three,
    marginLeft: Spacing.four,
    padding: Spacing.four,
  },
});
