"use client";

// Read-only Gantt chart shared between the per-task view (renovation detail
// page) and the portfolio view (`/renovations` list). Pure CSS bars — no
// drag-to-reschedule per the locked Phase-2 decision.
//
// Each row in `rows` becomes one bar. Rows with no dates at all are listed
// in a "Без дати" side panel below the chart (so the user knows they
// exist but can't be plotted yet). The today indicator is a vertical
// accent line; the axis ticks adapt to the viewport span (day stride for
// short ranges, monthly for long ones).
//
// Layout: two-column CSS grid — label column (fixed width) + timeline
// column (flex-1, position: relative for bar + today positioning).

import { useMemo } from "react";
import type { BadgeTone } from "@/components/ui/status-badge";
import { cn } from "@/lib/cn";
import {
  computeAxisTicks,
  computeViewport,
  rangePct,
  dayPct,
  pctInside,
  todayUtc,
  type Viewport,
} from "@/lib/gantt";

export type GanttRow = {
  id: string;
  label: string;
  sublabel?: string;
  start: Date | null;
  end: Date | null;
  tone: BadgeTone;
  // Optional click target — when present the row label becomes a link.
  href?: string;
  // Optional small text appended after the bar (e.g. "5 / 12" progress).
  badge?: string;
  // When true, the bar renders with a danger-tone left border to flag a
  // slip (used by renovation activities whose endDate < today and status
  // is neither done nor cancelled). See `specs/renovations.md` §6.4.
  overdue?: boolean;
};

type Props = {
  rows: ReadonlyArray<GanttRow>;
  // Extra dates that should be inside the viewport even if no row covers
  // them — e.g. the renovation's planned start/end on the per-task chart.
  extraDates?: ReadonlyArray<Date | null | undefined>;
  // Padding around the data range, in days. Default 7.
  padDays?: number;
  // Override the timeline label-column width. Default 200px.
  labelWidthPx?: number;
  // Override row height. Default 32px.
  rowHeightPx?: number;
  // ISO-day strings to render as vertical red bands across every row.
  // Used by the renovation Gantt views to flag team-capacity overage days
  // (specs/renovations.md §8). Days outside the viewport are silently
  // skipped.
  dangerDays?: ReadonlyArray<string>;
  // Optional viewport override — when provided, skips the internal
  // computeViewport(rows, extraDates) call and uses this directly. Used by
  // callers that need to align a sibling (e.g. per-team capacity strip)
  // with this chart's day positions.
  viewport?: Viewport | null;
};

// Tailwind classes per tone for the bar fill. The palette in
// `tailwind.config.ts` only defines `{50,100,500,700/800}` shades for
// success/warning/danger/info — using the 100-shade gives a soft fill
// visibly above the row's background stripe without requiring new
// design tokens. Neutral + accent have the full Tailwind-style scale.
const BAR_TONE: Record<BadgeTone, string> = {
  neutral: "bg-neutral-300",
  success: "bg-success-100",
  warning: "bg-warning-100",
  "warning-soft": "bg-warning-50",
  danger: "bg-danger-100",
  info: "bg-info-100",
  accent: "bg-accent-300",
  "neutral-outline": "bg-neutral-150 border border-dashed border-neutral-400",
};

export function GanttChart({
  rows,
  extraDates,
  padDays = 7,
  labelWidthPx = 200,
  rowHeightPx = 32,
  dangerDays,
  viewport: viewportOverride,
}: Props) {
  const computedViewport = useMemo<Viewport | null>(
    () =>
      computeViewport(
        rows.map((r) => ({ start: r.start, end: r.end })),
        { padDays, extraDates },
      ),
    [rows, padDays, extraDates],
  );
  const viewport = viewportOverride !== undefined ? viewportOverride : computedViewport;

  const ticks = useMemo(
    () => (viewport ? computeAxisTicks(viewport) : []),
    [viewport],
  );

  // Pre-compute the left-percent for each danger day so each row can render
  // its strips without recomputing per-row. Width = one viewport-day wide.
  const dangerStrips = useMemo<ReadonlyArray<{ leftPct: number; widthPct: number }>>(() => {
    if (!viewport || !dangerDays || dangerDays.length === 0) return [];
    const dayWidth = 100 / Math.max(1, viewport.totalDays - 1);
    const out: { leftPct: number; widthPct: number }[] = [];
    for (const iso of dangerDays) {
      const d = new Date(`${iso}T00:00:00Z`);
      if (!pctInside(d, viewport)) continue;
      out.push({ leftPct: dayPct(d, viewport), widthPct: dayWidth });
    }
    return out;
  }, [viewport, dangerDays]);

  const today = todayUtc();
  const todayInView = viewport ? pctInside(today, viewport) : false;
  const todayPct = viewport && todayInView ? dayPct(today, viewport) : null;

  // Split the rows: ones that can be plotted (any date) and ones that can't
  // (no dates at all — surfaced in the "Без дати" panel below).
  const plotted = rows.filter((r) => r.start !== null || r.end !== null);
  const undated = rows.filter((r) => r.start === null && r.end === null);

  if (viewport === null) {
    // No dates anywhere — chart is empty. Render the "Без дати" list only.
    return (
      <UndatedPanel rows={rows} />
    );
  }

  return (
    <div className="space-y-3">
      <div
        className="overflow-x-auto rounded-lg bg-neutral-0 ring-1 ring-neutral-150"
        // Min-width keeps the chart legible on narrower viewports — scroll
        // horizontally instead of squashing.
        style={{ minWidth: 0 }}
      >
        {/* Axis header */}
        <div
          className="grid border-b border-neutral-150"
          style={{
            gridTemplateColumns: `${labelWidthPx}px 1fr`,
            height: rowHeightPx,
          }}
        >
          <div className="bg-neutral-50 border-r border-neutral-150" />
          <div className="relative">
            {ticks.map((t, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 flex items-center"
                style={{ left: `${t.pct}%`, transform: "translateX(-50%)" }}
              >
                <span
                  className={cn(
                    "text-xs px-1 whitespace-nowrap",
                    t.isStrong ? "text-neutral-700 font-medium" : "text-neutral-500",
                  )}
                >
                  {t.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Rows */}
        <div>
          {plotted.map((r) => {
            const { leftPct, widthPct } = rangePct(
              { start: r.start, end: r.end },
              viewport,
            );
            return (
              <div
                key={r.id}
                className="grid border-b border-neutral-150 last:border-b-0 hover:bg-neutral-50/40 transition-colors duration-120"
                style={{
                  gridTemplateColumns: `${labelWidthPx}px 1fr`,
                  height: rowHeightPx,
                }}
              >
                <div className="flex items-center px-2 border-r border-neutral-150 bg-neutral-0">
                  {r.href ? (
                    <a
                      href={r.href}
                      className="block w-full"
                      title={r.label}
                    >
                      <div className="truncate text-sm text-neutral-900 hover:text-accent-700 transition-colors duration-120">
                        {r.label}
                      </div>
                      {r.sublabel && (
                        <div className="truncate text-xs text-neutral-500">
                          {r.sublabel}
                        </div>
                      )}
                    </a>
                  ) : (
                    <div title={r.label} className="block w-full">
                      <div className="truncate text-sm text-neutral-900">
                        {r.label}
                      </div>
                      {r.sublabel && (
                        <div className="truncate text-xs text-neutral-500">
                          {r.sublabel}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="relative">
                  {/* Danger-day strips — vertical red bands flagging
                     team-capacity overage days. Rendered behind the bar
                     fill so the bar's tone stays readable on top. */}
                  {dangerStrips.map((s, i) => (
                    <div
                      key={`danger-${i}`}
                      className="absolute top-0 bottom-0 bg-danger-100/70 pointer-events-none"
                      style={{
                        left: `${s.leftPct}%`,
                        width: `${s.widthPct}%`,
                        minWidth: 1,
                      }}
                    />
                  ))}
                  {/* Tick gridlines (faint vertical guides) */}
                  {ticks.map((t, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-l border-neutral-100"
                      style={{ left: `${t.pct}%` }}
                    />
                  ))}
                  {/* Today line */}
                  {todayPct !== null && (
                    <div
                      className="absolute top-0 bottom-0 border-l-2 border-accent-500/60 pointer-events-none"
                      style={{ left: `${todayPct}%` }}
                      title="Днес"
                    />
                  )}
                  {/* The bar */}
                  {widthPct > 0 && (
                    <div
                      className={cn(
                        "absolute top-1/2 -translate-y-1/2 h-5 rounded flex items-center px-2 overflow-hidden",
                        // Overdue activities get a danger-tone left border
                        // per `specs/renovations.md` §6.4. Matches the row
                        // border style used by the activity list editor.
                        r.overdue && "border-l-4 border-danger-500",
                      )}
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        minWidth: 4,
                      }}
                    >
                      <div
                        className={cn(
                          "absolute inset-0 rounded",
                          BAR_TONE[r.tone],
                        )}
                      />
                      {r.badge && (
                        <span className="relative text-xs text-neutral-700 tabular-nums truncate">
                          {r.badge}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend row */}
      {(todayInView || dangerStrips.length > 0) && (
        <div className="flex items-center gap-4 text-xs text-neutral-500 flex-wrap">
          {todayInView && (
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 border-t-2 border-accent-500/60" />
              Днес
            </div>
          )}
          {dangerStrips.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 bg-danger-100/70 rounded-sm" />
              Превишен капацитет ({dangerStrips.length} {dangerStrips.length === 1 ? "ден" : "дни"})
            </div>
          )}
        </div>
      )}

      {/* Undated side panel */}
      {undated.length > 0 && <UndatedPanel rows={undated} />}
    </div>
  );
}

function UndatedPanel({ rows }: { rows: ReadonlyArray<GanttRow> }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg bg-neutral-50 p-3 space-y-1.5">
      <h3 className="text-sm text-neutral-700 font-medium">
        Без дати ({rows.length})
      </h3>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.id} className="text-sm">
            {r.href ? (
              <a
                href={r.href}
                className="text-neutral-900 hover:text-accent-700 transition-colors duration-120"
              >
                {r.label}
              </a>
            ) : (
              <span className="text-neutral-900">{r.label}</span>
            )}
            {r.sublabel && (
              <span className="text-neutral-500 ml-2 text-xs">{r.sublabel}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
