import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  getAbsenceCounts,
  getCarryoverAtRisk,
  getCompanyBalance,
  getCompanyPace,
  getOpenAnomalies,
} from "@/lib/absence/dashboard";
import { requireRole } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const ANOMALY_LABEL: Record<string, string> = {
  late_submission: "Късно подадени",
  oversize_request: "Големи заявки",
  pace_ahead: "Изпреварващ темп",
  team_overlap: "Застъпване в екипа",
};

const PACE_BG: Record<"success" | "warning" | "danger", string> = {
  success: "bg-success-50 text-success-700",
  warning: "bg-warning-50 text-warning-800",
  danger: "bg-danger-50 text-danger-700",
};

const PACE_LABEL: Record<"success" | "warning" | "danger", string> = {
  success: "В норма",
  warning: "Внимание",
  danger: "Критично",
};

function Stat({
  label,
  value,
  sublabel,
  className,
}: {
  label: string;
  value: string;
  sublabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-sm text-neutral-500">{label}</span>
      <span className="text-2xl text-neutral-900 tabular-nums font-mono">{value}</span>
      {sublabel && <span className="text-xs text-neutral-500">{sublabel}</span>}
    </div>
  );
}

export default async function AdminAbsenceDashboardPage() {
  await requireRole("admin");
  const year = new Date().getFullYear();

  const [balance, counts, anomalies, carryover] = await Promise.all([
    getCompanyBalance(year),
    getAbsenceCounts(),
    getOpenAnomalies(),
    getCarryoverAtRisk(year),
  ]);
  const pace = await getCompanyPace(year, balance);

  const paceDisplay = pace.ratio === null ? "—" : pace.ratio.toFixed(2);

  const totalOpenAnomalies = Object.values(anomalies).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-xl text-neutral-900">Отсъствия — табло</h1>
        <p className="text-base text-neutral-600">
          Преглед за {year} г. Всички числа се изчисляват при зареждане.
        </p>
      </div>

      <section className="bg-neutral-0 rounded-lg p-6 space-y-4">
        <h2 className="text-md font-medium text-neutral-900">Платен отпуск — цялата компания</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <Stat label="Общ лимит" value={String(balance.pool)} sublabel="годишни + пренесени" />
          <Stat label="Използвани" value={String(balance.taken)} />
          <Stat label="Планирани" value={String(balance.scheduled)} />
          <Stat label="Оставащи" value={String(balance.remaining)} />
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-neutral-0 rounded-lg p-6 space-y-4">
          <h2 className="text-md font-medium text-neutral-900">Кой е в отпуск</h2>
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Днес" value={String(counts.today)} />
            <Stat label="Тази седмица" value={String(counts.thisWeek)} />
            <Stat label="Този месец" value={String(counts.thisMonth)} />
          </div>
          {counts.outToday.length > 0 && (
            <ul className="pt-2 space-y-1.5 border-t border-neutral-150">
              {counts.outToday.map((p, i) => (
                <li key={i} className="flex items-center gap-2 text-base">
                  <span
                    aria-hidden="true"
                    className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: p.colorHex }}
                  />
                  <span className="text-neutral-900">{p.employeeName}</span>
                  <span className="text-neutral-500 text-sm">{p.categoryLabel}</span>
                  <span className="text-neutral-500 text-sm ml-auto">
                    до {formatDate(p.endDate)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-neutral-0 rounded-lg p-6 space-y-4">
          <h2 className="text-md font-medium text-neutral-900">Темп и риск</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-sm text-neutral-500">Темп</span>
              <div className="flex items-baseline gap-3">
                <span className="text-2xl text-neutral-900 tabular-nums font-mono">
                  {paceDisplay}
                </span>
                <span
                  className={cn(
                    "inline-block px-2 py-0.5 rounded-sm text-xs font-medium",
                    PACE_BG[pace.tone],
                  )}
                >
                  {PACE_LABEL[pace.tone]}
                </span>
              </div>
              <span className="text-xs text-neutral-500">
                използвани {(pace.usedPercent * 100).toFixed(0)}% / изтекли{" "}
                {(pace.yearElapsedPercent * 100).toFixed(0)}% от годината
              </span>
            </div>
            <Stat
              label="Пренасяне в риск"
              value={String(carryover.totalDaysAtRisk)}
              sublabel={
                carryover.employeesWithRisk > 0
                  ? `при ${carryover.employeesWithRisk} служители`
                  : "няма заплаха"
              }
            />
          </div>
        </div>
      </section>

      <section className="bg-neutral-0 rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-md font-medium text-neutral-900">Отворени аномалии</h2>
          <div className="flex items-center gap-3">
            {totalOpenAnomalies === 0 && (
              <StatusBadge tone="success">Всичко е чисто</StatusBadge>
            )}
            {totalOpenAnomalies > 0 && (
              <Link
                href="/admin/absence/anomalies"
                className="text-sm text-accent-700 hover:text-accent-800"
              >
                Прегледай →
              </Link>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {(["late_submission", "oversize_request", "pace_ahead", "team_overlap"] as const).map(
            (rule) => (
              <Stat
                key={rule}
                label={ANOMALY_LABEL[rule]}
                value={String(anomalies[rule] ?? 0)}
              />
            ),
          )}
        </div>
      </section>
    </div>
  );
}
