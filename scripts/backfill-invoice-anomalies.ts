// One-off backfill — runs the price-anomaly detector across every existing
// invoice. Useful when:
//   - Round 4 ships and prior invoices were uploaded under Round 2 (no
//     detector ran at the time), so their flags need populating.
//   - The threshold or window changes and historical state needs refreshing.
//
// Run from the project root:
//   npm run invoices:backfill-anomalies
//
// Safe to re-run any time; idempotent. Prints a summary at the end.

import { detectAnomaliesForInvoice } from "@/lib/invoices/anomaly";
import { prisma } from "@/lib/prisma";

async function main() {
  const invoices = await prisma.invoice.findMany({
    select: { id: true, vendorName: true, invoiceNumber: true, invoiceDate: true },
    // Oldest first so flagged-against references always resolve to a row
    // we've already processed in this run. (Order doesn't actually matter
    // for correctness since the detector queries the live DB, but it makes
    // the progress output readable.)
    orderBy: { invoiceDate: "asc" },
  });

  console.log(`[backfill] processing ${invoices.length} invoices`);

  let totalFlagged = 0;
  let totalCleared = 0;
  let totalConsidered = 0;

  for (const inv of invoices) {
    const r = await detectAnomaliesForInvoice(inv.id);
    totalFlagged += r.flagged;
    totalCleared += r.cleared;
    totalConsidered += r.considered;
    if (r.flagged > 0 || r.cleared > 0) {
      console.log(
        `  ${inv.invoiceDate.toISOString().slice(0, 10)} №${inv.invoiceNumber} — ` +
          `${inv.vendorName}: flagged=${r.flagged} cleared=${r.cleared} of ${r.considered}`,
      );
    }
  }

  console.log(
    `[backfill] done. flagged=${totalFlagged} cleared=${totalCleared} considered=${totalConsidered}`,
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[backfill] failed", err);
  process.exit(1);
});
