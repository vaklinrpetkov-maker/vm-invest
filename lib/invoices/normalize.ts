// Shared normalization for vendor names and line-item descriptions.
// Used on every write so the `*Normalized` columns stay consistent with their
// raw counterparts — price-history joins (specs/invoices.md §9) depend on
// this being deterministic and idempotent.
//
// Recipe: trim → lowercase → collapse whitespace runs → strip outer punctuation.
// Aggressively simple on purpose; if reconciliation gets messy we promote to
// a managed Vendor entity in Phase 2 instead of making this smarter.

export function normalizeForMatching(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    // Strip leading/trailing punctuation that varies between invoices but
    // doesn't affect identity (e.g. trailing periods, surrounding quotes).
    .replace(/^[.,;:"«»„"'`]+|[.,;:"«»„"'`]+$/g, "");
}
