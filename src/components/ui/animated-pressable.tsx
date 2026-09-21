import * as Haptics from 'expo-haptics';
import { forwardRef, type ReactNode } from 'react';
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  ReduceMotion,
  type AnimatedStyle,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const ReanimatedPressable = Animated.createAnimatedComponent(Pressable);

type HapticFeedback = 'light' | 'medium' | 'selection' | 'warning' | 'none';

type AnimatedPressableProps = Omit<PressableProps, 'children' | 'style'> & {
  children: ReactNode;
  haptic?: HapticFeedback;
  hoverScale?: number;
  pressedOpacity?: number;
  pressedScale?: number;
  style?: StyleProp<AnimatedStyle<ViewStyle>>;
};

function playHaptic(feedback: HapticFeedback) {
  if (feedback === 'none' || process.env.EXPO_OS === 'web') return;

  const vibration =
    feedback === 'selection'
      ? Haptics.selectionAsync()
      : feedback === 'warning'
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        : Haptics.impactAsync(
            feedback === 'medium'
              ? Haptics.ImpactFeedbackStyle.Medium
              : Haptics.ImpactFeedbackStyle.Light,
          );

  void vibration.catch(() => undefined);
}

export const AnimatedPressable = forwardRef<View, AnimatedPressableProps>(
  function AnimatedPressable(
    {
      children,
      haptic = 'light',
      hoverScale = 1.015,
      onHoverIn,
      onHoverOut,
      onPressIn,
      onPressOut,
      pressedOpacity = 0.82,
      pressedScale = 0.96,
      style,
      ...props
    },
    ref,
  ) {
    const pressProgress = useSharedValue(0);
    const hoverProgress = useSharedValue(0);

    const animatedStyle = useAnimatedStyle(() => ({
      opacity: 1 - pressProgress.value * (1 - pressedOpacity),
      transform: [
        {
          scale:
            1 +
            hoverProgress.value * (hoverScale - 1) -
            pressProgress.value * (1 - pressedScale),
        },
      ],
    }));

    return (
      <ReanimatedPressable
        {...props}
        ref={ref}
        onHoverIn={(event) => {
          hoverProgress.value = withTiming(1, {
            duration: 140,
            reduceMotion: ReduceMotion.System,
          });
          onHoverIn?.(event);
        }}
        onHoverOut={(event) => {
          hoverProgress.value = withTiming(0, {
            duration: 140,
            reduceMotion: ReduceMotion.System,
          });
          onHoverOut?.(event);
        }}
        onPressIn={(event) => {
          pressProgress.value = withSpring(1, {
            damping: 18,
            mass: 0.45,
            reduceMotion: ReduceMotion.System,
            stiffness: 420,
          });
          playHaptic(haptic);
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          pressProgress.value = withSpring(0, {
            damping: 14,
            mass: 0.5,
            reduceMotion: ReduceMotion.System,
            stiffness: 360,
          });
          onPressOut?.(event);
        }}
        style={[style, animatedStyle]}>
        {children}
      </ReanimatedPressable>
    );
  },
);
