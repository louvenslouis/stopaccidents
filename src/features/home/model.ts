import type { SafetyReportSummary } from "@/features/safety-report/read";
import type { SavedPlace } from "@/features/profile/saved-places";
import { distanceBetween } from "@/features/map/route-geometry";

export type HomePoint = { latitude: number; longitude: number };
export const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function savedPoint(
  place: SavedPlace | null | undefined,
): HomePoint | null {
  return place && validPoint(place)
    ? { latitude: place.latitude!, longitude: place.longitude! }
    : null;
}

function validPoint(point: {
  latitude: number | null;
  longitude: number | null;
}) {
  return (
    typeof point.latitude === "number" &&
    Number.isFinite(point.latitude) &&
    Math.abs(point.latitude) <= 90 &&
    typeof point.longitude === "number" &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.longitude) <= 180
  );
}

export function nearbyReports(
  reports: SafetyReportSummary[],
  center: HomePoint | null,
  radiusKm = 10,
  now = Date.now(),
) {
  const seen = new Set<string>();
  return reports
    .flatMap((report) => {
      const observedAt = Date.parse(
        report.last_observed_at || report.created_at,
      );
      if (
        !Number.isFinite(observedAt) ||
        observedAt < now - RECENT_WINDOW_MS ||
        observedAt > now + 60_000
      )
        return [];
      const distance =
        center && validPoint(report)
          ? distanceBetween(
              [center.longitude, center.latitude],
              [report.longitude!, report.latitude!],
            )
          : null;
      if (center && (distance === null || distance > radiusKm * 1000))
        return [];
      return [{ report, distance, observedAt }];
    })
    .sort(
      (a, b) =>
        b.observedAt - a.observedAt || (a.distance ?? 0) - (b.distance ?? 0),
    )
    .filter(({ report }) => {
      const key = `${report.report_kind}:${report.event_id || report.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function reportAge(date: number, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - date) / 60_000));
  if (minutes < 1) return "À l’instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  return `Il y a ${Math.floor(minutes / 60)} h`;
}
