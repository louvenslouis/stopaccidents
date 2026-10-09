import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColor } from '@/features/appearance/theme-provider';
import { Pressable, View } from '@/features/language/native';

/** Shared presentation for the category picker and every report form. */
export function ReportModalSheet({
  visible,
  onRequestClose,
  dismissDisabled = false,
  closeLabel,
  children,
}: {
  visible: boolean;
  onRequestClose: () => void;
  dismissDisabled?: boolean;
  closeLabel?: string;
  children: ReactNode;
}) {
  const themeColor = useThemeColor();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [translation] = useState(() => new Animated.Value(0));
  const sheetHeight = height * 0.95;

  useEffect(() => {
    translation.stopAnimation();
    translation.setValue(0);
  }, [visible, height, translation]);

  const panResponder = useMemo(() => {
    const settle = () => {
      if (reducedMotion) {
        translation.setValue(0);
        return;
      }
      Animated.spring(translation, {
        toValue: 0,
        stiffness: 320,
        damping: 32,
        mass: 0.9,
        useNativeDriver: true,
      }).start();
    };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        !dismissDisabled &&
        gesture.dy > 5 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => translation.stopAnimation(),
      onPanResponderMove: (_, gesture) => translation.setValue(Math.max(0, gesture.dy)),
      onPanResponderRelease: (_, gesture) => {
        if (!dismissDisabled &&
          (gesture.dy > sheetHeight * 0.18 || (gesture.dy > 24 && gesture.vy > 0.8))) {
          onRequestClose();
        }
        // Also restore the sheet if the form handles Back internally (e.g. its camera).
        settle();
      },
      onPanResponderTerminate: settle,
      onPanResponderTerminationRequest: () => false,
    });
  }, [sheetHeight, translation, dismissDisabled, onRequestClose, reducedMotion]);

  const close = () => {
    if (!dismissDisabled) onRequestClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? 'none' : 'slide'}
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
    >
      <View style={styles.overlay}>
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: themeColor('#11182780', 'overlay'),
              opacity: translation.interpolate({
                inputRange: [0, sheetHeight],
                outputRange: [1, 0],
                extrapolate: 'clamp',
              }),
            },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel ?? "Fermer le formulaire, les informations sont conservées"}
          disabled={dismissDisabled}
          onPress={close}
          style={StyleSheet.absoluteFill}
        />
        <KeyboardAvoidingView
          pointerEvents="box-none"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboard}
        >
          <Animated.View
            accessibilityViewIsModal
            onAccessibilityEscape={close}
            style={[
              styles.sheet,
              {
                height: sheetHeight,
                paddingBottom: Math.max(insets.bottom, 12),
                backgroundColor: themeColor('#FFFFFF', 'surface'),
                transform: [{ translateY: translation }],
              },
            ]}
          >
            <Pressable
              {...panResponder.panHandlers}
              onPress={close}
              disabled={dismissDisabled}
              accessible
              accessibilityRole="button"
              accessibilityLabel={closeLabel ?? "Fermer le signalement"}
              accessibilityState={{ disabled: dismissDisabled }}
              accessibilityActions={[{ name: 'activate' }]}
              onAccessibilityAction={close}
              style={styles.handleArea}
            >
              <View style={[styles.handle, { backgroundColor: themeColor('#C3C6CE', 'muted') }]} />
            </Pressable>
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  keyboard: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%',
    maxWidth: 620,
    maxHeight: '95%',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderCurve: 'continuous',
    overflow: 'hidden',
    boxShadow: '0px -8px 40px rgba(0, 0, 0, 0.14)',
  },
  handleArea: { height: 28, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 36, height: 5, borderRadius: 3 },
});
