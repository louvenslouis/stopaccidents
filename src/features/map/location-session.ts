import * as Location from 'expo-location';
import { Platform } from 'react-native';

import type { UserPosition } from '@/components/map-frame-props';

export class MapLocationError extends Error {
  constructor(
    message: string,
    public settingsNeeded = false,
  ) {
    super(message);
  }
}

/** A cancellable foreground session, including permission and subscription startup. */
export function startLocationSession(
  signal: AbortSignal,
  continuous: boolean,
  onPosition: (position: UserPosition) => void,
  onError: (error: MapLocationError) => void,
) {
  let stopped = false;
  let subscription: { remove: () => void } | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    stopped = true;
    clearTimeout(timeout);
    signal.removeEventListener('abort', stop);
    subscription?.remove();
    subscription = undefined;
  };
  const fail = (error: MapLocationError) => {
    if (stopped) return;
    stop();
    onError(error);
  };
  const armTimeout = () => {
    clearTimeout(timeout);
    timeout = setTimeout(
      () =>
        fail(
          new MapLocationError(
            'Signal GPS indisponible. Placez-vous dans un endroit dégagé puis réessayez.',
          ),
        ),
      30000,
    );
  };
  const receive = (
    position: Pick<Location.LocationObject, 'coords' | 'timestamp'>,
  ) => {
    if (stopped) return;
    const { latitude, longitude, accuracy } = position.coords;
    const age = Date.now() - position.timestamp;
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180 ||
      !Number.isFinite(age) ||
      age < -5000 ||
      age > 30000
    )
      return;
    if (continuous) armTimeout();
    else stop();
    onPosition({
      latitude,
      longitude,
      accuracy:
        accuracy !== null && Number.isFinite(accuracy) && accuracy >= 0
          ? accuracy
          : null,
    });
  };
  signal.addEventListener('abort', stop, { once: true });
  if (signal.aborted) {
    stop();
    return;
  }
  void (async () => {
    if (Platform.OS === 'web') {
      if (!globalThis.isSecureContext || !navigator.geolocation)
        throw new MapLocationError(
          'La localisation nécessite un navigateur compatible et une connexion HTTPS.',
        );
      armTimeout();
      // Expo 57's web watcher does not forward browser errors; use the browser API.
      const id = navigator.geolocation.watchPosition(
        receive,
        (error) =>
          fail(
            new MapLocationError(
              error.code === 1
                ? 'Autorisez la localisation dans les paramètres de ce site, puis réessayez.'
                : 'Position indisponible. Vérifiez le GPS de votre appareil puis réessayez.',
            ),
          ),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 25000 },
      );
      subscription = { remove: () => navigator.geolocation.clearWatch(id) };
    } else {
      let permission = await Location.getForegroundPermissionsAsync();
      if (stopped) return;
      if (!permission.granted && permission.canAskAgain)
        permission = await Location.requestForegroundPermissionsAsync();
      if (stopped) return;
      if (!permission.granted)
        throw new MapLocationError(
          'Autorisez la localisation pour afficher votre position sur la carte.',
          !permission.canAskAgain,
        );
      const enabled = await Location.hasServicesEnabledAsync();
      if (stopped) return;
      if (!enabled)
        throw new MapLocationError(
          'Activez la localisation de votre appareil puis réessayez.',
          true,
        );
      armTimeout();
      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 0,
          timeInterval: 1000,
        },
        receive,
        () =>
          fail(
            new MapLocationError(
              'Le suivi GPS a été interrompu. Vérifiez la localisation puis réessayez.',
            ),
          ),
      );
    }
    // Cancellation or a first fix can arrive before native startup completes.
    if (stopped) {
      subscription?.remove();
      subscription = undefined;
    }
  })().catch((error) =>
    fail(
      error instanceof MapLocationError
        ? error
        : new MapLocationError(
            'Localisation indisponible. Vérifiez vos autorisations puis réessayez.',
          ),
    ),
  );
}
