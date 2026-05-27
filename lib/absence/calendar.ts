// Month-grid math for the shared calendar. Weeks start Monday (ISO / EU).
// All dates are calendar-dates (no time); UTC noon is used internally to
// avoid Europe/Sofia DST transitions flipping the day we render.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type MonthRef = { year: number; month: number }; // month 1-12

export type Cell = {
  date: Date; // UTC date
  iso: string; // YYYY-MM-DD
  day: number;
  inCurrentMonth: boolean;
};

export function currentMonthRef(): MonthRef {
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

export function parseMonthParam(value: string | undefined): MonthRef {
  if (!value) return currentMonthRef();
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return currentMonthRef();
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return currentMonthRef();
  return { year, month };
}

export function formatMonthParam({ year, month }: MonthRef): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function addMonths({ year, month }: MonthRef, delta: number): MonthRef {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

// ISO weekday with Monday = 0 … Sunday = 6. Exposed because the admin
// calendar's enrichment loop needs it standalone (raw Date, no Cell
// wrapper) to compute per-day weekend state.
export function mondayBasedWeekday(d: Date): number {
  const js = d.getUTCDay(); // Sun=0..Sat=6
  return (js + 6) % 7;
}

export function buildMonthGrid(ref: MonthRef): Cell[] {
  const firstOfMonth = new Date(Date.UTC(ref.year, ref.month - 1, 1, 12));
  const leading = mondayBasedWeekday(firstOfMonth);
  const gridStart = new Date(firstOfMonth.getTime() - leading * MS_PER_DAY);

  const cells: Cell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getTime() + i * MS_PER_DAY);
    cells.push({
      date: d,
      iso: d.toISOString().slice(0, 10),
      day: d.getUTCDate(),
      inCurrentMonth: d.getUTCMonth() === ref.month - 1 && d.getUTCFullYear() === ref.year,
    });
  }
  return cells;
}

export const BG_WEEKDAY_LABELS = ["Пон", "Вт", "Ср", "Чт", "Пет", "Съб", "Нед"] as const;

export const BG_MONTH_NAMES = [
  "януари", "февруари", "март", "април", "май", "юни",
  "юли", "август", "септември", "октомври", "ноември", "декември",
] as const;

export function formatMonthTitle({ year, month }: MonthRef): string {
  return `${BG_MONTH_NAMES[month - 1]} ${year}`;
}

// Variant of `buildMonthGrid` that pads leading/trailing slots with `null`
// instead of carrying the neighbouring months' days. Used by the admin
// year-overview where each month is rendered as its own self-contained
// 6×7 grid with empty squares before the 1st and after the last day.
//
// `month` is 1-12. Returns exactly 42 slots.
export function buildMonthCellsWithGaps(year: number, month: number): (Date | null)[] {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1, 12));
  const leading = mondayBasedWeekday(firstOfMonth);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const cells: (Date | null)[] = Array.from({ length: 42 }, () => null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells[leading + day - 1] = new Date(Date.UTC(year, month - 1, day, 12));
  }
  return cells;
}

// ─── Week chunking + note-span computation (shared layout primitives) ───
//
// Both calendar surfaces render one row per week and overlay multi-day
// notes as horizontal bars spanning consecutive cells. The chunking +
// span-extraction is identical across the two; the only per-surface
// difference is where the note text lives — in an external `noteByIso`
// map (shared calendar) or on the cell itself (admin calendar). The
// `computeNoteSpans` helper is generic over a `getNote` accessor so both
// callers reuse the same algorithm.

// Split a flat 42-slot grid into 6 rows of 7. Generic — works for `Cell[]`
// (shared calendar), `CellInfo[]` (admin calendar), or any future per-cell
// shape that needs the same layout.
export function chunkWeeks<T>(cells: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
  return out;
}

// One horizontal note bar inside a week row. Coordinates are 0-indexed
// columns; the caller translates to CSS
// `gridColumn: ${startCol+1} / span ${spanCols}`.
export type NoteSpan = {
  startCol: number;
  spanCols: number;
  note: string;
};

// Collapse a week (7 cells) into runs of consecutive cells whose notes
// match. Each run becomes one bar in the UI — same multi-day-event model
// monday.com / Google Calendar use. Runs don't cross week boundaries (the
// grid layout doesn't allow it); a 10-day note renders as two bars (one
// per week).
//
// `getNote` reads the note text from a cell; return `null` / `undefined` /
// empty for "no note here". The admin surface passes `(c) => c?.note` (the
// cell itself carries the note); the shared surface passes
// `(c) => noteByIso.get(c.iso)` (notes live in an external map).
export function computeNoteSpans<T>(
  week: T[],
  getNote: (cell: T) => string | null | undefined,
): NoteSpan[] {
  const spans: NoteSpan[] = [];
  let i = 0;
  while (i < week.length) {
    const note = getNote(week[i]);
    if (!note) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < week.length && getNote(week[j]) === note) j++;
    spans.push({ startCol: i, spanCols: j - i, note });
    i = j;
  }
  return spans;
}
