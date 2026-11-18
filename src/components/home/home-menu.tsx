import { useRef, useState } from 'react';
import { Alert, Linking, Modal, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import Check from 'lucide-react-native/icons/check';
import Download from 'lucide-react-native/icons/download';
import EllipsisVertical from 'lucide-react-native/icons/ellipsis-vertical';
import Globe from 'lucide-react-native/icons/globe';
import Settings from 'lucide-react-native/icons/settings';
import SquareArrowUp from 'lucide-react-native/icons/square-arrow-up';
import SquarePlus from 'lucide-react-native/icons/square-plus';
import UserRound from 'lucide-react-native/icons/user-round';
import Route from 'lucide-react-native/icons/route';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { usePwaInstall } from '@/features/home/pwa-install';
import { useLanguage } from '@/features/language/language-provider';
import { Pressable, ScrollView, Text, View } from '@/features/language/native';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon } from '@/components/ui/app-icon';
import { surfaceDepth } from '@/components/ui/surface-depth';

const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL || 'https://app.stopaccidentshaiti.org/';
const INSTALL_LABEL = 'Installer l’application';
const SAFARI_INSTALL_STEPS = [
  {
    icon: SquareArrowUp,
    text: 'Ouvrez Stop Accidents dans Safari, puis touchez « Partager » dans la barre d’outils ou dans le menu de la page.',
  },
  {
    icon: SquarePlus,
    text: 'Faites défiler les options et touchez « Sur l’écran d’accueil ».',
  },
  {
    icon: Check,
    text: 'Activez « Ouvrir comme app web » si l’option apparaît, puis touchez « Ajouter ».',
  },
];

export function HomeMenu() {
  const styles = useStyles();
  const color = useThemeColor();
  const { t } = useLanguage();
  const { installPwa, canShowSafariGuide } = usePwaInstall();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const trigger = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ right: number; top: number } | null>(null);
  const [menuHeight, setMenuHeight] = useState(188);
  const [showSafariGuide, setShowSafariGuide] = useState(false);
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
    setShowSafariGuide(false);
  }

  function openSite() {
    close();
    void Linking.openURL(SITE_URL).catch(() => {
      Alert.alert(t('Le Site'), t('Impossible d’ouvrir le site. Réessayez.'));
    });
  }

  const items = [
    { label: 'Mon profil', icon: UserRound, action: () => { close(); router.push('/profil'); } },
    { label: 'Lieux et trajets', icon: Route, action: () => { close(); router.push('/lieux-trajets'); } },
    { label: 'Paramètres', icon: Settings, action: () => { close(); router.push('/parametres'); } },
    { label: 'Le Site', icon: Globe, action: openSite },
  ];
  if (installPwa || canShowSafariGuide) {
    items.push({
      label: INSTALL_LABEL,
      icon: Download,
      action: installPwa ? () => { installPwa(); close(); } : () => setShowSafariGuide(true),
    });
  }

  return (
    <>
      <AnimatedPressable
        ref={trigger}
        accessibilityLabel="Ouvrir le menu"
        accessibilityRole="button"
        accessibilityState={{ expanded: anchor !== null && !showSafariGuide }}
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
              accessibilityLabel={showSafariGuide ? 'Fermer' : 'Fermer le menu'}
              accessibilityRole="button"
              importantForAccessibility={showSafariGuide ? 'no' : 'auto'}
              tabIndex={showSafariGuide ? -1 : 0}
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
                maxHeight: height - insets.top - insets.bottom - 24,
              },
              showSafariGuide ? styles.installGuide : {
                right: Math.max(16, Math.min(anchor?.right ?? 16, width - 256)),
                top: Math.max(insets.top + 8, Math.min(anchor?.top ?? 0, height - insets.bottom - menuHeight - 16)),
              },
              panelStyle,
            ]}>
            <ScrollView bounces={false}>
              {showSafariGuide ? (
                <View style={styles.installContent}>
                  <Text accessibilityRole="header" style={styles.installTitle}>{INSTALL_LABEL}</Text>
                  {SAFARI_INSTALL_STEPS.map(({ icon, text }) => (
                    <View key={text} style={styles.installStep}>
                      <View aria-hidden style={styles.installStepIcon}>
                        <AppIcon icon={icon} size={20} color={color('#49614D', 'secondary')} />
                      </View>
                      <Text style={styles.installStepText}>{text}</Text>
                    </View>
                  ))}
                  <Pressable accessibilityRole="button" onPress={close} style={styles.installClose}>
                    <Text style={styles.label}>Fermer</Text>
                  </Pressable>
                </View>
              ) : items.map(({ label, icon, action }, index) => (
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
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const useStyles = createThemedStyles((color) => StyleSheet.create({
  trigger: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, justifyContent: 'center' },
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
  installGuide: { position: 'relative', alignSelf: 'center', width: 360, padding: 0 },
  installContent: { padding: 20, gap: 12 },
  installTitle: { color: color('#29392F', 'text'), fontSize: 20, fontWeight: '700' },
  installStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  installStepIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color('#EDF3E9', 'elevated'),
  },
  installStepText: { flex: 1, color: color('#29392F', 'text'), fontSize: 16, lineHeight: 23 },
  installClose: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color('#EDF3E9', 'elevated'),
  },
}));
