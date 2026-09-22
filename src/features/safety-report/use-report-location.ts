import { useEffect, useState } from 'react';
import {
  cachedZone,
  coordinatesKey,
  reverseGeocodeZone,
} from '@/features/accident-report/reverse-geocode';

type LocatedReport = {
  location_description: string;
  latitude: number | null;
  longitude: number | null;
};

function reportLocation(report: LocatedReport) {
  if (report.location_description.trim()) return report.location_description.trim();
  if (report.latitude !== null && report.longitude !== null) {
    return `${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}`;
  }
  return 'Lieu à préciser';
}

export function useReportLocation(report: LocatedReport | null) {
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
    return () => {
      active = false;
    };
  }, [key, report]);

  const zone = key ? (resolved?.key === key ? resolved.zone : cachedZone(key)) : null;
  return {
    label: zone || (report ? reportLocation(report) : 'Lieu à préciser'),
    estimated: Boolean(zone),
  };
}
