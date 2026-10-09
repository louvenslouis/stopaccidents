import type { Coordinates } from '@/features/accident-report/model';

export type ReportContext = {
  visitedStep?: number;
  sourceReportId?: string;
  locationSource?: 'device' | 'manual';
  occurredAt?: string;
  minutesAgo?: number;
};
export type ManualReportContext = {
  locationSource: 'manual';
  occurredAt: string;
  minutesAgo?: number;
  coordinates: Coordinates;
  location: string;
};

export const REPORT_TIME_STEP_MINUTES = 15;
export const MAX_REPORT_AGE_MINUTES = 180;
export const REPORT_TIME_STEPS = MAX_REPORT_AGE_MINUTES / REPORT_TIME_STEP_MINUTES;

export function validMinutesAgo(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= MAX_REPORT_AGE_MINUTES && value % REPORT_TIME_STEP_MINUTES === 0;
}
export function reportTimeAt(minutesAgo: number, now = Date.now()) {
  return new Date(now - minutesAgo * 60_000).toISOString();
}
export function reportTimeIndex(offset: number, spacing: number) {
  return Math.max(0, Math.min(REPORT_TIME_STEPS, Math.round(offset / spacing)));
}

export function validManualContext(draft: ReportContext & { coordinates: Coordinates | null }, now = Date.now()) {
  const point = draft.coordinates;
  const time = Date.parse(draft.occurredAt ?? '');
  return draft.locationSource === 'manual' && !!point &&
    Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 &&
    Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180 &&
    Number.isFinite(time) && time <= now &&
    (draft.minutesAgo !== undefined
      ? validMinutesAgo(draft.minutesAgo)
      : now - time <= MAX_REPORT_AGE_MINUTES * 60_000);
}

/** One deadline shared by radio changes and manual presses. */
export function publicationCountdown(onComplete: () => void, onProgress: (value: number) => void,
  now = Date.now, schedule = setInterval, unschedule = clearInterval) {
  const started = now();
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    unschedule(timer);
    onComplete();
  };
  const timer = schedule(() => {
    const progress = Math.min(1, (now() - started) / 6000);
    onProgress(progress);
    if (progress === 1) finish();
  }, 40);
  return { finish, cancel: () => { finished = true; unschedule(timer); } };
}
