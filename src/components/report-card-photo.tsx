import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Platform, StyleSheet, useWindowDimensions, type View as NativeView } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Image } from 'expo-image';
import X from 'lucide-react-native/icons/x';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable, View } from '@/features/language/native';
import { AnimatedPressable } from './ui/animated-pressable';
import { ReportCardActivityContext } from './report-card-actions';

const fade = { duration: 180, reduceMotion: ReduceMotion.System };

export function ReportCardPhoto({ photo, identity, fallback, enabled, canInteract, onError, children }: {
  photo?: string; identity: string; fallback: ReactNode; enabled: boolean; canInteract: () => boolean;
  onError: () => void; children: (controls: (content: ReactNode) => ReactNode) => ReactNode;
}) {
  const [hidden, setHidden] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const surface = useRef<NativeView>(null);
  const setCardActive = useContext(ReportCardActivityContext);
  const opacity = useSharedValue(1);
  useEffect(() => { opacity.set(withTiming(hidden ? 0 : 1, fade)); }, [hidden, opacity]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (!viewer) return;
    setCardActive(true);
    return () => setCardActive(false);
  }, [viewer, setCardActive]);
  const toggleControls = () => {
    if (!enabled || !canInteract()) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (hidden) { setHidden(false); return; }
    setHidden(true);
    timer.current = setTimeout(() => { timer.current = null; setHidden(false); }, 10_000);
  };
  const openPhoto = useCallback(() => {
    if (enabled && photo) setViewer(photo);
  }, [enabled, photo]);
  // Trackpad pinches arrive as Ctrl+wheel on browsers.
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled || !photo) return;
    const element = surface.current as unknown as HTMLElement | null;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.deltaY < 0) openPhoto();
    };
    element?.addEventListener('wheel', onWheel, { passive: false });
    return () => element?.removeEventListener('wheel', onWheel);
  }, [enabled, photo, openPhoto]);
  const pinch = Gesture.Pinch().enabled(enabled && !!photo).runOnJS(true)
    .onUpdate(event => { if (event.scale > 1.08) openPhoto(); });
  const controlsStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const controls = (content: ReactNode) => <Animated.View pointerEvents={hidden ? 'none' : 'box-none'} aria-hidden={hidden}
    accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'} style={controlsStyle}>{content}</Animated.View>;
  return <>
    <GestureDetector gesture={pinch} touchAction="pan-y">
      <Pressable ref={surface} collapsable={false} onPress={event => {
        if (Platform.OS === 'web' && (event.nativeEvent as unknown as MouseEvent).detail === 2) openPhoto();
        else toggleControls();
      }} disabled={!enabled}
        accessibilityLabel="Photo du signalement" accessibilityRole="button"
        accessibilityActions={photo ? [{ name: 'activate', label: 'Agrandir la photo' }] : undefined}
        onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'activate') openPhoto(); }}
        style={StyleSheet.absoluteFill}>
        {photo ? <Image recyclingKey={identity} source={{ uri: photo, cacheKey: photo.split('?')[0] }} cachePolicy="memory-disk"
          transition={180} contentFit="cover" onError={onError} style={StyleSheet.absoluteFill} /> : fallback}
        <View pointerEvents="none" style={styles.shade} />
      </Pressable>
    </GestureDetector>
    {children(controls)}
    {viewer && <PhotoViewer uri={viewer} onClose={() => setViewer(null)} />}
  </>;
}

function PhotoViewer({ uri, onClose }: { uri: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [aspectRatio, setAspectRatio] = useState(width / height);
  const imageWidth = Math.min(width, height * aspectRatio);
  const imageHeight = Math.min(height, width / aspectRatio);
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const surface = useRef<NativeView>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const element = surface.current as unknown as HTMLElement | null;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const next = Math.max(1, Math.min(4, scale.get() * Math.exp(-event.deltaY * 0.01)));
      scale.set(next);
      const limitX = Math.max(0, (imageWidth * next - width) / 2);
      const limitY = Math.max(0, (imageHeight * next - height) / 2);
      x.set(Math.max(-limitX, Math.min(limitX, x.get())));
      y.set(Math.max(-limitY, Math.min(limitY, y.get())));
    };
    element?.addEventListener('wheel', onWheel, { passive: false });
    return () => element?.removeEventListener('wheel', onWheel);
  }, [width, height, imageWidth, imageHeight, scale, x, y]);
  const pinch = Gesture.Pinch().onStart(() => { startScale.set(scale.get()); })
    .onUpdate(event => { scale.set(Math.max(1, Math.min(4, startScale.get() * event.scale))); })
    .onEnd(() => {
      const limitX = Math.max(0, (imageWidth * scale.get() - width) / 2);
      const limitY = Math.max(0, (imageHeight * scale.get() - height) / 2);
      x.set(withTiming(Math.max(-limitX, Math.min(limitX, x.get())), fade));
      y.set(withTiming(Math.max(-limitY, Math.min(limitY, y.get())), fade));
    });
  const pan = Gesture.Pan().maxPointers(1).onStart(() => { startX.set(x.get()); startY.set(y.get()); })
    .onUpdate(event => {
      const limitX = Math.max(0, (imageWidth * scale.get() - width) / 2);
      const limitY = Math.max(0, (imageHeight * scale.get() - height) / 2);
      x.set(Math.max(-limitX, Math.min(limitX, startX.get() + event.translationX)));
      y.set(Math.max(-limitY, Math.min(limitY, startY.get() + event.translationY)));
    });
  const imageStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }] }));
  return <Modal visible animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    <GestureHandlerRootView style={styles.viewer} accessibilityViewIsModal>
      <GestureDetector gesture={Gesture.Simultaneous(pinch, pan)}>
        <View ref={surface} collapsable={false} style={styles.viewerSurface}>
          <Animated.View style={[{ width: imageWidth, height: imageHeight }, imageStyle]}>
            <Image source={{ uri, cacheKey: uri.split('?')[0] }} cachePolicy="memory-disk" contentFit="contain"
              onLoad={event => { if (event.source.width > 0 && event.source.height > 0) setAspectRatio(event.source.width / event.source.height); }}
              style={StyleSheet.absoluteFill} />
          </Animated.View>
        </View>
      </GestureDetector>
      <AnimatedPressable accessibilityRole="button" accessibilityLabel="Fermer la photo" onPress={onClose}
        style={[styles.close, { top: insets.top + 12, right: insets.right + 12 }]}><X size={23} color="#FFFFFF" /></AnimatedPressable>
    </GestureHandlerRootView>
  </Modal>;
}
const styles = StyleSheet.create({
  shade: { ...StyleSheet.absoluteFill, backgroundColor: '#08162218' },
  viewer: { flex: 1, backgroundColor: '#000000', overflow: 'hidden' },
  viewerSurface: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: '#14202B88', borderWidth: 1, borderColor: '#FFFFFF80', alignItems: 'center', justifyContent: 'center' },
});
