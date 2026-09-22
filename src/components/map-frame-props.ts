export type AccidentMarker = {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  color: string;
  priority: number;
  illustration: 'gunfire' | 'accident' | 'kidnapping' | 'barricade' | 'armed_presence' | 'suspicious_vehicle';
};

export const MAP_PAGE_URL =
  'https://www.openstreetmap.org/#map=8/19.05/-73.075';

export type UserPosition = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

export type MapLocation = {
  position: UserPosition | null;
  following: boolean;
  focusRequest: number;
};

export type MapPlaceFocus = {
  latitude: number;
  longitude: number;
  label: string;
  request: number;
} | null;

export type MapFrameProps = {
  onCenterChange: (center: { latitude: number; longitude: number }) => void;
  onLoad: () => void;
  onError: () => void;
  markers: AccidentMarker[];
  onSelect: (id: string) => void;
  location: MapLocation;
  placeFocus: MapPlaceFocus;
  onPan: () => void;
  route?: MapRoute;
};

export type MapRoute = {
  coordinates: [number, number][];
  origin: [number, number];
  destination: [number, number];
  fitRequest: number;
} | null;
