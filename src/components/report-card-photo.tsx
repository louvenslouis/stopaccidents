import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Platform, StyleSheet, useWindowDimensions, type View as NativeView } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView, type GestureType } from 'react-native-gesture-handler';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Image } from 'expo-image';
import X from 'lucide-react-native/icons/x';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { Pressable, View } from '@/features/language/native';
import { AnimatedPressable } from './ui/animated-pressable';
import { ReportCardActivityContext } from './report-card-actions';
import { ReportPhotoCarouselControls } from './report-photo-carousel-controls';

const fade = { duration: 180, reduceMotion: ReduceMotion.System };

export function ReportCardPhoto({ photo, photos, carousel = false, stackGesture, onPhotoChange, identity, fallback, enabled, canInteract, onError, children }: {
  photo?: string; identity: string; fallback: ReactNode; enabled: boolean; canInteract: () => boolean;
  photos: string[]; carousel?: boolean; onPhotoChange: (uri: string) => void;
  stackGesture?: GestureType;
  onError: (uri: string) => void; children: (controls: (content: ReactNode) => ReactNode) => ReactNode;
}) {
  const [hidden, setHidden] = useState(false);
  const [viewer, setViewer] = useState<{ photos: string[]; index: number; zoom: number } | null>(null);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
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
  const openPhoto = useCallback((zoom = 1) => {
    if (enabled && photo) {
      lastTap.current = null;
      setViewer({ photos: [...photos], index: Math.max(0, photos.indexOf(photo)), zoom: Math.max(1, Math.min(4, zoom)) });
    }
  }, [enabled, photo, photos]);
  // Trackpad pinches arrive as Ctrl+wheel on browsers.
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled || !photo) return;
    const element = surface.current as unknown as HTMLElement | null;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.deltaY < 0) openPhoto(Math.exp(-event.deltaY * 0.01));
    };
    element?.addEventListener('wheel', onWheel, { passive: false });
    return () => element?.removeEventListener('wheel', onWheel);
  }, [enabled, photo, openPhoto]);
  const pinch = Gesture.Pinch().enabled(enabled && !!photo).runOnJS(true)
    // The registered callback reads refs only after the gesture finishes.
    // eslint-disable-next-line react-hooks/refs
    .onEnd(event => { if (event.scale > 1.08) openPhoto(event.scale); });
  if (stackGesture && !carousel) pinch.simultaneousWithExternalGesture(stackGesture);
  const index = Math.max(0, photos.indexOf(photo ?? ''));
  const selectPhoto = (page: number) => {
    if (!enabled || !photos[page]) return;
    lastTap.current = null;
    onPhotoChange(photos[page]);
  };
  const swipe = Gesture.Pan().enabled(enabled && carousel && photos.length > 1).maxPointers(1)
    .activeOffsetX([-12, 12]).failOffsetY([-12, 12]).runOnJS(true)
    // eslint-disable-next-line react-hooks/refs
    .onEnd(event => {
      if (Math.abs(event.translationX) > 40 || (Math.abs(event.translationX) > 20 && Math.abs(event.velocityX) > 600)) {
        lastTap.current = null;
        selectPhoto(index + (event.translationX < 0 ? 1 : -1));
      }
    });
  const controlsStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const controls = (content: ReactNode, overlay = false) => <Animated.View pointerEvents={hidden ? 'none' : 'box-none'} aria-hidden={hidden}
    {...(Platform.OS !== 'web' ? { accessibilityElementsHidden: hidden, importantForAccessibility: hidden ? 'no-hide-descendants' as const : 'auto' as const } : {})}
    style={[controlsStyle, overlay && StyleSheet.absoluteFill]}>{content}</Animated.View>;
  return <>
    <GestureDetector gesture={carousel ? Gesture.Simultaneous(pinch, swipe) : pinch} touchAction="pan-y">
      <Pressable ref={surface} collapsable={false}
        onPressIn={event => { pressOrigin.current = { x: event.nativeEvent.pageX ?? 0, y: event.nativeEvent.pageY ?? 0 }; }} onPress={event => {
        if (!enabled || !canInteract()) return;
        const tap = { time: Date.now(), x: event.nativeEvent.pageX ?? 0, y: event.nativeEvent.pageY ?? 0 };
        if (pressOrigin.current && Math.hypot(tap.x - pressOrigin.current.x, tap.y - pressOrigin.current.y) > 12) return;
        const previous = lastTap.current;
        if (photo && ((Platform.OS === 'web' && (event.nativeEvent as unknown as MouseEvent).detail === 2)
          || (previous && tap.time - previous.time < 300 && Math.hypot(tap.x - previous.x, tap.y - previous.y) < 32))) openPhoto();
        else { lastTap.current = tap; toggleControls(); }
      }} disabled={!enabled}
        accessibilityLabel="Photo du signalement" accessibilityRole="button"
        accessibilityActions={photo ? [{ name: 'activate', label: 'Agrandir la photo' }] : undefined}
        onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'activate') openPhoto(); }}
        style={StyleSheet.absoluteFill}>
        {photo ? <Image pointerEvents="none" recyclingKey={identity} source={{ uri: photo, cacheKey: photo.split('?')[0] }} cachePolicy="memory-disk"
          transition={180} contentFit="cover" onError={() => onError(photo)} style={StyleSheet.absoluteFill} /> : fallback}
        <View pointerEvents="none" style={styles.shade} />
      </Pressable>
    </GestureDetector>
    {children(controls)}
    {carousel && controls(<ReportPhotoCarouselControls count={photos.length} index={index} onSelect={selectPhoto} />, true)}
    {viewer && <PhotoViewer photos={viewer.photos} initialIndex={viewer.index} initialZoom={viewer.zoom}
      onPhotoChange={onPhotoChange} onError={onError} onClose={() => setViewer(null)} />}
  </>;
}

function PhotoViewer({ photos, initialIndex, initialZoom, onPhotoChange, onError, onClose }: {
  photos: string[]; initialIndex: number; initialZoom: number; onPhotoChange: (uri: string) => void;
  onError: (uri: string) => void; onClose: () => void;
}) {
  const [page, setPage] = useState({ index: initialIndex, zoom: initialZoom });
  const insets = useSafeAreaInsets();
  function selectPhoto(index: number) {
    if (!photos[index] || index === page.index) return;
    setPage({ index, zoom: 1 });
    onPhotoChange(photos[index]);
  }
  return <Modal visible animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    <GestureHandlerRootView style={styles.viewer} accessibilityViewIsModal>
      <ZoomablePhoto key={photos[page.index]} uri={photos[page.index]} initialZoom={page.zoom}
        onSwipe={direction => selectPhoto(page.index + direction)} onError={onError} />
      <ReportPhotoCarouselControls count={photos.length} index={page.index} onSelect={selectPhoto} bottom={insets.bottom + 20} />
      <AnimatedPressable accessibilityRole="button" accessibilityLabel="Fermer la photo" onPress={onClose}
        style={[styles.close, { top: insets.top + 12, right: insets.right + 12 }]}><X size={23} color="#FFFFFF" /></AnimatedPressable>
    </GestureHandlerRootView>
  </Modal>;
}
function ZoomablePhoto({ uri, initialZoom, onSwipe, onError }: {
  uri: string; initialZoom: number; onSwipe: (direction: number) => void; onError: (uri: string) => void;
}) {
  const { width, height } = useWindowDimensions();
  const [aspectRatio, setAspectRatio] = useState(width / height);
  const imageWidth = Math.min(width, height * aspectRatio);
  const imageHeight = Math.min(height, width / aspectRatio);
  const scale = useSharedValue(initialZoom);
  const startScale = useSharedValue(initialZoom);
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
    }).onEnd(event => {
      if (scale.get() <= 1.03 && Math.abs(event.translationX) > Math.abs(event.translationY) * 1.2
        && (Math.abs(event.translationX) > 40 || (Math.abs(event.translationX) > 20 && Math.abs(event.velocityX) > 600))) {
        scheduleOnRN(onSwipe, event.translationX < 0 ? 1 : -1);
      }
    });
  const imageStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }] }));
  return <GestureDetector gesture={Gesture.Simultaneous(pinch, pan)}>
        <View ref={surface} collapsable={false} style={styles.viewerSurface}>
          <Animated.View style={[{ width: imageWidth, height: imageHeight }, imageStyle]}>
            <Image pointerEvents="none" source={{ uri, cacheKey: uri.split('?')[0] }} cachePolicy="memory-disk" contentFit="contain"
              onError={() => onError(uri)}
              onLoad={event => { if (event.source.width > 0 && event.source.height > 0) setAspectRatio(event.source.width / event.source.height); }}
              style={StyleSheet.absoluteFill} />
          </Animated.View>
        </View>
      </GestureDetector>;
}
const styles = StyleSheet.create({
  shade: { ...StyleSheet.absoluteFill, backgroundColor: '#08162218' },
  viewer: { flex: 1, backgroundColor: '#000000', overflow: 'hidden' },
  viewerSurface: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: '#14202B88', borderWidth: 1, borderColor: '#FFFFFF80', alignItems: 'center', justifyContent: 'center' },
});
