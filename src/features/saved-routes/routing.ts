import { HAITI_BOUNDS } from '@/components/map-document';
import { distanceBetween, type Coordinate } from '@/features/map/route-geometry';
import { parseRoutes } from '@/features/map/routing';

export type RouteWaypoint = { label: string; latitude: number; longitude: number };
export type RouteShapeStep = { instruction: string; distanceMeters: number; durationSeconds: number };
export type RouteShape = {
  waypoints: RouteWaypoint[];
  /** GeoJSON order: longitude, latitude. */
  coordinates: Coordinate[];
  distanceMeters: number;
  durationSeconds: number;
  steps: RouteShapeStep[];
};

export const MAX_ROUTE_WAYPOINTS = 25;
export const WAYPOINT_SNAP_METERS = 25;
const endpoint = process.env.EXPO_PUBLIC_ROUTING_URL || 'https://router.project-osrm.org/route/v1/driving';
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const coordinate = (point: RouteWaypoint): Coordinate => [point.longitude, point.latitude];
const invalid = () => new Error('Le tracé ne passe pas par tous vos points. Ajustez les rues puis réessayez.');

export function isRoutePoint(value: { latitude: number; longitude: number }) {
  return Number.isFinite(value.latitude) && Number.isFinite(value.longitude) &&
    value.latitude >= HAITI_BOUNDS[0][0] && value.latitude <= HAITI_BOUNDS[1][0] &&
    value.longitude >= HAITI_BOUNDS[0][1] && value.longitude <= HAITI_BOUNDS[1][1];
}

export function validateRouteWaypoints(points: RouteWaypoint[]): string | null {
  if (points.length < 2) return 'Choisissez le départ et l’arrivée.';
  if (points.length > MAX_ROUTE_WAYPOINTS) return `Un trajet peut contenir au maximum ${MAX_ROUTE_WAYPOINTS} points.`;
  if (points.some((point) => !isRoutePoint(point) || !point.label.trim()))
    return 'Choisissez vos points dans la zone d’Haïti couverte.';
  if (points.some((point) => point.label.trim().length > 200))
    return 'Le nom d’un point doit contenir au maximum 200 caractères.';
  if (points.some((point, i) => i > 0 && distanceBetween(coordinate(point), coordinate(points[i - 1])) < 5))
    return 'Deux points consécutifs sont trop proches.';
  return null;
}

/** Accept only the route through every requested point, in the requested order. */
export function parseExactRoute(payload: unknown, points: RouteWaypoint[]): RouteShape {
  const validation = validateRouteWaypoints(points);
  if (validation) throw new Error(validation);
  const data = record(payload);
  if (data.code === 'NoSegment') throw new Error('Un point est trop loin d’une rue. Déplacez-le sur la chaussée.');
  const route = parseRoutes(payload)[0];
  if (route.coordinates.length > 10000 || route.distance > 1000000 || route.duration <= 0 || route.duration > 86400)
    throw new Error('Ce trajet est trop long. Enregistrez-le en plusieurs trajets.');
  const rawRoute = record((data.routes as unknown[])[0]);
  if (!Array.isArray(rawRoute.legs) || rawRoute.legs.length !== points.length - 1 ||
      !Array.isArray(data.waypoints) || data.waypoints.length !== points.length) throw invalid();
  let cursor = 0;
  for (let i = 0; i < points.length; i++) {
    const waypoint = record(data.waypoints[i]);
    const location = waypoint.location;
    if (!Array.isArray(location) || location.length !== 2 ||
        typeof location[0] !== 'number' || typeof location[1] !== 'number' ||
        !isRoutePoint({ longitude: location[0], latitude: location[1] })) throw invalid();
    const snapped: Coordinate = [location[0], location[1]];
    if (distanceBetween(coordinate(points[i]), snapped) > WAYPOINT_SNAP_METERS + 1) throw invalid();
    // OSRM's full geometry includes the snapped waypoints. Searching monotonically
    // rejects a response that omits a street or changes the user's point order.
    while (cursor < route.coordinates.length && distanceBetween(route.coordinates[cursor], snapped) > 3) cursor++;
    if (cursor === route.coordinates.length ||
        (i === 0 && distanceBetween(route.coordinates[0], snapped) > 3) ||
        (i === points.length - 1 && distanceBetween(route.coordinates.at(-1)!, snapped) > 3)) throw invalid();
  }
  return {
    waypoints: points.map((point) => ({ ...point })),
    coordinates: route.coordinates,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    // Intermediate pins constrain streets; they are not additional destinations.
    steps: route.steps.filter((step, i) => step.instruction !== 'Rejoignez le point d’arrivée' || i === route.steps.length - 1)
      .map((step) => ({ instruction: step.instruction, distanceMeters: step.distance, durationSeconds: step.duration })),
  };
}

export async function fetchExactRoute(points: RouteWaypoint[], signal: AbortSignal): Promise<RouteShape> {
  const validation = validateRouteWaypoints(points);
  if (validation) throw new Error(validation);
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 20000);
  try {
    const url = new URL(`${endpoint.replace(/\/$/, '')}/${points.map((point) => coordinate(point).join(',')).join(';')}`);
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('overview', 'full');
    url.searchParams.set('steps', 'true');
    url.searchParams.set('alternatives', 'false');
    url.searchParams.set('continue_straight', 'true');
    url.searchParams.set('radiuses', points.map(() => WAYPOINT_SNAP_METERS).join(';'));
    const response = await fetch(url.toString(), { signal: controller.signal, headers: { Accept: 'application/json' }, credentials: 'omit' });
    const payload: unknown = await response.json();
    if (!response.ok && !['NoRoute', 'NoSegment'].includes(String(record(payload).code)))
      throw new Error('Calcul indisponible. Vérifiez votre connexion puis réessayez.');
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return parseExactRoute(payload, points);
  } catch (error) {
    if (controller.signal.aborted && !signal.aborted) throw new Error('Le calcul prend trop de temps. Réessayez.');
    if (error instanceof TypeError || error instanceof SyntaxError) throw new Error('Connexion au service d’itinéraire impossible. Réessayez.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}
