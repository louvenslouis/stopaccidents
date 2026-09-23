import { accidentTypeLabels } from "../accident-report/presentation";
import type { SafetyReportSummary } from "../safety-report/read";

export type Category = "all" | "accidents" | "traffic" | "security";
export type Period = "week" | "month" | "year" | "all" | "custom";
export const categories = [
  { id: "all", label: "Tout", color: "#24252B", tint: "#EEEEF0" },
  { id: "accidents", label: "Accidents", color: "#F04F66", tint: "#FDEDF0" },
  { id: "traffic", label: "Circulation", color: "#D0780B", tint: "#FFF4DF" },
  { id: "security", label: "Sécurité", color: "#7772E8", tint: "#EFEEFC" },
] as const;
export const kindLabels: Record<SafetyReportSummary["report_kind"], string> = {
  accident: "Accident",
  barricade: "Route barricadée",
  breakdown: "Véhicule en panne",
  kidnapping: "Enlèvement",
  armed_presence: "Présence armée",
  suspicious_vehicle: "Véhicule suspect",
  gunfire: "Tirs entendus",
};
export function categoryForKind(kind: string): Exclude<Category, "all"> {
  return kind === "accident"
    ? "accidents"
    : ["barricade", "breakdown"].includes(kind)
      ? "traffic"
      : "security";
}
export function subcategories(category: Category) {
  if (category === "accidents")
    return [
      ...Object.entries(accidentTypeLabels).map(([id, label]) => ({
        id,
        label,
      })),
      { id: "unspecified", label: "Type à préciser" },
    ];
  if (category === "all") return [];
  return Object.entries(kindLabels)
    .filter(([kind]) => categoryForKind(kind) === category)
    .map(([id, label]) => ({ id, label }));
}
export type DateRange = { start: string | null; end: string };
export type Analytics = {
  total: number;
  previous_total: number | null;
  testimonies: number;
  detailed: number;
  first_date: string | null;
  updated_at: string;
  categories: { category: Exclude<Category, "all">; count: number }[];
  kinds: { kind: SafetyReportSummary["report_kind"]; count: number }[];
  daily: { date: string; count: number }[];
  hours: { hour: number; count: number }[];
  severity: { severity: string; count: number }[];
  territories: {
    unlocated: number;
    unlocated_departments: number;
    departments: { code: string; name: string; count: number }[];
    communes: {
      code: string;
      name: string;
      department_code: string;
      department_name: string;
      count: number;
    }[];
  };
  reports: (SafetyReportSummary & {
    commune_code: string | null;
    commune_name: string | null;
    department_code: string | null;
    department_name: string | null;
  })[];
};
export function haitiToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Port-au-Prince",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function periodRange(
  period: Period,
  offset = 0,
  today = haitiToday(),
): DateRange {
  if (period === "all") return { start: null, end: today };
  const days = period === "week" ? 7 : period === "year" ? 365 : 30;
  const end = shiftDate(today, offset * days);
  return { start: shiftDate(end, 1 - days), end };
}
export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function validateRange(
  start: string,
  end: string,
  today = haitiToday(),
) {
  if (!validDate(start) || !validDate(end))
    return "Utilisez le format AAAA-MM-JJ pour les deux dates.";
  if (start > end) return "La date de début doit précéder la date de fin.";
  if (end > today)
    return "Choisissez une date de fin au plus tard aujourd’hui.";
  return null;
}
export const numberLabel = (value: number) => value.toLocaleString("fr-FR");
export function dateLabel(value: string, year = false) {
  const day = value.length > 10 ? haitiToday(new Date(value)) : value;
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    ...(year ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}
export function rangeLabel(range: DateRange) {
  return range.start
    ? `${dateLabel(range.start, range.start.slice(0, 4) !== range.end.slice(0, 4))} – ${dateLabel(range.end, true)}`
    : "Depuis le premier signalement";
}
export type ChartBucket = {
  key: string;
  label: string;
  count: number;
  start: string;
  end: string;
};
export function chartBuckets(
  daily: Analytics["daily"],
  range: DateRange,
  firstDate: string | null,
): ChartBucket[] {
  const start = range.start ?? firstDate ?? range.end;
  const days = Math.max(
    1,
    Math.round((Date.parse(range.end) - Date.parse(start)) / 86400000) + 1,
  );
  const size = Math.max(1, Math.ceil(days / 31));
  const counts = new Map<number, number>();
  for (const item of daily) {
    if (item.date < start || item.date > range.end) continue;
    const index = Math.floor(
      (Date.parse(item.date) - Date.parse(start)) / 86400000 / size,
    );
    counts.set(index, (counts.get(index) ?? 0) + item.count);
  }
  return Array.from({ length: Math.ceil(days / size) }, (_, index) => {
    const from = shiftDate(start, index * size);
    const to = shiftDate(start, Math.min(days - 1, (index + 1) * size - 1));
    return {
      key: from,
      label:
        from === to ? dateLabel(from) : `${dateLabel(from)} – ${dateLabel(to)}`,
      count: counts.get(index) ?? 0,
      start: from,
      end: to,
    };
  });
}
