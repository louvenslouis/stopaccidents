import type { RouteWaypoint } from './routing';

export type RouteMapPoint = RouteWaypoint & { id: string; badge: string };
export type RouteMapState = {
  points: RouteMapPoint[];
  coordinates: [number, number][];
  editable: boolean;
  fit: number;
};
export type RouteMapProps = {
  state: RouteMapState;
  onLoad: () => void;
  onError: () => void;
  onPick: (point: { latitude: number; longitude: number }) => void;
  onMove: (id: string, point: { latitude: number; longitude: number }) => void;
};
