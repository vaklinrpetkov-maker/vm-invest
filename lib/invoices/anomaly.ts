// Price-anomaly detector for invoice line items.
//
// Per specs/invoices.md §9, the rule is:
//   For each line item on an invoice, find the most recent prior line item
//   matching (vendorNameNormalized, descriptionNormalized) where the prior
//   invoice's date falls in the past 30 days and is strictly before the
//   current invoice's date. If current_price > 1.05 × prior_price, flag the
//   line item with the percentage delta and the prior invoice's id.
//
// The detector is **informational only** — it never blocks an upload and
// never sends emails. The flag surfaces in the table (left-border + ⚠ icon)
// and in the price-history tab on the detail page.
//
// Idempotency: calling this multiple times on the same invoice produces the
// same end state. Below-threshold or no-comparable-prior cases clear any
// stale anomaly fields, so editing a unit price down un-flags a previously
// flagged row automatically.

import { prisma } from "@/lib/prisma";

// 5% per spec §9. If the materials team finds this too noisy we'll promote
// to a per-item-category threshold (Phase 2 / specs/invoices.md §17).
const ANOMALY_THRESHOLD_RATIO = 1.05;

// 30-day window. Anchored on the current invoice's `invoiceDate` so editing
// the date later re-runs against the right window if we re-invoke.
const WINDOW_DAYS = 30;

export type DetectionResult = {
  flagged: number;
  cleared: number;
  considered: number;
};

export async function detectAnomaliesForInvoice(
  invoiceId: string,
): Promise<DetectionResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      invoiceDate: true,
      vendorNameNormalized: true,
      lineItems: {
        select: {
          id: true,
          descriptionNormalized: true,
          unitPrice: true,
          priceAnomalyPct: true,
        },
      },
    },
  });
  if (!invoice) return { flagged: 0, cleared: 0, considered: 0 };

  // 30-day floor at midnight UTC. invoiceDate is a `@db.Date` column (no
  // time component) so the comparison stays clean.
  const windowStart = new Date(invoice.invoiceDate);
  windowStart.setUTCDate(windowStart.getUTCDate() - WINDOW_DAYS);

  let flagged = 0;
  let cleared = 0;

  for (const li of invoice.lineItems) {
    // Match-by-normalized-description across all prior invoices with the same
    // normalized vendor in the window. `findFirst` ordered by date desc gives
    // us the most recent comparable record.
    const prior = await prisma.invoiceLineItem.findFirst({
      where: {
        descriptionNormalized: li.descriptionNormalized,
        invoiceId: { not: invoice.id },
        invoice: {
          vendorNameNormalized: invoice.vendorNameNormalized,
          invoiceDate: { gte: windowStart, lt: invoice.invoiceDate },
        },
      },
      orderBy: { invoice: { invoiceDate: "desc" } },
      select: {
        id: true,
        unitPrice: true,
        invoice: { select: { id: true } },
      },
    });

    if (!prior) {
      // No comparable prior in the window — clear any stale flag.
      if (li.priceAnomalyPct !== null) {
        await prisma.invoiceLineItem.update({
          where: { id: li.id },
          data: { priceAnomalyPct: null, priceAnomalyRefInvoiceId: null },
        });
        cleared++;
      }
      continue;
    }

    const currentPrice = Number(li.unitPrice);
    const priorPrice = Number(prior.unitPrice);
    // Defensive: a zero or negative prior price would div-by-zero or produce
    // garbage. Skip the comparison and clear any stale flag.
    if (priorPrice <= 0) {
      if (li.priceAnomalyPct !== null) {
        await prisma.invoiceLineItem.update({
          where: { id: li.id },
          data: { priceAnomalyPct: null, priceAnomalyRefInvoiceId: null },
        });
        cleared++;
      }
      continue;
    }

    const ratio = currentPrice / priorPrice;
    if (ratio > ANOMALY_THRESHOLD_RATIO) {
      // Above threshold → flag (or refresh the flag if it already existed).
      const pct = ((currentPrice - priorPrice) / priorPrice) * 100;
      await prisma.invoiceLineItem.update({
        where: { id: li.id },
        data: {
          priceAnomalyPct: Math.round(pct * 100) / 100,
          priceAnomalyRefInvoiceId: prior.invoice.id,
        },
      });
      flagged++;
    } else if (li.priceAnomalyPct !== null) {
      // Below threshold but had a flag from a previous run — clear.
      await prisma.invoiceLineItem.update({
        where: { id: li.id },
        data: { priceAnomalyPct: null, priceAnomalyRefInvoiceId: null },
      });
      cleared++;
    }
  }

  return {
    flagged,
    cleared,
    considered: invoice.lineItems.length,
  };
}

// Best-effort wrapper. The detector is informational — if it throws (transient
// DB error, deadlock with another write), we log and move on. The data is
// recoverable on the next edit or by re-running explicitly.
export async function detectAnomaliesSafe(invoiceId: string): Promise<void> {
  try {
    const r = await detectAnomaliesForInvoice(invoiceId);
    if (r.flagged > 0 || r.cleared > 0) {
      console.info("[invoices.anomaly]", { invoiceId, ...r });
    }
  } catch (err) {
    console.error("[invoices.anomaly] detection failed", { invoiceId, err });
  }
}
