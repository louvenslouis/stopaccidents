import {
  isPreciseLocation,
  type Coordinates,
} from '@/features/accident-report/model';

export const APP_LOCATION_MAX_AGE_MS = 90_000;

export type AppLocationSnapshot = {
  coordinates: Coordinates;
  location: string;
  capturedAt: number;
};

export function reusableAppLocation(
  snapshot: AppLocationSnapshot | null,
  now = Date.now(),
): AppLocationSnapshot | null {
  if (!snapshot || !isPreciseLocation(snapshot.coordinates)) return null;
  const age = now - snapshot.capturedAt;
  return age >= -5_000 && age <= APP_LOCATION_MAX_AGE_MS
    ? snapshot
    : null;
}

export function locationDistanceMeters(
  first: Coordinates,
  second: Coordinates,
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const firstLatitude = radians(first.latitude);
  const secondLatitude = radians(second.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(haversine));
}
