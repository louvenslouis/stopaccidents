import { useRef, useState } from 'react';
import { Alert, Linking, Modal, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import EllipsisVertical from 'lucide-react-native/icons/ellipsis-vertical';
import Globe from 'lucide-react-native/icons/globe';
import Settings from 'lucide-react-native/icons/settings';
import UserRound from 'lucide-react-native/icons/user-round';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { useLanguage } from '@/features/language/language-provider';
import { Pressable, Text, View } from '@/features/language/native';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon } from '@/components/ui/app-icon';
import { surfaceDepth } from '@/components/ui/surface-depth';

const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL || 'https://louvenslouis.github.io/stopaccidents/';

export function HomeMenu() {
  const styles = useStyles();
  const color = useThemeColor();
  const { t } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const trigger = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ right: number; top: number } | null>(null);
  const [menuHeight, setMenuHeight] = useState(188);
  const progress = useSharedValue(0);
  const opacity = useSharedValue(0);
  const panelStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: (1 - progress.value) * -14 },
      { scale: 0.78 + progress.value * 0.22 },
    ],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  function open() {
    trigger.current?.measureInWindow((x, y, buttonWidth, buttonHeight) => {
      progress.set(0);
      opacity.set(0);
      setAnchor({ right: width - x - buttonWidth, top: y + buttonHeight + 8 });
    });
  }

  function close() {
    setAnchor(null);
  }

  function openSite() {
    close();
    void Linking.openURL(SITE_URL).catch(() => {
      Alert.alert(t('Le Site'), t('Impossible d’ouvrir le site. Réessayez.'));
    });
  }

  const items = [
    { label: 'Mon profil', icon: UserRound, action: () => { close(); router.push('/profil'); } },
    { label: 'Paramètres', icon: Settings, action: () => { close(); router.push('/parametres'); } },
    { label: 'Le Site', icon: Globe, action: openSite },
  ];

  return (
    <>
      <AnimatedPressable
        ref={trigger}
        accessibilityLabel="Ouvrir le menu"
        accessibilityRole="button"
        accessibilityState={{ expanded: anchor !== null }}
        onPress={open}
        haptic="light"
        hitSlop={4}
        pressedScale={0.9}
        style={styles.trigger}>
        <AppIcon icon={EllipsisVertical} size={22} color={color('#49614D', 'secondary')} />
      </AnimatedPressable>
      <Modal
        visible={anchor !== null}
        transparent
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={close}
        onShow={() => {
          opacity.set(withTiming(1, { duration: 150, reduceMotion: ReduceMotion.System }));
          progress.set(withSpring(1, {
            damping: 11,
            stiffness: 260,
            mass: 0.7,
            reduceMotion: ReduceMotion.System,
          }));
        }}>
        <View style={styles.overlay}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
            <Pressable
              accessibilityLabel="Fermer le menu"
              accessibilityRole="button"
              onPress={close}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <Animated.View
            accessibilityViewIsModal
            onAccessibilityEscape={close}
            onLayout={(event) => setMenuHeight(event.nativeEvent.layout.height)}
            style={[
              styles.menu,
              {
                maxWidth: width - 32,
                right: Math.max(16, Math.min(anchor?.right ?? 16, width - 256)),
                top: Math.max(insets.top + 8, Math.min(anchor?.top ?? 0, height - insets.bottom - menuHeight - 16)),
              },
              panelStyle,
            ]}>
            {items.map(({ label, icon, action }, index) => (
              <AnimatedPressable
                key={label}
                accessibilityRole="button"
                onPress={action}
                haptic="selection"
                pressedScale={0.97}
                style={[styles.item, index > 0 && styles.separator]}>
                <AppIcon icon={icon} size={20} color={color('#49614D', 'secondary')} />
                <Text style={styles.label}>{label}</Text>
              </AnimatedPressable>
            ))}
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const useStyles = createThemedStyles((color) => StyleSheet.create({
  trigger: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1 },
  backdrop: { backgroundColor: 'rgba(14, 23, 18, 0.22)' },
  menu: {
    ...surfaceDepth(color, 'raised'),
    position: 'absolute',
    width: 240,
    padding: 8,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: color('#E0E5D7', 'border'),
    backgroundColor: color('#FFFFFF', 'surface'),
    transformOrigin: 'top right',
  },
  item: { minHeight: 56, paddingHorizontal: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 13 },
  separator: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color('#E0E5D7', 'border') },
  label: { flexShrink: 1, color: color('#29392F', 'text'), fontSize: 16, fontWeight: '600' },
}));
