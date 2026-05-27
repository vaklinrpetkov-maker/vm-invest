// Shared URL search-param helpers, used by every module's filter parser
// (`lib/{contacts,leads,meetings,contracts,properties,renovations,tasks}/filters.ts`).
//
// Two URL conventions coexist in the app:
//   - **CSV**           `?status=a,b,c`        — most lists
//   - **Repeated-or-CSV** `?status=a&status=b` OR `?status=a,b`  — renovations
//   - **Repeated-only**  `?assignee=a&assignee=b`  — tasks (the serializer
//                         always emits repeated; the parser accepts both
//                         via repeatedOrCsvParam)
//
// Pick the helper matching the module's serializer. New modules: prefer
// `csvParam` (shorter URLs, lower confusion); reach for `repeatedOrCsvParam`
// only when the serializer needs the repeated form for downstream parsing.

export type SearchParamValue = string | string[] | undefined;

// Return the first string when a key appears multiple times in a URL.
// Use for single-value params (`q`, `from`, `to`, `page`).
export function firstParam(v: SearchParamValue): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

// CSV-only multi-value parser. Splits a single `?key=a,b,c` into ["a","b","c"].
// If the URL has repeated keys (`?key=a&key=b`), only the FIRST occurrence is
// parsed — the second `&key=b` is dropped. Use when the serializer emits CSV.
export function csvParam(v: SearchParamValue): string[] {
  const raw = firstParam(v) ?? "";
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Forgiving multi-value parser — accepts BOTH styles. Flat-maps repeated
// occurrences AND splits each by commas. Use when the serializer is repeated
// but you want CSV pasted URLs to keep working (or vice-versa).
export function repeatedOrCsvParam(v: SearchParamValue): string[] {
  if (v === undefined) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr
    .flatMap((s) => s.split(","))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Strict ISO date parser — `YYYY-MM-DD` only. Returns a UTC-midnight Date or
// null. The strict format match is deliberate: typos like `2026-5-1` are
// rejected rather than silently coerced. Used by `from`/`to` range filters
// across contacts / leads / meetings / renovations.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function parseIsoDateParam(v: SearchParamValue): Date | null {
  const s = firstParam(v);
  if (!s || !ISO_DATE_RE.test(s)) return null;
  return new Date(`${s}T00:00:00Z`);
}

// Page number with 1-based default. Clamped to >= 1, floored. Returns 1 when
// the value is missing or non-numeric. Note: the strict `Number()` parser
// rejects `"5abc"` rather than extracting `5` — closer to what users expect
// from a malformed URL.
export function parsePageParam(v: SearchParamValue): number {
  const s = firstParam(v);
  if (!s) return 1;
  const n = Number(s);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

// Single numeric param — returns null for missing/invalid. Used by range
// filters that take a min/max (`priceMin`, `floorMax`, `totalMin`, etc.).
// No clamping: callers decide what's a sensible range.
export function parseNumberParam(v: SearchParamValue): number | null {
  const s = firstParam(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Tri-state ("yes" / "no" / null) — common shape for boolean filters that
// need an explicit "either" option in the URL. Anything other than the two
// canonical strings collapses to null (= no filter applied).
export function parseTriStateParam(
  v: SearchParamValue,
): "yes" | "no" | null {
  const s = firstParam(v);
  if (s === "yes" || s === "no") return s;
  return null;
}
