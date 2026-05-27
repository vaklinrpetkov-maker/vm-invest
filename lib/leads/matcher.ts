import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Tiered contact matcher for email leads, per specs/leads.md §7.3.
//
// | email match | phone on match | phone match | action | confidence | flags |
// |---|---|---|---|---|---|
// | one | missing | —         | link | high (phone matches was N/A, promote to high when phones agree below) | — |
// | one | present | matches   | link | high   | — |
// | one | present | differs   | link | low    | possible_duplicate_contact |
// | many| —       | any match | link to matching | high | — |
// | many| —       | none match| link to most-recently-updated | low | multiple_email_matches |
// | none| —       | —         | create new | (null — manual leads don't carry confidence) | — |

export type MatchResult = {
  contactId: string;
  confidence: "high" | "medium" | "low" | null;
  flags: string[];
};

type Tx = Prisma.TransactionClient | typeof prisma;

export async function resolveOrCreateContactByForm(
  input: {
    email: string;
    phone: string | null;
    fullName: string;
  },
  tx: Tx = prisma,
): Promise<MatchResult> {
  const email = input.email.trim().toLowerCase();
  const phone = (input.phone ?? "").trim() || null;

  const matches = await tx.contact.findMany({
    where: { email },
    orderBy: { updatedAt: "desc" },
    select: { id: true, phone: true },
  });

  if (matches.length === 0) {
    const created = await tx.contact.create({
      data: {
        fullName: input.fullName,
        type: "Електронно запитване",
        email,
        phone,
        // createdById: null → UI renders as "Система" (see §5.1b convention).
      },
      select: { id: true },
    });
    return { contactId: created.id, confidence: null, flags: [] };
  }

  if (matches.length === 1) {
    const m = matches[0];
    if (!m.phone) {
      return { contactId: m.id, confidence: "medium", flags: [] };
    }
    if (phone && normalizePhone(m.phone) === normalizePhone(phone)) {
      return { contactId: m.id, confidence: "high", flags: [] };
    }
    // Email matches, phone differs (or inbound phone missing)
    return {
      contactId: m.id,
      confidence: "low",
      flags: ["possible_duplicate_contact"],
    };
  }

  // Multiple contacts share this email — pick the one whose phone also matches,
  // else the most recently updated (which is already first by the orderBy above).
  if (phone) {
    const phoneMatch = matches.find(
      (m) => m.phone && normalizePhone(m.phone) === normalizePhone(phone),
    );
    if (phoneMatch) {
      return { contactId: phoneMatch.id, confidence: "high", flags: [] };
    }
  }
  return {
    contactId: matches[0].id,
    confidence: "low",
    flags: ["multiple_email_matches"],
  };
}

// Very loose phone normalization. We don't require E.164 — just strip spaces,
// dashes, parentheses, leading zeros, plus signs, and country code `359` so
// "+359888123456" and "0888123456" compare equal.
function normalizePhone(raw: string): string {
  let s = raw.replace(/[\s\-().+]/g, "");
  if (s.startsWith("359")) s = s.slice(3);
  s = s.replace(/^0+/, "");
  return s;
}

