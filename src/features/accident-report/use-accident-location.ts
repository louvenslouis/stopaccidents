import { useEffect, useState } from 'react';
import { accidentLocation } from './presentation';
import type { AccidentSummary } from './read';
import { cachedZone, coordinatesKey, reverseGeocodeZone } from './reverse-geocode';

export function useAccidentLocation(report: AccidentSummary | null) {
  const key = report?.location_description.trim()
    ? null
    : coordinatesKey(report?.latitude, report?.longitude);
  const [resolved, setResolved] = useState<{
    key: string;
    zone: string | null;
  } | null>(null);

  useEffect(() => {
    if (!key || !report) return;
    let active = true;
    void reverseGeocodeZone(report.latitude, report.longitude).then((zone) => {
      if (active) setResolved({ key, zone });
    });
    return () => { active = false; };
  }, [key, report]);

  // A changed accident must never briefly inherit the previous accident's zone.
  const zone = key
    ? (resolved?.key === key ? resolved.zone : cachedZone(key))
    : null;
  return {
    label: zone || (report ? accidentLocation(report) : 'Lieu à préciser'),
    estimated: Boolean(zone),
  };
}
