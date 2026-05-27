"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BG_MONTH_NAMES,
  BG_WEEKDAY_LABELS,
  chunkWeeks,
  computeNoteSpans,
} from "@/lib/absence/calendar";
import { cn } from "@/lib/cn";
import { bulkUpsertCalendarDays, bulkUpsertCalendarNotes } from "./actions";

// One cell per day. `null` cells pad the 6×7 grid before the 1st / after the
// last of each month. `holidayName`/`note`/`effectiveDayType` are carried for
// single-day prefill — the inline edit panel reads them when the selection is
// one cell.
export type CellInfo = {
  iso: string;
  day: number;
  isWeekend: boolean;
  isHoliday: boolean;
  isCompensatory: boolean;
  isAnnotatedOnly: boolean;
  hasNote: boolean;
  isToday: boolean;
  hoverLabel: string;
  holidayName: string | null;
  note: string | null;
  effectiveDayType: "holiday" | "working" | "compensatory" | null;
} | null;

export type MonthInfo = {
  month: number;
  cells: CellInfo[];
};

type Props = {
  year: number;
  months: MonthInfo[];
  locked: boolean;
};

// Selection model is intentionally simple: the user clicks once to set an
// anchor, then a second click sets the endpoint (which may be the same day,
// in which case it's a confirmed single-day selection). A third click
// restarts from a new anchor. This mirrors how every standard date-range
// picker works.
type Selection = { anchor: string; endpoint: string | null };

function isoToDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function diffDays(a: string, b: string): number {
  return Math.round((isoToDate(b).getTime() - isoToDate(a).getTime()) / 86_400_000) + 1;
}

function formatBg(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function CalendarGrid({ months, locked }: Props) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Flatten months → iso → cell for prefill lookup when a single day is
  // selected. Build once per render; the data is small (~366 entries).
  const cellByIso = new Map<string, NonNullable<CellInfo>>();
  for (const m of months) {
    for (const c of m.cells) {
      if (c) cellByIso.set(c.iso, c);
    }
  }

  // Normalised bounds: the panel always shows start ≤ end regardless of
  // click order, and the underlying server action receives them ordered.
  function bounds(sel: Selection): { start: string; end: string } {
    if (sel.endpoint === null) return { start: sel.anchor, end: sel.anchor };
    return sel.anchor <= sel.endpoint
      ? { start: sel.anchor, end: sel.endpoint }
      : { start: sel.endpoint, end: sel.anchor };
  }

  function handleCellClick(iso: string) {
    if (locked) return;
    setError(null);
    setSelection((prev) => {
      // No selection OR previous one already has an endpoint → fresh anchor.
      if (!prev || prev.endpoint !== null) {
        return { anchor: iso, endpoint: null };
      }
      // Second click — set endpoint (may equal anchor for "confirmed single").
      return { anchor: prev.anchor, endpoint: iso };
    });
  }

  function clearSelection() {
    setSelection(null);
    setError(null);
  }

  const b = selection ? bounds(selection) : null;
  const isRange = b ? b.start !== b.end : false;
  const dayCount = b ? diffDays(b.start, b.end) : 0;
  const singleCell = b && !isRange ? cellByIso.get(b.start) ?? null : null;

  // Prefill rules — mirror the old per-day form's "most likely next edit"
  // heuristic. For a single day with an existing override, prefill its current
  // type. For a single day with no override, default to the OPPOSITE of the
  // default (weekday → "holiday"; weekend → "compensatory"), since that's why
  // the admin opened the edit in the first place. For a range, "holiday" is
  // the most common bulk operation (e.g. marking a stretch as holidays).
  const defaultDayType: "holiday" | "working" | "compensatory" = singleCell
    ? singleCell.effectiveDayType ?? (singleCell.isWeekend ? "compensatory" : "holiday")
    : "holiday";
  const defaultHolidayName = singleCell?.holidayName ?? "";
  const defaultNote = singleCell?.note ?? "";

  function inSelection(iso: string): boolean {
    return !!b && iso >= b.start && iso <= b.end;
  }
  function isAnchor(iso: string): boolean {
    if (!selection) return false;
    return iso === selection.anchor || iso === selection.endpoint;
  }

  return (
    <div className="space-y-4">
      {/* Edit panel only appears when there's a selection. Sticky-top so that
          clicking a day deep in the year (e.g. October) doesn't force a scroll
          back to the header to edit. */}
      {b && (
        <div className="bg-neutral-0 rounded-lg p-5 sticky top-0 z-10 ring-1 ring-neutral-150 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-md font-medium text-neutral-900">
                {isRange
                  ? `Избран диапазон: ${formatBg(b.start)} – ${formatBg(b.end)} (${dayCount} дни)`
                  : `Избран ден: ${formatBg(b.start)}`}
              </div>
              <p className="text-sm text-neutral-500 mt-0.5">
                {isRange
                  ? "Промените се прилагат към всички дни в диапазона."
                  : selection?.endpoint === null
                    ? "Кликнете втори ден за диапазон, или редактирайте този ден по-долу."
                    : "Един ден е избран. Редактирайте по-долу или кликнете нов ден."}
              </p>
            </div>
            <button
              type="button"
              onClick={clearSelection}
              className="h-8 px-3 rounded-lg bg-neutral-100 text-base text-neutral-700 hover:bg-neutral-150 transition-colors duration-120"
            >
              Изчисти избор
            </button>
          </div>

          {/* Day-type form. Always uses the bulk action — start==end handles
              the single-day case identically. */}
          <form
            action={(formData) => {
              setError(null);
              startTransition(async () => {
                try {
                  await bulkUpsertCalendarDays(formData);
                  clearSelection();
                } catch (e) {
                  const msg = (e as Error).message;
                  if (msg && !msg.startsWith("NEXT_REDIRECT")) setError(msg);
                  else clearSelection();
                }
              });
            }}
            className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end pt-3 border-t border-neutral-100"
          >
            <input type="hidden" name="startIso" value={b.start} />
            <input type="hidden" name="endIso" value={b.end} />
            <div>
              <label
                htmlFor="dayType"
                className="block text-sm font-medium text-neutral-700 mb-1.5"
              >
                Тип на {isRange ? "дните" : "деня"}
              </label>
              <select
                id="dayType"
                name="dayType"
                key={`dt-${b.start}-${b.end}`}
                defaultValue={defaultDayType}
                className="h-9 w-full rounded-md bg-neutral-100 px-3 text-base text-neutral-900 hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120"
              >
                <option value="holiday">Почивен (празник)</option>
                <option value="working">Работен ден</option>
                <option value="compensatory">Компенсаторен работен ден</option>
                <option value="clear">Премахни override-ите</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="holidayName"
                className="block text-sm font-medium text-neutral-700 mb-1.5"
              >
                Име на празник
              </label>
              <Input
                id="holidayName"
                type="text"
                name="holidayName"
                key={`hn-${b.start}-${b.end}`}
                defaultValue={defaultHolidayName}
                placeholder="напр. Гергьовден"
              />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Прилагане…" : "Запази тип"}
            </Button>
            {isRange && (
              <label className="md:col-span-3 flex items-center gap-2 text-sm text-neutral-700">
                <input type="checkbox" name="skipWeekends" />
                Пропусни уикендите в диапазона
              </label>
            )}
          </form>

          {/* Note form */}
          <form
            action={(formData) => {
              setError(null);
              startTransition(async () => {
                try {
                  await bulkUpsertCalendarNotes(formData);
                  clearSelection();
                } catch (e) {
                  const msg = (e as Error).message;
                  if (msg && !msg.startsWith("NEXT_REDIRECT")) setError(msg);
                  else clearSelection();
                }
              });
            }}
            className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end pt-3 border-t border-neutral-100"
          >
            <input type="hidden" name="startIso" value={b.start} />
            <input type="hidden" name="endIso" value={b.end} />
            <div>
              <label
                htmlFor="note"
                className="block text-sm font-medium text-neutral-700 mb-1.5"
              >
                Бележка {isRange ? "за диапазона" : "за деня"}
              </label>
              <textarea
                id="note"
                name="note"
                rows={2}
                maxLength={200}
                key={`note-${b.start}-${b.end}`}
                defaultValue={defaultNote}
                placeholder="напр. Не сключвайте сделки"
                className="block w-full px-3 py-2 rounded-lg bg-neutral-100 text-base text-neutral-900 placeholder:text-neutral-400 tracking-tight hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120 resize-y"
              />
              <p className="text-sm text-neutral-500 mt-1.5">
                Видима за целия екип в споделения календар. Не влияе на работните дни, балансите и отсъствията. Изпратете празно, за да изтриете.
              </p>
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Прилагане…" : "Запази бележка"}
            </Button>
          </form>

          {error && <div className="text-sm text-danger-700">{error}</div>}
        </div>
      )}

      {!b && !locked && (
        <p className="text-sm text-neutral-600">
          Кликнете ден за единична редакция. Кликнете втори ден за диапазон.
        </p>
      )}
      {locked && (
        <p className="text-sm text-warning-800">
          Годината е заключена — за да редактирате, първо я отключете.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {months.map((m) => (
          <div key={m.month} className="bg-neutral-0 rounded-lg p-3">
            <div className="text-md font-medium text-neutral-900 capitalize mb-2">
              {BG_MONTH_NAMES[m.month - 1]}
            </div>
            <div className="grid grid-cols-7 mb-1">
              {BG_WEEKDAY_LABELS.map((label, i) => (
                <div
                  key={label}
                  className={cn(
                    "text-xs text-center py-1",
                    i >= 5 ? "text-neutral-400" : "text-neutral-500",
                  )}
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-0.5">
              {chunkWeeks(m.cells).map((week, wi) => {
                const spans = computeNoteSpans(week, (c) => c?.note);
                return (
                  // Each week is its own 7-col grid. Buttons sit in row 1 of
                  // that grid; note bars also target row 1 but `align-self:end`
                  // pins them to the bottom of the row so they visually overlay
                  // the lower portion of the cells. `pointer-events:none` lets
                  // clicks pass through to the day buttons underneath.
                  <div key={wi} className="grid grid-cols-7 gap-0.5">
                    {week.map((c, idx) => {
                      if (!c)
                        return (
                          <div
                            key={idx}
                            style={{ gridColumn: idx + 1, gridRow: 1 }}
                            className="h-10"
                          />
                        );
                      const selected = inSelection(c.iso);
                      const anchor = isAnchor(c.iso);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleCellClick(c.iso)}
                          disabled={locked}
                          title={c.hoverLabel || undefined}
                          aria-pressed={selected || undefined}
                          style={{ gridColumn: idx + 1, gridRow: 1 }}
                          className={cn(
                            "h-10 flex items-start justify-center pt-1 text-sm tabular-nums rounded-sm transition-colors duration-120",
                            c.isHoliday && "bg-danger-50 text-danger-700 font-medium",
                            c.isCompensatory && "bg-success-50 text-success-700 font-medium",
                            c.isAnnotatedOnly &&
                              "bg-warning-50 text-warning-800 font-medium ring-1 ring-warning-100",
                            !c.isHoliday &&
                              !c.isCompensatory &&
                              !c.isAnnotatedOnly &&
                              c.isWeekend &&
                              "text-neutral-400",
                            !c.isHoliday &&
                              !c.isCompensatory &&
                              !c.isAnnotatedOnly &&
                              !c.isWeekend &&
                              "text-neutral-700 hover:bg-neutral-100",
                            c.isToday && "ring-2 ring-accent-500/40",
                            selected && "bg-accent-50 text-accent-700",
                            anchor && "ring-2 ring-accent-500 bg-accent-100",
                            locked && "cursor-not-allowed opacity-60",
                          )}
                        >
                          {c.day}
                        </button>
                      );
                    })}
                    {spans.map((s) => (
                      <div
                        key={`note-${wi}-${s.startCol}`}
                        style={{
                          gridColumn: `${s.startCol + 1} / span ${s.spanCols}`,
                          gridRow: 1,
                          alignSelf: "end",
                        }}
                        className="relative z-10 mb-0.5 text-[10px] leading-tight px-1 py-0.5 truncate bg-warning-100 text-warning-800 rounded-sm pointer-events-none"
                        title={s.note}
                      >
                        {s.note}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
