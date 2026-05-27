// Pure math + axis helpers for the Gantt chart components. No React, no
// Prisma — just date arithmetic. Both the per-task chart (renovation detail
// page) and the portfolio chart (`/renovations` list view) share these.
//
// All dates are passed in as ISO-day strings (`YYYY-MM-DD`) or `Date`
// objects normalised to midnight UTC. The viewport math operates in days
// since a reference epoch — float-percent positions are then computed
// against the viewport range.

const DAY_MS = 24 * 60 * 60 * 1000;

export type DateRange = {
  start: Date | null;
  end: Date | null;
};

export type Viewport = {
  start: Date; // inclusive
  end: Date; // inclusive (so a 1-day viewport has start === end)
  // Days from `start` to `end` inclusive (always >= 1).
  totalDays: number;
};

// Compute the viewport bounding the supplied ranges, with a `padDays` cushion
// on each side. Returns `null` when no ranges have any dates at all.
// `extraDates` lets callers force the viewport to include specific markers
// (e.g. the renovation's planned start/end even when no task has dates).
export function computeViewport(
  ranges: ReadonlyArray<DateRange>,
  opts?: { padDays?: number; extraDates?: ReadonlyArray<Date | null | undefined> },
): Viewport | null {
  const padDays = opts?.padDays ?? 7;
  const dates: Date[] = [];
  for (const r of ranges) {
    if (r.start) dates.push(r.start);
    if (r.end) dates.push(r.end);
  }
  for (const d of opts?.extraDates ?? []) {
    if (d) dates.push(d);
  }
  if (dates.length === 0) return null;
  let min = dates[0].getTime();
  let max = dates[0].getTime();
  for (const d of dates) {
    const t = d.getTime();
    if (t < min) min = t;
    if (t > max) max = t;
  }
  const start = new Date(min - padDays * DAY_MS);
  const end = new Date(max + padDays * DAY_MS);
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1);
  return { start, end, totalDays };
}

// Returns the float-percent left position [0..100] of a date inside the
// viewport. Clamps to [0, 100] — callers can use `pctInside` to check
// whether a value was clipped before relying on the result.
export function dayPct(date: Date, viewport: Viewport): number {
  const diff = (date.getTime() - viewport.start.getTime()) / DAY_MS;
  const pct = (diff / Math.max(1, viewport.totalDays - 1)) * 100;
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return pct;
}

export function pctInside(date: Date, viewport: Viewport): boolean {
  return (
    date.getTime() >= viewport.start.getTime() &&
    date.getTime() <= viewport.end.getTime()
  );
}

// Width of a [start..end] segment inside the viewport, as a percentage.
// Either endpoint missing → minimum bar width (a small visual stub so the
// row isn't invisible). Both missing → 0 (caller renders an empty state).
export function rangePct(
  range: DateRange,
  viewport: Viewport,
): { leftPct: number; widthPct: number } {
  if (!range.start && !range.end) return { leftPct: 0, widthPct: 0 };
  // If only one endpoint is set, render a 4-day stub centered on it so the
  // row is visible without claiming a range we don't have.
  const STUB_DAYS = 4;
  if (range.start && !range.end) {
    const left = dayPct(range.start, viewport);
    const stubWidth = (STUB_DAYS / Math.max(1, viewport.totalDays - 1)) * 100;
    return { leftPct: left, widthPct: Math.min(100 - left, stubWidth) };
  }
  if (!range.start && range.end) {
    const right = dayPct(range.end, viewport);
    const stubWidth = (STUB_DAYS / Math.max(1, viewport.totalDays - 1)) * 100;
    return {
      leftPct: Math.max(0, right - stubWidth),
      widthPct: Math.min(stubWidth, right),
    };
  }
  // Both present.
  const left = dayPct(range.start!, viewport);
  const right = dayPct(range.end!, viewport);
  return {
    leftPct: left,
    // Always render at least 0.5% so a same-day range has a visible dot.
    widthPct: Math.max(0.5, right - left),
  };
}

// Axis tick generator. Picks an adaptive stride based on the viewport span
// so we end up with ~6–12 evenly-spaced labels. Returns the label position
// (pct) + the Bulgarian-formatted text to display.
//
// Stride rules:
//   - viewport ≤ 30 days   → tick every 5 days
//   - viewport ≤ 90 days   → tick every 14 days
//   - viewport ≤ 365 days  → tick at the 1st of each month
//   - viewport > 365 days  → tick at the 1st of every other month
export type AxisTick = { pct: number; label: string; isStrong: boolean };

const BG_MONTHS_SHORT = [
  "ян",
  "фев",
  "март",
  "апр",
  "май",
  "юни",
  "юли",
  "авг",
  "сеп",
  "окт",
  "ное",
  "дек",
];

function fmtTick(d: Date, withYear: boolean): string {
  const dd = d.getUTCDate();
  const m = BG_MONTHS_SHORT[d.getUTCMonth()];
  const y = d.getUTCFullYear();
  return withYear ? `${dd} ${m} ${y}` : `${dd} ${m}`;
}

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function computeAxisTicks(viewport: Viewport): AxisTick[] {
  const ticks: AxisTick[] = [];
  const showYear =
    viewport.start.getUTCFullYear() !== viewport.end.getUTCFullYear();

  if (viewport.totalDays <= 30) {
    // Every 5 days starting at viewport.start (UTC-aligned).
    let cursor = startOfDayUTC(viewport.start);
    while (cursor.getTime() <= viewport.end.getTime()) {
      if (cursor.getTime() >= viewport.start.getTime()) {
        ticks.push({
          pct: dayPct(cursor, viewport),
          label: fmtTick(cursor, showYear),
          isStrong: cursor.getUTCDate() === 1,
        });
      }
      cursor = new Date(cursor.getTime() + 5 * DAY_MS);
    }
  } else if (viewport.totalDays <= 90) {
    // Every 14 days.
    let cursor = startOfDayUTC(viewport.start);
    while (cursor.getTime() <= viewport.end.getTime()) {
      if (cursor.getTime() >= viewport.start.getTime()) {
        ticks.push({
          pct: dayPct(cursor, viewport),
          label: fmtTick(cursor, showYear),
          isStrong: cursor.getUTCDate() === 1,
        });
      }
      cursor = new Date(cursor.getTime() + 14 * DAY_MS);
    }
  } else {
    // Monthly (or every other month for very long ranges).
    const everyOther = viewport.totalDays > 365;
    let cursor = startOfMonthUTC(viewport.start);
    // Skip the first month if it's before the viewport so the leftmost tick
    // is still inside.
    if (cursor.getTime() < viewport.start.getTime()) {
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
    let i = 0;
    while (cursor.getTime() <= viewport.end.getTime()) {
      if (i % (everyOther ? 2 : 1) === 0) {
        ticks.push({
          pct: dayPct(cursor, viewport),
          label: fmtTick(cursor, showYear),
          isStrong: cursor.getUTCMonth() === 0, // Jan = year boundary
        });
      }
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
      i++;
    }
  }

  return ticks;
}

// Today as a UTC-midnight Date — used by the chart to draw the "сега" line.
// Exposed separately so tests can stub it.
export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
