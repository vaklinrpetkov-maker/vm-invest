"use client";

// Per-team daily-load strip rendered beneath the renovation Gantt. One row
// per team referenced by the renovation's activities. Each day cell shows
// the team's load on that day (across the whole portfolio); cells where
// load exceeds the team's `totalPeople` get a red tint. Aligned to the same
// viewport as the parent Gantt by sharing the `Viewport` value.
//
// See `specs/renovations.md` §6.4 + §8.

import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { dayPct, type Viewport } from "@/lib/gantt";

const DAY_MS = 24 * 60 * 60 * 1000;

export type TeamCapacityStripRow = {
  teamId: string;
  name: string;
  specialty: string | null;
  totalPeople: number;
  // ISO-day → daily load. Sparse — days with no load are absent.
  loadByDay: ReadonlyMap<string, number>;
};

type Props = {
  viewport: Viewport;
  teams: ReadonlyArray<TeamCapacityStripRow>;
  // Shared label-column width with the parent Gantt for alignment.
  labelWidthPx?: number;
  // Cell height. Strip rows are shorter than Gantt rows by default — only a
  // number to render.
  rowHeightPx?: number;
};

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Iterate every ISO-day in `[from, to]` inclusive.
function* eachDayIso(from: Date, to: Date): Generator<string> {
  let cursor = utcMidnight(from).getTime();
  const stop = utcMidnight(to).getTime();
  while (cursor <= stop) {
    yield isoDay(new Date(cursor));
    cursor += DAY_MS;
  }
}

export function TeamCapacityStrip({
  viewport,
  teams,
  labelWidthPx = 200,
  rowHeightPx = 28,
}: Props) {
  // Pre-compute the days array + dayWidth pct once for the whole strip.
  const days = useMemo(() => {
    const out: { iso: string; leftPct: number }[] = [];
    for (const iso of eachDayIso(viewport.start, viewport.end)) {
      const d = new Date(`${iso}T00:00:00Z`);
      out.push({ iso, leftPct: dayPct(d, viewport) });
    }
    return out;
  }, [viewport]);
  const dayWidthPct = 100 / Math.max(1, viewport.totalDays - 1);

  if (teams.length === 0) return null;

  return (
    <div className="rounded-lg bg-neutral-0 ring-1 ring-neutral-150 overflow-x-auto">
      <div className="px-3 py-2 border-b border-neutral-150 text-sm text-neutral-700">
        Капацитет на екипи (дневно натоварване в обхвата на ремонта)
      </div>
      {teams.map((team) => (
        <div
          key={team.teamId}
          className="grid border-b border-neutral-150 last:border-b-0"
          style={{
            gridTemplateColumns: `${labelWidthPx}px 1fr`,
            height: rowHeightPx,
          }}
        >
          <div className="flex items-center justify-between gap-2 px-2 border-r border-neutral-150 bg-neutral-0 text-sm">
            <span className="truncate text-neutral-900" title={team.name}>
              {team.specialty ?? team.name}
            </span>
            <span className="text-xs text-neutral-500 tabular-nums shrink-0">
              / {team.totalPeople}
            </span>
          </div>
          <div className="relative">
            {days.map(({ iso, leftPct }) => {
              const load = team.loadByDay.get(iso) ?? 0;
              if (load === 0) return null;
              const over = load > team.totalPeople;
              return (
                <div
                  key={iso}
                  className={cn(
                    "absolute top-0 bottom-0 flex items-center justify-center text-[10px] tabular-nums",
                    over
                      ? "bg-danger-200 text-danger-800"
                      : "bg-neutral-100 text-neutral-700",
                  )}
                  style={{
                    left: `${leftPct}%`,
                    width: `${dayWidthPct}%`,
                    minWidth: 1,
                  }}
                  title={`${iso}: ${load} / ${team.totalPeople}`}
                >
                  {/* Hide the number when the cell is too narrow to read. */}
                  {dayWidthPct >= 1.5 ? load : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
