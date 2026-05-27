// Unified validator for the Bulgarian identifier fields used on contacts:
// ЕГН (10-digit personal ID with checksum) or ЕИК (9-digit company ID).
// The same column stores either — admin-configured per-contact.
//
// Per specs/contacts.md §6: ЕГН checksum failure is a non-blocking warning, so
// we report the reason instead of a binary valid/invalid.

import { isValidEGN } from "@/lib/egn";

export type BgIdKind = "egn" | "eik" | "unknown";

export type BgIdCheck =
  | { ok: true; kind: BgIdKind }
  | { ok: false; kind: BgIdKind; reason: "length" | "checksum" | "format" };

export function checkBgId(input: string): BgIdCheck {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return { ok: false, kind: "unknown", reason: "format" };

  if (trimmed.length === 10) {
    return isValidEGN(trimmed)
      ? { ok: true, kind: "egn" }
      : { ok: false, kind: "egn", reason: "checksum" };
  }

  // 9-digit ЕИК — we don't run the ЕИК checksum yet. Real implementation is
  // possible later; for now length is enough per spec §6.
  if (trimmed.length === 9) return { ok: true, kind: "eik" };

  return { ok: false, kind: "unknown", reason: "length" };
}
