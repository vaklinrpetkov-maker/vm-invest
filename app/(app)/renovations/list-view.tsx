"use client";

// Tab toggle wrapping the renovations list + portfolio Gantt. Default view
// is Таблица; toggling to Гант swaps for a chart where each renovation is
// one bar from plannedStart → plannedEnd tinted by status.
//
// Tab state is component-local — the filters bar above already lives at
// URL level, and the user typically toggles view once per session.

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ColumnPicker,
  useColumnVisibility,
} from "@/components/ui/column-picker";
import { GanttChart, type GanttRow } from "@/components/ui/gantt-chart";
import type { PersonOption } from "@/components/ui/inline-person-cell";
import type { BadgeTone } from "@/components/ui/status-badge";
import { cn } from "@/lib/cn";
import { RENOVATION_STATUS_TONES } from "@/lib/renovations/constants";
import {
  RENOVATIONS_COLUMNS,
  RenovationsTable,
  type RenovationListRowVm,
} from "./renovations-table";

type Props = {
  rows: RenovationListRowVm[];
  // Active-profile list — feeds the inline manager picker on each table row.
  managerOptions: PersonOption[];
  // ISO-day strings flagged by the cross-portfolio capacity check — rendered
  // as red vertical bands on the Gantt tab (`specs/renovations.md` §5.3 +
  // §8). Empty when capacity is clean OR no rows have planned ranges.
  dangerDays?: ReadonlyArray<string>;
  // Admin-only row delete affordance (R12).
  canDelete: boolean;
};

type Tab = "table" | "gantt";

export function RenovationsListView({ rows, managerOptions, dangerDays, canDelete }: Props) {
  // Initial tab honours `?view=gantt` — used by the КПИ tile's
  // "Превишен капацитет" click-through so the user lands directly on the
  // bands (spec §5.4 #4).
  const searchParams = useSearchParams();
  const initialTab: Tab = searchParams.get("view") === "gantt" ? "gantt" : "table";
  const [tab, setTab] = useState<Tab>(initialTab);
  const ganttContainerRef = useRef<HTMLDivElement | null>(null);

  // Per-user column visibility for the Таблица view — localStorage-backed
  // via the shared primitive. Empty when first loaded; rehydrates async
  // from localStorage on mount (hydration flicker is invisible since the
  // defaults already match the spec's "default columns" list).
  const columnVisibility = useColumnVisibility(
    "renovations:visible-columns",
    RENOVATIONS_COLUMNS,
  );

  // When we land via the KPI click-through (`#overage` hash), scroll the
  // first red band into view once the Gantt has rendered. One-shot — only
  // runs on initial mount when the hash is present + Gantt is active.
  useEffect(() => {
    if (tab !== "gantt") return;
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#overage") return;
    const container = ganttContainerRef.current;
    if (!container) return;
    const firstBand = container.querySelector(".bg-danger-100\\/70") as HTMLElement | null;
    if (firstBand) {
      firstBand.scrollIntoView({ behavior: "smooth", inline: "center" });
    }
  }, [tab]);

  const ganttRows = useMemo<GanttRow[]>(
    () =>
      rows.map((r) => ({
        id: r.id,
        // Derived label — no separate title column in the template-driven
        // model. Same string shape as the detail-page header.
        label: `${r.propertyBuilding} · ${r.propertyName}`,
        sublabel: r.managerName ?? undefined,
        start: r.plannedStartIso ? new Date(`${r.plannedStartIso}T00:00:00Z`) : null,
        end: r.plannedEndIso ? new Date(`${r.plannedEndIso}T00:00:00Z`) : null,
        tone: RENOVATION_STATUS_TONES[r.status] as BadgeTone,
        href: `/renovations/${r.id}`,
        badge:
          r.activityTotal > 0 ? `${r.activityDone}/${r.activityTotal}` : undefined,
      })),
    [rows],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        {tab === "table" && (
          <ColumnPicker
            columns={RENOVATIONS_COLUMNS}
            visible={columnVisibility.state}
            onToggle={columnVisibility.toggle}
          />
        )}
        <div className="inline-flex rounded-md bg-neutral-100 p-0.5">
          <TabButton
            current={tab}
            value="table"
            onClick={() => setTab("table")}
          >
            Таблица
          </TabButton>
          <TabButton
            current={tab}
            value="gantt"
            onClick={() => setTab("gantt")}
          >
            Гант
          </TabButton>
        </div>
      </div>

      {tab === "table" ? (
        <RenovationsTable
          rows={rows}
          managerOptions={managerOptions}
          visible={columnVisibility.state}
          canDelete={canDelete}
        />
      ) : (
        <div ref={ganttContainerRef} id="overage">
          <GanttChart rows={ganttRows} labelWidthPx={260} dangerDays={dangerDays} />
        </div>
      )}
    </div>
  );
}

function TabButton({
  current,
  value,
  onClick,
  children,
}: {
  current: Tab;
  value: Tab;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "px-3 py-1 rounded text-sm transition-colors duration-120",
        active
          ? "bg-neutral-0 text-neutral-900 shadow-sm"
          : "text-neutral-600 hover:text-neutral-900",
      )}
    >
      {children}
    </button>
  );
}
