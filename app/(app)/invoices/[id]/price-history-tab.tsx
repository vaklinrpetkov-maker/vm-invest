import Link from "next/link";
import type { Route } from "next";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatEUR } from "@/lib/format";
import { cn } from "@/lib/cn";

// История на цените tab — per line item on the current invoice, show the
// last 5 prices the same (vendorNameNormalized, descriptionNormalized) combo
// charged across all prior invoices. Renders chronological list.
//
// The sparkline is intentionally not drawn in Round 3 — adding a charting
// dep just for a 5-point trend isn't worth it; the percentage-change pill
// per row carries the same information and reads more clearly. Add a
// sparkline only if a real user asks.

export type PriceHistoryEntry = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDateIso: string;
  unitPrice: number;
  unit: string;
};

export type LineItemHistory = {
  lineItemId: string;
  description: string;
  currentUnitPrice: number;
  currentUnit: string;
  priceAnomalyPct: number | null;
  history: PriceHistoryEntry[];
};

type Props = {
  lineItems: LineItemHistory[];
  vendorName: string;
};

export function PriceHistoryTab({ lineItems, vendorName }: Props) {
  if (lineItems.length === 0) {
    return (
      <div className="bg-neutral-0 rounded-lg p-6 text-base text-neutral-600">
        Тази фактура няма извлечени позиции.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-500">
        Сравнение на цените на позициите от тази фактура с предишните фактури от
        същия доставчик ({vendorName}). Показани са до 5 предишни записа на позиция.
      </p>

      <div className="space-y-3">
        {lineItems.map((li) => (
          <PriceHistoryRow key={li.lineItemId} item={li} />
        ))}
      </div>
    </div>
  );
}

function PriceHistoryRow({ item }: { item: LineItemHistory }) {
  const hasHistory = item.history.length > 0;

  return (
    <section
      className={cn(
        "bg-neutral-0 rounded-lg p-4 space-y-3",
        item.priceAnomalyPct !== null && "ring-1 ring-warning-200",
      )}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-md font-medium text-neutral-900">{item.description}</h3>
          <p className="text-sm text-neutral-500 mt-0.5">
            Текуща цена: <strong className="text-neutral-900 tabular-nums">{formatEUR(item.currentUnitPrice)}</strong>{" "}
            / {item.currentUnit}
          </p>
        </div>
        {item.priceAnomalyPct !== null && (
          <StatusBadge tone="warning">
            +{item.priceAnomalyPct.toFixed(1)}% спрямо последния запис
          </StatusBadge>
        )}
      </div>

      {!hasHistory ? (
        <p className="text-sm text-neutral-500 italic">
          Няма предишни данни за тази позиция.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-500 border-b border-neutral-150">
                <th className="py-1.5 pr-2 font-medium">Дата</th>
                <th className="py-1.5 px-2 font-medium">Фактура</th>
                <th className="py-1.5 px-2 font-medium text-right">Ед. цена</th>
                <th className="py-1.5 px-2 font-medium text-right">Промяна</th>
              </tr>
            </thead>
            <tbody>
              {item.history.map((row, idx) => {
                // Δ vs the *immediately newer* row in the list. The first
                // row (idx=0) is compared against the current invoice's
                // unit price; subsequent rows are compared against the
                // row above them in the chronological order (descending).
                const baselinePrice =
                  idx === 0 ? item.currentUnitPrice : item.history[idx - 1].unitPrice;
                const delta =
                  baselinePrice > 0
                    ? ((row.unitPrice - baselinePrice) / baselinePrice) * 100
                    : 0;
                return (
                  <tr key={row.invoiceId} className="border-b border-neutral-100">
                    <td className="py-1.5 pr-2 tabular-nums text-neutral-600">
                      {row.invoiceDateIso}
                    </td>
                    <td className="py-1.5 px-2">
                      <Link
                        href={`/invoices/${row.invoiceId}` as Route}
                        className="text-neutral-900 hover:underline"
                      >
                        №{row.invoiceNumber}
                      </Link>
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums">
                      {formatEUR(row.unitPrice)} / {row.unit}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-neutral-500">
                      {/* Negative delta means the price went UP from row → baseline,
                          so this row was cheaper. Phrase in terms of the row's
                          relationship to the newer entry: "older was X% cheaper". */}
                      {delta === 0 ? "—" : formatDelta(-delta)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatDelta(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}
