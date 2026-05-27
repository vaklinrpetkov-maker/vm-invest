// Date math for the /meetings/calendar views. All week logic is Monday-first
// (Bulgarian convention). The output `Date` values are UTC-midnight tokens
// representing the calendar day — we don't carry time-of-day here because the
// grid itself renders hours from the meeting rows.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type CalendarView = "week" | "month";

export function isCalendarView(v: string): v is CalendarView {
  return v === "week" || v === "month";
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseAnchorDate(raw: string | undefined): Date {
  // Param format: YYYY-MM-DD. If missing/invalid, return today at UTC midnight.
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T00:00:00Z`);
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Monday-based weekday: 0 = Mon .. 6 = Sun.
export function mondayWeekday(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}

export function startOfWeek(anchor: Date): Date {
  const wd = mondayWeekday(anchor);
  return new Date(anchor.getTime() - wd * MS_PER_DAY);
}

export function endOfWeek(anchor: Date): Date {
  const start = startOfWeek(anchor);
  return new Date(start.getTime() + 7 * MS_PER_DAY);
}

export function weekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * MS_PER_DAY));
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY);
}

export function addMonths(d: Date, months: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()));
}

export function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

// Build a 6×7 grid of dates for a month view, Monday-first, with leading/
// trailing days from adjacent months to fill the grid.
export function monthGrid(anchor: Date): Date[] {
  const first = startOfMonth(anchor);
  const leading = mondayWeekday(first);
  const gridStart = new Date(first.getTime() - leading * MS_PER_DAY);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

// Labels for the day headers (Пн/Вт/Ср/Чт/Пт/Сб/Нд).
export const WEEKDAY_SHORT_BG = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"] as const;

// Format a week range like "21 – 27 апр. 2026" or when the week spans two
// months: "28 апр. – 4 май 2026".
const MONTH_SHORT_BG = [
  "яну.",
  "февр.",
  "март",
  "апр.",
  "май",
  "юни",
  "юли",
  "авг.",
  "септ.",
  "окт.",
  "ноем.",
  "дек.",
];

export function formatWeekRange(anchor: Date): string {
  const start = startOfWeek(anchor);
  const end = addDays(start, 6);
  const sM = start.getUTCMonth();
  const eM = end.getUTCMonth();
  const sY = start.getUTCFullYear();
  const eY = end.getUTCFullYear();
  if (sY === eY && sM === eM) {
    return `${start.getUTCDate()} – ${end.getUTCDate()} ${MONTH_SHORT_BG[sM]} ${sY}`;
  }
  if (sY === eY) {
    return `${start.getUTCDate()} ${MONTH_SHORT_BG[sM]} – ${end.getUTCDate()} ${MONTH_SHORT_BG[eM]} ${sY}`;
  }
  return `${start.getUTCDate()} ${MONTH_SHORT_BG[sM]} ${sY} – ${end.getUTCDate()} ${MONTH_SHORT_BG[eM]} ${eY}`;
}

const MONTH_LONG_BG = [
  "януари",
  "февруари",
  "март",
  "април",
  "май",
  "юни",
  "юли",
  "август",
  "септември",
  "октомври",
  "ноември",
  "декември",
];

export function formatMonthTitle(anchor: Date): string {
  return `${MONTH_LONG_BG[anchor.getUTCMonth()]} ${anchor.getUTCFullYear()}`;
}

// Europe/Sofia wall-clock extraction from a stored UTC Date. Used by the week
// view to position meeting bars in the grid.
export function sofiaParts(d: Date): {
  iso: string; // YYYY-MM-DD (Sofia)
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const hour = Number(map.hour === "24" ? "00" : map.hour);
  return {
    iso: `${map.year}-${map.month}-${map.day}`,
    hour,
    minute: Number(map.minute),
  };
}
