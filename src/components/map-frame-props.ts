export type AccidentMarker = {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  color: string;
  priority: number;
};

export const MAP_PAGE_URL =
  'https://www.openstreetmap.org/#map=8/19.05/-73.075';

export type MapFrameProps = {
  onLoad: () => void;
  onError: () => void;
  markers: AccidentMarker[];
  onSelect: (id: string) => void;
};
