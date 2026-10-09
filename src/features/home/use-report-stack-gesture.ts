import * as Haptics from 'expo-haptics';
import { useCallback, useLayoutEffect } from 'react';
import { Platform } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { cancelAnimation, ReduceMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const spring = {
  stiffness: 420,
  damping: 38,
  mass: 0.8,
  overshootClamping: true,
  energyThreshold: 0.00001,
  reduceMotion: ReduceMotion.System,
};

export function useReportStackGesture(keys: string[], index: number, onSelect: (key: string) => void) {
  const position = useSharedValue(index);
  const width = useSharedValue(360);
  const busy = useSharedValue(false);
  const dragging = useSharedValue(false);
  const gestureUntil = useSharedValue(0);
  const order = keys.join('|');

  // Unlock only once React has mounted the next neighbours. A feed reorder also
  // cancels an obsolete gesture, while ordinary refreshes leave it running.
  useLayoutEffect(() => {
    cancelAnimation(position);
    position.set(index);
    dragging.set(false);
    busy.set(false);
  }, [index, order, position, dragging, busy]);

  const commit = useCallback((key: string) => {
    onSelect(key);
    if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {});
  }, [onSelect]);
  const canInteract = useCallback(() => !busy.get() && Date.now() > gestureUntil.get(), [busy, gestureUntil]);

  const gesture = Gesture.Pan()
    .enabled(keys.length > 1)
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onStart(() => {
      if (busy.get()) return;
      busy.set(true);
      dragging.set(true);
    })
    .onUpdate(event => {
      if (!dragging.get()) return;
      const allowed = event.translationX < 0 ? index < keys.length - 1 : index > 0;
      const travel = Math.max(-1, Math.min(1, event.translationX / width.get()));
      position.set(index - travel * (allowed ? 1 : 0.18));
    })
    .onEnd(event => {
      if (!dragging.get()) return;
      dragging.set(false);
      // Gesture callbacks run on release, never during React rendering.
      // eslint-disable-next-line react-hooks/purity
      gestureUntil.set(Date.now() + 250);
      const direction = event.translationX < 0 ? 1 : -1;
      const next = keys[index + direction];
      const fastSwipe = Math.abs(event.translationX) > 24
        && Math.abs(event.velocityX) > 500
        && event.translationX * event.velocityX > 0;
      const advance = !!next && (Math.abs(event.translationX) > width.get() * 0.2 || fastSwipe);
      const destination = advance ? index + direction : index;
      position.set(withSpring(destination, {
        ...spring,
        velocity: -event.velocityX / width.get(),
      }, finished => {
        if (!finished) return;
        if (advance) scheduleOnRN(commit, next);
        else busy.set(false);
      }));
    })
    .onFinalize(() => {
      // Failed vertical gestures leave scrolling/taps alone; canceled active
      // swipes return to the current card without committing a selection.
      if (!dragging.get()) return;
      dragging.set(false);
      // Gesture callbacks run on release, never during React rendering.
      // eslint-disable-next-line react-hooks/purity
      gestureUntil.set(Date.now() + 250);
      position.set(withSpring(index, spring, finished => {
        if (finished) busy.set(false);
      }));
    });

  return { gesture, position, width, canInteract };
}
