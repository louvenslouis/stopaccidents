import type { RouteShape } from './routing';

export const ROUTE_TIMEZONE = 'America/Port-au-Prince';
export const WEEKDAYS = [
  { value: 1, short: 'Lun', label: 'Lundi' },
  { value: 2, short: 'Mar', label: 'Mardi' },
  { value: 3, short: 'Mer', label: 'Mercredi' },
  { value: 4, short: 'Jeu', label: 'Jeudi' },
  { value: 5, short: 'Ven', label: 'Vendredi' },
  { value: 6, short: 'Sam', label: 'Samedi' },
  { value: 7, short: 'Dim', label: 'Dimanche' },
] as const;

export type RouteSchedule = {
  name: string;
  departureTime: string;
  weekdays: number[];
  timezone: string;
  durationMinutes: number;
  leadMinutes: number;
  alertsEnabled: boolean;
};
export type SavedRoute = RouteSchedule & {
  id: string;
  shape: RouteShape;
};
export type RouteAlert = {
  id: string;
  route_id: string;
  route_name: string;
  report_kind: string;
  report_id: string;
  location: string;
  occurred_at: string;
  read_at: string | null;
};

export function defaultSchedule(shape: RouteShape): RouteSchedule {
  return {
    name: '', departureTime: '07:00', weekdays: [1, 2, 3, 4, 5],
    timezone: ROUTE_TIMEZONE,
    durationMinutes: Math.max(5, Math.min(240, Math.ceil(shape.durationSeconds / 300) * 5)),
    leadMinutes: 30, alertsEnabled: true,
  };
}

export function validateSchedule(schedule: RouteSchedule): string | null {
  if (typeof schedule.name !== 'string' || !schedule.name.trim() || schedule.name.trim().length > 80)
    return 'Nommez votre trajet (80 caractères maximum).';
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(schedule.departureTime))
    return 'Indiquez une heure valide au format HH:MM.';
  if (!Array.isArray(schedule.weekdays) || !schedule.weekdays.length || new Set(schedule.weekdays).size !== schedule.weekdays.length ||
    schedule.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7))
    return 'Choisissez les jours de votre trajet.';
  if (!Number.isInteger(schedule.durationMinutes) || schedule.durationMinutes < 5 || schedule.durationMinutes > 240)
    return 'La durée du trajet doit être comprise entre 5 et 240 minutes.';
  if (![0, 15, 30, 60].includes(schedule.leadMinutes))
    return 'Choisissez un délai d’alerte valide.';
  if (typeof schedule.timezone !== 'string' || !schedule.timezone.trim())
    return 'Le fuseau horaire du trajet est invalide.';
  try { new Intl.DateTimeFormat('fr', { timeZone: schedule.timezone }); }
  catch { return 'Le fuseau horaire du trajet est invalide.'; }
  return null;
}

export function scheduleDays(days: number[]) {
  if (days.length === 7) return 'Tous les jours';
  if (days.length === 5 && [1, 2, 3, 4, 5].every((day) => days.includes(day))) return 'Lun – Ven';
  return WEEKDAYS.filter((day) => days.includes(day.value)).map((day) => day.short).join(' · ');
}
