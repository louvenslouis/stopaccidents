import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { HAITI_BOUNDS } from '@/components/map-document';
import type { UserPosition } from '@/components/map-frame-props';
import { MapLocationError, startLocationSession } from './location-session';

export function useMapLocation() {
  const session = useRef<AbortController | null>(null);
  const [position, setPosition] = useState<UserPosition | null>(null);
  const [tracking, setTracking] = useState(false);
  const [locating, setLocating] = useState(false);
  const [following, setFollowing] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [error, setError] = useState<MapLocationError | null>(null);

  const stop = useCallback(() => {
    session.current?.abort();
    session.current = null;
    setTracking(false);
    setLocating(false);
    setFollowing(false);
    setPosition(null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'background') stop();
      });
      const hide = () => {
        if (document.hidden) stop();
      };
      if (Platform.OS === 'web')
        document.addEventListener('visibilitychange', hide);
      return () => {
        subscription.remove();
        if (Platform.OS === 'web')
          document.removeEventListener('visibilitychange', hide);
        stop();
      };
    }, [stop]),
  );

  const start = useCallback(
    (continuous: boolean) => {
      stop();
      setError(null);
      setLocating(true);
      setTracking(continuous);
      setFollowing(continuous);
      const controller = new AbortController();
      session.current = controller;
      let first = true;
      startLocationSession(
        controller.signal,
        continuous,
        (next) => {
          if (controller.signal.aborted) return;
          if (
            next.latitude < HAITI_BOUNDS[0][0] ||
            next.latitude > HAITI_BOUNDS[1][0] ||
            next.longitude < HAITI_BOUNDS[0][1] ||
            next.longitude > HAITI_BOUNDS[1][1]
          ) {
            stop();
            setError(
              new MapLocationError(
                'Votre position se trouve hors de la zone d’Haïti couverte par cette carte.',
              ),
            );
            return;
          }
          setPosition(next);
          setLocating(false);
          if (first) {
            setFocusRequest((value) => value + 1);
            first = false;
          }
        },
        (failure) => {
          if (controller.signal.aborted) return;
          stop();
          setError(failure);
        },
      );
    },
    [stop],
  );

  const locate = () => {
    if (tracking && position) {
      setFollowing(true);
      setFocusRequest((value) => value + 1);
    } else start(false);
  };
  const pauseFollowing = useCallback(() => setFollowing(false), []);
  const location = useMemo(
    () => ({ position, following, focusRequest }),
    [position, following, focusRequest],
  );
  return {
    location,
    tracking,
    locating,
    error,
    locate,
    start,
    stop,
    pauseFollowing,
  };
}
