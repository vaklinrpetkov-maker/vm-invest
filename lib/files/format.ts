// Locale-aware file size formatter. Output shape mirrors how Bulgarian users
// see file sizes in Windows Explorer / Office:
//   - 0 B
//   - 245 B
//   - 12,3 КБ      (decimal comma per `bg-BG`)
//   - 1,8 МБ
//   - 4,2 ГБ
//
// Note we use Cyrillic abbreviations: КБ / МБ / ГБ / ТБ. Mixing English `KB`
// with Bulgarian UI text is the kind of subtle inconsistency that makes the
// product feel unpolished. Same reason we never write "Save промените"
// (CLAUDE.md §Bulgarian text conventions).

const UNITS = ["Б", "КБ", "МБ", "ГБ", "ТБ"] as const;

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 Б";

  let value = bytes;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < UNITS.length - 1) {
    value /= 1024;
    unitIdx += 1;
  }

  // Whole bytes: no decimal. Larger units: one decimal place, comma separator.
  if (unitIdx === 0) {
    return `${Math.round(value)} ${UNITS[unitIdx]}`;
  }
  const formatted = value.toLocaleString("bg-BG", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${formatted} ${UNITS[unitIdx]}`;
}
