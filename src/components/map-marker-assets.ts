import { Image } from 'react-native';

import type { AccidentMarker } from './map-frame-props';

const markerSources = {
  accident: require('../../assets/images/report-illustrations/accident.png'),
  kidnapping: require('../../assets/images/report-illustrations/kidnapping.png'),
} as const;

export type IllustratedMapMarker = AccidentMarker & { illustrationUri: string };

export function illustratedMapMarkers(
  markers: AccidentMarker[],
): IllustratedMapMarker[] {
  return markers.map((marker) => ({
    ...marker,
    illustrationUri: Image.resolveAssetSource(markerSources[marker.illustration]).uri,
  }));
}
