// KPI strip at the top of `/renovations`. Four tiles — same layout shape
// the Invoices dashboard uses. Each tile shows a label + count; the
// Просрочени tile flips to danger-tone when the count is non-zero.
//
// Server component — receives the pre-computed KPIs from the page. No
// client interactivity needed.

import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/lib/cn";
import type { RenovationKpis } from "@/lib/renovations/queries";

type Props = {
  kpis: RenovationKpis;
  // Pass-through label for the period dimension — e.g. "За филтрите" when
  // filters are active, "За цялата компания" otherwise. Surfaces beneath
  // the strip so the user knows what these numbers represent.
  scope: string;
};

export function RenovationsKpiStrip({ kpis, scope }: Props) {
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Tile
          label="Активни проекти"
          value={kpis.activeProjects}
          sublabel="Оферта · Одобрена · В процес"
        />
        <Tile
          label="В процес сега"
          value={kpis.inProgressNow}
          sublabel={
            kpis.inProgressNow === 0
              ? "—"
              : `${kpis.inProgressOpenActivities} открити ${kpis.inProgressOpenActivities === 1 ? "дейност" : "дейности"}`
          }
        />
        <Tile
          label="Просрочени"
          value={kpis.overdue}
          tone={kpis.overdue > 0 ? "danger" : "neutral"}
          sublabel="План. край преди днес"
        />
        <Tile
          label="Превишен капацитет"
          value={kpis.capacityOverageDaysNext90}
          tone={kpis.capacityOverageDaysNext90 > 0 ? "danger" : "neutral"}
          sublabel="Дни в следващите 90"
          // Spec §5.4 #4: click → portfolio Gantt scrolled to first overage.
          // Only linked when count > 0 (no point navigating for 0).
          href={
            kpis.capacityOverageDaysNext90 > 0
              ? ("/renovations?view=gantt#overage" as Route)
              : undefined
          }
        />
        <Tile
          label="Завършени тримесечие"
          value={kpis.completedThisQuarter}
          sublabel={currentQuarterLabel()}
        />
      </div>
      <p className="text-xs text-neutral-500">{scope}</p>
    </div>
  );
}

function Tile({
  label,
  value,
  sublabel,
  tone = "neutral",
  href,
}: {
  label: string;
  value: number;
  sublabel?: string;
  tone?: "neutral" | "danger";
  href?: Route;
}) {
  const body = (
    <>
      <div
        className={cn(
          "text-sm",
          tone === "danger" && value > 0 ? "text-danger-700" : "text-neutral-500",
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "text-2xl tabular-nums font-medium mt-1",
          tone === "danger" && value > 0 ? "text-danger-700" : "text-neutral-900",
        )}
      >
        {value}
      </div>
      {sublabel && (
        <div
          className={cn(
            "text-xs mt-1",
            tone === "danger" && value > 0 ? "text-danger-700/70" : "text-neutral-400",
          )}
        >
          {sublabel}
        </div>
      )}
    </>
  );
  const tileClass = cn(
    "rounded-lg p-4 ring-1 transition-colors duration-120",
    tone === "danger" && value > 0
      ? "bg-danger-50 ring-danger-200"
      : "bg-neutral-0 ring-neutral-150",
    // Subtle hover affordance when the tile is clickable.
    href && "hover:ring-2 cursor-pointer block",
  );
  if (href) {
    return (
      <Link href={href} className={tileClass}>
        {body}
      </Link>
    );
  }
  return <div className={tileClass}>{body}</div>;
}

const BG_QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

function currentQuarterLabel(): string {
  const now = new Date();
  const qIdx = Math.floor(now.getUTCMonth() / 3);
  return `${BG_QUARTERS[qIdx]} ${now.getUTCFullYear()}`;
}
