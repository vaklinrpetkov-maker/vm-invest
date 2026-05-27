// Canonical seller-name normalization. Applied:
//   - by the migration script (one-time, against existing CSV-imported data)
//   - by /admin/sellers when the admin merges values
//   - by the property form on save (so newly typed variants get auto-fixed)
//
// Rules are substring matches (case-insensitive), applied in order — first
// match wins. Anything that matches no rule is passed through trimmed and
// untouched, so the admin can keep cleaning incrementally via /admin/sellers.
//
// Per user direction:
//   - "Сердика пропърти" (anywhere) → "Сердика пропърти"
//   - "Пулев" or "Pulev"           → "Pulev Invest Group"
//   - "Росед"                       → "Росед Пропърти ЕООД"
//   - "Яско Про"                    → "Яско Про Сървиз"
//   - "ВМИнвест" / "VM Invest" / "VMInvest" → "VMInvest"
//
// Multi-seller input (comma-separated) is split BEFORE normalization, so each
// chunk gets its own rule check. "VMInvest, Петро Инвест ООД" → ["VMInvest",
// "Петро Инвест ООД"].

type Rule = { pattern: RegExp; canonical: string };

const RULES: Rule[] = [
  // The order matters when patterns can overlap. None of these do for the
  // current rule set, but be defensive — most-specific first.
  { pattern: /сердика\s*пропърти/i, canonical: "Сердика пропърти" },
  { pattern: /pulev|пулев/i,         canonical: "Pulev Invest Group" },
  { pattern: /росед/i,                canonical: "Росед Пропърти ЕООД" },
  { pattern: /яско\s*про/i,          canonical: "Яско Про Сървиз" },
  // VM variants — accept "ВМ Инвест", "ВМИнвест", "VM Invest", "VMInvest",
  // and combinations with optional EOOD suffix. Treat lowercase v/m letters
  // and the cyrillic в/м as interchangeable in this single canonical name.
  { pattern: /(вм\s*инвест|v\s*m\s*invest|vminvest)/i, canonical: "VMInvest" },
];

// Normalize one raw seller value. Returns trimmed canonical form if a rule
// matches, otherwise the trimmed input as-is.
export function normalizeSeller(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";
  for (const rule of RULES) {
    if (rule.pattern.test(trimmed)) return rule.canonical;
  }
  return trimmed;
}

// Split a raw input string (possibly comma-separated) into a deduplicated
// array of normalized seller values. Empty pieces dropped.
//
// Usage:
//   parseSellerInput("VMInvest, Пулев")         → ["VMInvest", "Pulev Invest Group"]
//   parseSellerInput("ВМ Инвест ЕООД")           → ["VMInvest"]
//   parseSellerInput("Сердика Пропърти Инвест")  → ["Сердика пропърти"]
//   parseSellerInput("")                          → []
//   parseSellerInput(null)                        → []
export function parseSellerInput(raw: string | null | undefined): string[] {
  if (raw === null || raw === undefined) return [];
  const pieces = raw
    .split(",")
    .map((p) => normalizeSeller(p))
    .filter((p) => p.length > 0);
  // Dedupe while preserving first-occurrence order.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of pieces) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

