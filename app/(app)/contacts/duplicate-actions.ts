"use server";

import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

// Duplicate-detection lookup for the contact form. Exact match only on any of
// phone, email, or ЕГН/ЕИК per specs/contacts.md §5.1. Fuzzy name matching is
// explicitly out of scope (too many false positives on Bulgarian name variants).
//
// Pass `excludeId` when editing so the current contact doesn't match itself.

export type DuplicateMatch = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  egn: string | null;
};

export async function findPotentialDuplicates(input: {
  phone?: string | null;
  email?: string | null;
  egn?: string | null;
  excludeId?: string | null;
}): Promise<DuplicateMatch[]> {
  await requireProfile();

  const orClauses = [] as Array<Record<string, unknown>>;
  const phone = input.phone?.trim();
  const email = input.email?.trim().toLowerCase();
  const egn = input.egn?.trim();

  if (phone) orClauses.push({ phone });
  if (email) orClauses.push({ email });
  if (egn) orClauses.push({ egn });
  if (orClauses.length === 0) return [];

  const matches = await prisma.contact.findMany({
    where: {
      OR: orClauses,
      ...(input.excludeId ? { NOT: { id: input.excludeId } } : {}),
    },
    select: { id: true, fullName: true, phone: true, email: true, egn: true },
    take: 5,
  });
  return matches;
}
