// TS-side mirror of absence.fn_working_days — used for live preview on the
// submit form. The DB function is the source of truth; this exists so the UI
// doesn't need to round-trip on every keystroke.
//
// Default fallback matches the SQL: Mon–Fri are working days unless overridden
// by a calendar_days entry. Pass a `holidayMap` (`YYYY-MM-DD` → isWorking) when
// you have it loaded for the relevant year.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isWeekday(d: Date): boolean {
  const dow = d.getUTCDay(); // 0 = Sun, 6 = Sat
  return dow !== 0 && dow !== 6;
}

function isWorkingDay(d: Date, holidayMap?: Record<string, boolean>): boolean {
  if (holidayMap) {
    const override = holidayMap[toIsoDate(d)];
    if (override !== undefined) return override;
  }
  return isWeekday(d);
}

export type WorkingDaysInput = {
  start: Date;
  end: Date;
  startHalf?: boolean;
  endHalf?: boolean;
  holidayMap?: Record<string, boolean>;
};

export function countWorkingDays({
  start,
  end,
  startHalf = false,
  endHalf = false,
  holidayMap,
}: WorkingDaysInput): number {
  if (end < start) return 0;

  let total = 0;
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());

  while (cursor.getTime() <= endUtc) {
    if (isWorkingDay(cursor, holidayMap)) total += 1;
    cursor.setTime(cursor.getTime() + MS_PER_DAY);
  }

  if (startHalf && isWorkingDay(start, holidayMap)) total -= 0.5;
  if (endHalf && end.getTime() !== start.getTime() && isWorkingDay(end, holidayMap)) {
    total -= 0.5;
  }

  return Math.max(total, 0);
}
