import type {
  AccidentMarker,
  UserPosition,
} from "@/components/map-frame-props";

/** GeoJSON order: longitude, latitude. Distances are metres. */
export type Coordinate = [number, number];
export const REPORT_CORRIDOR_METERS = 60;
const EARTH_RADIUS = 6371008.8;
const RAD = Math.PI / 180;
const CELL = 250;

export function distanceBetween(a: Coordinate, b: Coordinate) {
  const h =
    Math.sin(((b[1] - a[1]) * RAD) / 2) ** 2 +
    Math.cos(a[1] * RAD) *
      Math.cos(b[1] * RAD) *
      Math.sin(((b[0] - a[0]) * RAD) / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function indexRoute(coordinates: Coordinate[]) {
  const cos = Math.cos(coordinates[0][1] * RAD);
  const project = (point: Coordinate): Coordinate => [
    (point[0] - coordinates[0][0]) * RAD * EARTH_RADIUS * cos,
    (point[1] - coordinates[0][1]) * RAD * EARTH_RADIUS,
  ];
  const points = coordinates.map(project);
  const cumulative = [0];
  const grid = new Map<string, number[]>();
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i],
      b = points[i + 1];
    cumulative.push(
      cumulative[i] + distanceBetween(coordinates[i], coordinates[i + 1]),
    );
    for (
      let x = Math.floor(Math.min(a[0], b[0]) / CELL);
      x <= Math.floor(Math.max(a[0], b[0]) / CELL);
      x++
    ) {
      for (
        let y = Math.floor(Math.min(a[1], b[1]) / CELL);
        y <= Math.floor(Math.max(a[1], b[1]) / CELL);
        y++
      ) {
        const key = `${x}:${y}`;
        const bucket = grid.get(key) ?? [];
        bucket.push(i);
        grid.set(key, bucket);
      }
    }
  }
  return {
    coordinates,
    points,
    cumulative,
    grid,
    project,
    length: cumulative.at(-1)!,
  };
}

export type RouteIndex = ReturnType<typeof indexRoute>;
export type RouteProjection = {
  offset: number;
  along: number;
  segment: number;
};

/** Project onto segments, including endpoints and duplicate geometry vertices. */
export function projectOnRoute(
  index: RouteIndex,
  coordinate: Coordinate,
  options: {
    candidates?: Iterable<number>;
    previous?: number;
    maxAdvance?: number;
  } = {},
): RouteProjection | null {
  const point = index.project(coordinate);
  let best: RouteProjection | null = null;
  let bestScore = Infinity;
  const candidates =
    options.candidates ?? index.points.slice(1).map((_, i) => i);
  for (const i of candidates) {
    const a = index.points[i],
      b = index.points[i + 1];
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const length2 = dx * dx + dy * dy;
    const t = length2
      ? Math.max(
          0,
          Math.min(
            1,
            ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length2,
          ),
        )
      : 0;
    const offset = Math.hypot(
      point[0] - a[0] - t * dx,
      point[1] - a[1] - t * dy,
    );
    const along =
      index.cumulative[i] + t * (index.cumulative[i + 1] - index.cumulative[i]);
    if (
      options.previous !== undefined &&
      (along < options.previous - 80 ||
        along > options.previous + (options.maxAdvance ?? 300))
    )
      continue;
    // Continuity avoids jumping to a later pass at crossings and on loops.
    const score =
      offset +
      (options.previous === undefined
        ? 0
        : Math.abs(along - options.previous) * 0.08);
    if (score < bestScore) {
      bestScore = score;
      best = { offset, along, segment: i };
    }
  }
  return best;
}

export type RouteReport = {
  marker: AccidentMarker;
  along: number;
  offset: number;
};

export function reportsOnRoute(
  index: RouteIndex,
  markers: AccidentMarker[],
  corridor = REPORT_CORRIDOR_METERS,
): RouteReport[] {
  const seen = new Set<string>();
  return markers
    .flatMap((marker): RouteReport[] => {
      if (
        seen.has(marker.id) ||
        !Number.isFinite(marker.latitude) ||
        !Number.isFinite(marker.longitude)
      )
        return [];
      seen.add(marker.id);
      const coordinate: Coordinate = [marker.longitude, marker.latitude];
      const point = index.project(coordinate);
      const candidates = new Set<number>();
      for (
        let x = Math.floor((point[0] - corridor) / CELL);
        x <= Math.floor((point[0] + corridor) / CELL);
        x++
      ) {
        for (
          let y = Math.floor((point[1] - corridor) / CELL);
          y <= Math.floor((point[1] + corridor) / CELL);
          y++
        ) {
          for (const segment of index.grid.get(`${x}:${y}`) ?? [])
            candidates.add(segment);
        }
      }
      const match = projectOnRoute(index, coordinate, { candidates });
      return match && match.offset <= corridor
        ? [{ marker, along: match.along, offset: match.offset }]
        : [];
    })
    .sort(
      (a, b) =>
        a.along - b.along ||
        b.marker.priority - a.marker.priority ||
        a.marker.id.localeCompare(b.marker.id),
    );
}

export type NavigationProgress = {
  along: number;
  remaining: number;
  offRoute: boolean;
  arrived: boolean;
  uncertain: boolean;
};

export function routeProgress(
  index: RouteIndex,
  position: UserPosition,
  previous = 0,
  maxAdvance = 300,
): NavigationProgress {
  const accuracy = position.accuracy;
  const uncertain =
    accuracy === null ||
    !Number.isFinite(accuracy) ||
    accuracy < 0 ||
    accuracy > 50;
  const coordinate: Coordinate = [position.longitude, position.latitude];
  const match = projectOnRoute(index, coordinate, { previous, maxAdvance });
  const offRoute =
    !uncertain && (!match || match.offset > Math.max(75, accuracy! * 2));
  const along =
    !uncertain && !offRoute && match
      ? Math.max(previous, match.along)
      : previous;
  const remaining = Math.max(0, index.length - along);
  const arrived =
    !uncertain &&
    !offRoute &&
    remaining <= 40 &&
    distanceBetween(coordinate, index.coordinates.at(-1)!) <= 50;
  return { along, remaining, offRoute, arrived, uncertain };
}

export function formatRouteDistance(meters: number) {
  return meters < 1000
    ? `${Math.round(Math.max(0, meters) / 10) * 10} m`
    : `${(meters / 1000).toLocaleString("fr", { maximumFractionDigits: 1 })} km`;
}

export function formatRouteDuration(seconds: number) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}
