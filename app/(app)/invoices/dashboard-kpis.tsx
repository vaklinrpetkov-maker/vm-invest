import { cn } from "@/lib/cn";
import { formatEUR } from "@/lib/format";

// Top-of-page KPI strip on /invoices. Per the user's original PRD ("3-4
// vital metrics, keep it short"), we show four tiles:
//
//   1. Обща стойност за месеца / периода — sum of invoice totals over the
//      current period. When no date filter is active, this is the current
//      calendar month and includes a delta vs last month. When a date
//      filter IS active, the tile relabels to "за периода" and shows the
//      date range; the delta is dropped (no apples-to-apples comparison).
//   2. Чакащи плащане          — count + sum of `pending` invoices.
//   3. Просрочени               — subset of pending with dueDate < today.
//   4. Ценови сигнали           — count of invoices with at least one
//                                 flagged line item.
//
// All tiles aggregate over the same `where` clause as the list below, so
// the dashboard reacts dynamically to filters (section, uploader, "Само мои",
// search, date range, anomalies-only). The status filter is deliberately
// ignored by the Pending and Overdue tiles — see page.tsx for the reasoning.

export type DashboardKpisProps = {
  thisPeriod: { total: number; count: number };
  // Null when a date filter is active — the month-over-month delta makes
  // no sense against a custom date window.
  lastMonth: { total: number } | null;
  // When the user has applied a date filter, this carries the range as a
  // human-readable label (e.g. "01.09.2025 – 30.09.2025"). Used as the
  // subtitle of tile 1 in place of the delta.
  periodLabel: string | null;
  pending: { total: number; count: number };
  overdue: { total: number; count: number };
  anomalyInvoiceCount: number;
};

export function DashboardKpis({
  thisPeriod,
  lastMonth,
  periodLabel,
  pending,
  overdue,
  anomalyInvoiceCount,
}: DashboardKpisProps) {
  // Delta vs last month: percentage change, with the same edge-case rule the
  // rest of the app uses (last value 0 → no comparison possible, show count).
  const delta =
    lastMonth && lastMonth.total > 0
      ? ((thisPeriod.total - lastMonth.total) / lastMonth.total) * 100
      : null;

  const tile1Label = periodLabel
    ? "Обща стойност за периода"
    : "Обща стойност за месеца";

  let tile1Sub: string;
  if (periodLabel) {
    tile1Sub = periodLabel;
  } else if (delta === null) {
    tile1Sub = `${thisPeriod.count} ${pluralInvoice(thisPeriod.count)} този месец`;
  } else {
    tile1Sub = `${deltaLabel(delta)} спрямо миналия месец`;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Tile label={tile1Label} value={formatEUR(thisPeriod.total)} sub={tile1Sub} />
      <Tile
        label="Чакащи плащане"
        value={`${pending.count} ${pluralInvoice(pending.count)}`}
        sub={pending.count > 0 ? formatEUR(pending.total) : "—"}
      />
      <Tile
        label="Просрочени"
        value={`${overdue.count} ${pluralInvoice(overdue.count)}`}
        sub={overdue.count > 0 ? formatEUR(overdue.total) : "—"}
        tone={overdue.count > 0 ? "danger" : "neutral"}
      />
      <Tile
        label="Ценови сигнали"
        value={`${anomalyInvoiceCount} ${pluralInvoice(anomalyInvoiceCount)}`}
        sub={
          anomalyInvoiceCount > 0
            ? "с поне една флагната позиция"
            : "Няма необичайни цени."
        }
        tone={anomalyInvoiceCount > 0 ? "warning" : "neutral"}
      />
    </div>
  );
}

type Tone = "neutral" | "warning" | "danger" | "success";

function Tile({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: Tone;
}) {
  return (
    <div className="bg-neutral-0 rounded-lg p-4 flex flex-col gap-1">
      <span className="text-sm text-neutral-500">{label}</span>
      <span
        className={cn(
          "text-2xl tabular-nums font-mono",
          tone === "neutral" && "text-neutral-900",
          tone === "warning" && "text-warning-800",
          tone === "danger" && "text-danger-700",
          tone === "success" && "text-success-700",
        )}
      >
        {value}
      </span>
      <span className="text-xs text-neutral-500">{sub}</span>
    </div>
  );
}

function deltaLabel(pct: number): string {
  const rounded = Math.abs(pct).toFixed(0);
  if (pct >= 0) return `↑ ${rounded}%`;
  return `↓ ${rounded}%`;
}

// Bulgarian plural for "фактура" — singular for n=1, plural otherwise.
// (Russian/Bulgarian numerical agreement is more nuanced than this for some
// cases, but for "1 фактура / N фактури" the rule is binary and matches the
// canonical forms in bg-copy.md §9.1.)
function pluralInvoice(n: number): string {
  return n === 1 ? "фактура" : "фактури";
}
