import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';

import {
  acquirePreciseLocation,
  PreciseLocationError,
} from '@/features/accident-report/precise-location';
import { reverseGeocodeZone } from '@/features/accident-report/reverse-geocode';
import {
  locationDistanceMeters,
  type AppLocationSnapshot,
} from './app-location-model';

const REFRESH_INTERVAL_MS = 45_000;
const GEOCODE_DISTANCE_METERS = 500;

type AppLocationContextValue = {
  location: AppLocationSnapshot | null;
  locating: boolean;
  error: PreciseLocationError | null;
  refresh: () => void;
};

const AppLocationContext = createContext<AppLocationContextValue>({
  location: null,
  locating: false,
  error: null,
  refresh: () => {},
});

export function AppLocationProvider({ children }: PropsWithChildren) {
  const [location, setLocation] = useState<AppLocationSnapshot | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<PreciseLocationError | null>(null);
  const mounted = useRef(false);
  const foreground = useRef(true);
  const session = useRef<AbortController | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const refreshRef = useRef<() => void>(() => {});
  const locationRef = useRef<AppLocationSnapshot | null>(null);
  const geocodeAnchor = useRef<AppLocationSnapshot['coordinates'] | null>(
    null,
  );

  const clearRefreshTimer = useCallback(() => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = undefined;
  }, []);

  const scheduleRefresh = useCallback(() => {
    clearRefreshTimer();
    if (!mounted.current || !foreground.current) return;
    refreshTimer.current = setTimeout(
      () => refreshRef.current(),
      REFRESH_INTERVAL_MS,
    );
  }, [clearRefreshTimer]);

  const refresh = useCallback(() => {
    if (!mounted.current || !foreground.current || session.current) return;
    clearRefreshTimer();
    const controller = new AbortController();
    session.current = controller;
    let acquired = false;
    setLocating(true);
    setError(null);

    void acquirePreciseLocation(controller.signal, () => {})
      .then((coordinates) => {
        if (controller.signal.aborted || !mounted.current) return;
        acquired = true;
        const previous = locationRef.current;
        const nearbyPrevious =
          previous &&
          locationDistanceMeters(previous.coordinates, coordinates) <
            GEOCODE_DISTANCE_METERS
            ? previous
            : null;
        const snapshot: AppLocationSnapshot = {
          coordinates,
          location: nearbyPrevious?.location ?? '',
          capturedAt: Date.now(),
        };
        locationRef.current = snapshot;
        setLocation(snapshot);

        const anchor = geocodeAnchor.current;
        if (
          anchor &&
          locationDistanceMeters(anchor, coordinates) <
            GEOCODE_DISTANCE_METERS
        ) {
          return;
        }
        geocodeAnchor.current = coordinates;
        void reverseGeocodeZone(coordinates.latitude, coordinates.longitude).then(
          (zone) => {
            if (!zone || !mounted.current) return;
            const current = locationRef.current;
            if (
              !current ||
              locationDistanceMeters(current.coordinates, coordinates) >=
                GEOCODE_DISTANCE_METERS
            ) {
              return;
            }
            const named = { ...current, location: zone.slice(0, 240) };
            locationRef.current = named;
            setLocation(named);
          },
        );
      })
      .catch((cause) => {
        if (controller.signal.aborted || !mounted.current) return;
        setError(
          cause instanceof PreciseLocationError
            ? cause
            : new PreciseLocationError(
                'Localisation indisponible. Vérifiez vos autorisations puis réessayez.',
                true,
              ),
        );
      })
      .finally(() => {
        if (session.current !== controller) return;
        session.current = null;
        if (!mounted.current) return;
        setLocating(false);
        if (acquired) scheduleRefresh();
      });
  }, [clearRefreshTimer, scheduleRefresh]);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    mounted.current = true;
    foreground.current =
      AppState.currentState !== 'background' &&
      (Platform.OS !== 'web' || !document.hidden);
    refresh();

    const appStateSubscription = AppState.addEventListener(
      'change',
      (state) => {
        if (state === 'active') {
          foreground.current = true;
          refreshRef.current();
        } else if (state === 'background') {
          foreground.current = false;
          clearRefreshTimer();
          const controller = session.current;
          session.current = null;
          controller?.abort();
          setLocating(false);
        }
      },
    );
    const handleVisibility = () => {
      foreground.current = !document.hidden;
      if (foreground.current) refreshRef.current();
      else {
        clearRefreshTimer();
        const controller = session.current;
        session.current = null;
        controller?.abort();
        setLocating(false);
      }
    };
    if (Platform.OS === 'web')
      document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      mounted.current = false;
      clearRefreshTimer();
      session.current?.abort();
      appStateSubscription.remove();
      if (Platform.OS === 'web')
        document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [clearRefreshTimer, refresh]);

  const value = useMemo(
    () => ({ location, locating, error, refresh }),
    [error, locating, location, refresh],
  );

  return (
    <AppLocationContext.Provider value={value}>
      {children}
    </AppLocationContext.Provider>
  );
}

export function useAppLocation() {
  return useContext(AppLocationContext);
}
