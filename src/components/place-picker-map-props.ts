export type PlacePickerSelection = {
  latitude: number;
  longitude: number;
};

export type PlacePickerMapProps = {
  selection: PlacePickerSelection | null;
  onLoad: () => void;
  onError: () => void;
  onPick: (selection: PlacePickerSelection) => void;
};
