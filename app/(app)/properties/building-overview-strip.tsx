"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/cn";
import {
  PROPERTY_STATUS_TONES,
  type PropertyStatus,
} from "@/lib/properties/constants";
import type { BuildingOverview } from "@/lib/buildings/queries";

// Header strip shown above the properties table when the user has filtered
// to exactly one building via the navigator. Pure read-only aggregates;
// collapsible and remembered per-user via localStorage. See
// specs/properties.md §4.4.

const STORAGE_KEY = "properties:overview-collapsed";

function formatEur(raw: string | null): string {
  if (raw === null) return "—";
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString("bg-BG", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function BuildingOverviewStrip({ overview }: { overview: BuildingOverview }) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null) setCollapsed(raw === "1");
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed, hydrated]);

  const soldLabel =
    overview.soldCount === 0
      ? "—"
      : `${formatEur(overview.soldTotalPriceEur)} · ${overview.soldCount} ${
          overview.soldCount === 1 ? "имот" : "имота"
        }`;

  return (
    <section className="bg-neutral-0 rounded-xl border border-neutral-150">
      <header className="flex items-center justify-between px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-base font-medium text-neutral-900">
            {overview.displayName}
          </h2>
          <span className="text-sm text-neutral-500 tabular-nums">
            {overview.total} {overview.total === 1 ? "имот" : "имота"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((x) => !x)}
          className="text-sm text-neutral-500 hover:text-neutral-900 transition-colors"
          aria-expanded={!collapsed}
        >
          {collapsed ? "Покажи" : "Скрий"}
        </button>
      </header>

      {!collapsed && (
        <div className="px-5 pb-5 space-y-4">
          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Общо" value={overview.total.toString()} />
            <Kpi
              label="Свободни"
              value={overview.available.toString()}
              tone="success"
            />
            <Kpi label="Продадени" value={overview.soldCount.toString()} />
            <Kpi
              label="Обща сума (продадени)"
              value={soldLabel}
              wide
            />
          </div>

          {/* Per-status + per-type pill rows */}
          {overview.byStatus.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs uppercase tracking-tight text-neutral-500">
                По статус
              </div>
              <div className="flex flex-wrap gap-1.5">
                {overview.byStatus.map((row) => (
                  <StatusBadge
                    key={row.status}
                    tone={
                      PROPERTY_STATUS_TONES[row.status as PropertyStatus] ??
                      "neutral"
                    }
                  >
                    {row.status}
                    <span className="ml-1.5 text-neutral-500 tabular-nums">
                      {row.count}
                    </span>
                  </StatusBadge>
                ))}
              </div>
            </div>
          )}

          {overview.byType.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs uppercase tracking-tight text-neutral-500">
                По тип
              </div>
              <div className="flex flex-wrap gap-1.5">
                {overview.byType.map((row) => (
                  <StatusBadge key={row.type} tone="neutral">
                    {row.type}
                    <span className="ml-1.5 text-neutral-500 tabular-nums">
                      {row.count}
                    </span>
                  </StatusBadge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Kpi({
  label,
  value,
  tone,
  wide,
}: {
  label: string;
  value: string;
  tone?: "success";
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg bg-neutral-50 px-3 py-2.5",
        wide && "md:col-span-1",
      )}
    >
      <div className="text-xs text-neutral-500">{label}</div>
      <div
        className={cn(
          "text-lg font-medium tabular-nums mt-0.5",
          tone === "success" ? "text-success-700" : "text-neutral-900",
        )}
      >
        {value}
      </div>
    </div>
  );
}
