import { BlurView } from 'expo-blur';
import type { RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAppTheme } from '@/features/appearance/theme-provider';

export function FloatingGlass({ blurTarget, radius }: {
  blurTarget: RefObject<View | null>;
  radius: number;
}) {
  const { scheme } = useAppTheme();
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, {
      borderRadius: radius,
      overflow: 'hidden',
    }]}>
      <View style={[StyleSheet.absoluteFill, {
        backgroundColor: scheme === 'dark'
          ? 'rgba(20,24,30,0.48)'
          : 'rgba(255,255,255,0.48)',
      }]} />
      <BlurView
        blurTarget={blurTarget}
        blurMethod="dimezisBlurViewSdk31Plus"
        intensity={20}
        tint={scheme === 'dark' ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
