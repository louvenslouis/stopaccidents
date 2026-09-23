import { Asset } from 'expo-asset';

import type { AccidentMarker } from './map-frame-props';

const markerSources = {
  gunfire: require('../../assets/images/report-illustrations/gunfire.png'),
  suspicious_vehicle: require('../../assets/images/report-illustrations/suspicious-vehicle.png'),
  armed_presence: require('../../assets/images/report-illustrations/armed-presence.png'),
  barricade: require('../../assets/images/barricade-types/other.png'),
  accident: require('../../assets/images/report-illustrations/accident.png'),
  kidnapping: require('../../assets/images/report-illustrations/kidnapping.png'),
  breakdown: require('../../assets/images/breakdown-report/breakdown.png'),
} as const;

export type IllustratedMapMarker = AccidentMarker & { illustrationUri: string };

export function illustratedMapMarkers(
  markers: AccidentMarker[],
): IllustratedMapMarker[] {
  return markers.map((marker) => {
    const asset = Asset.fromModule(markerSources[marker.illustration]);
    return { ...marker, illustrationUri: asset.localUri ?? asset.uri };
  });
}
