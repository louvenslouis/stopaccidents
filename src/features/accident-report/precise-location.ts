import * as Location from 'expo-location';
import { isPreciseLocation, type Coordinates } from './model';

export class PreciseLocationError extends Error {
  constructor(
    message: string,
    public settingsNeeded = false,
  ) {
    super(message);
  }
}

/** Wait for a fresh, accurate fix; always stop tracking on completion or dismissal. */
export function acquirePreciseLocation(
  signal: AbortSignal,
  onProgress: (message: string) => void,
): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let subscription: Location.LocationSubscription | undefined;
    const finish = (coordinates?: Coordinates, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
      subscription?.remove();
      if (coordinates) resolve(coordinates);
      else reject(error);
    };
    const cancel = () => finish(undefined, new Error('Recherche annulée.'));
    const timeout = setTimeout(
      () =>
        finish(
          undefined,
          new PreciseLocationError(
            'La position GPS n’est pas assez précise.',
          ),
        ),
      35000,
    );
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) {
      cancel();
      return;
    }
    void (async () => {
      onProgress('Autorisation de la position exacte…');
      let permission = await Location.getForegroundPermissionsAsync();
      if (settled) return;
      if (!permission.granted && permission.canAskAgain)
        permission = await Location.requestForegroundPermissionsAsync();
      if (settled) return;
      if (
        !permission.granted ||
        permission.ios?.accuracy === 'reduced' ||
        permission.android?.accuracy === 'coarse'
      )
        throw new PreciseLocationError(
          'L’accès à la position exacte n’est pas autorisé.',
          true,
        );
      const enabled = await Location.hasServicesEnabledAsync();
      if (settled) return;
      if (!enabled)
        throw new PreciseLocationError(
          'La localisation de l’appareil est désactivée.',
          true,
        );
      onProgress('Recherche d’une position précise…');
      // Expo web forwards these browser options unchanged, including high accuracy.
      const options = {
        accuracy: Location.Accuracy.Highest,
        timeInterval: 1000,
        distanceInterval: 0,
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 30000,
      };
      subscription = await Location.watchPositionAsync(
        options,
        (position) => {
          if (settled) return;
          const coordinates = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          };
          const age = Date.now() - position.timestamp;
          if (isPreciseLocation(coordinates) && age >= -5000 && age <= 30000)
            finish(coordinates);
          else onProgress('Le GPS affine votre position…');
        },
        () =>
          finish(
            undefined,
            new PreciseLocationError('Le signal GPS est indisponible.'),
          ),
      );
      // A callback or cancellation may arrive before the subscription resolves.
      if (settled) subscription.remove();
    })().catch((error) =>
      finish(
        undefined,
        error instanceof PreciseLocationError
          ? error
          : new PreciseLocationError(
              'La localisation est indisponible.',
              true,
            ),
      ),
    );
  });
}
