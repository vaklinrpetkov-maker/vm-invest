"use server";

import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { CONTACT_SEARCH_LIMIT } from "@/lib/contacts/constants";

// Typeahead search for picking a contact in create/edit flows of other
// modules (leads, meetings, properties/owner, contracts).
//
// Plain ILIKE across fullName / phone / email / egn only. Notes are
// deliberately excluded — they hold free text (relationships, ad-hoc
// comments) that surfaces contacts for reasons the user can't see, which
// is confusing when picking an owner. Returns up to CONTACT_SEARCH_LIMIT
// results; callers surface a "refine your query" hint when the result
// count equals the limit.

export type ContactSuggestion = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
};

export async function searchContacts(query: string): Promise<ContactSuggestion[]> {
  await requireProfile();
  const q = query.trim();
  if (q.length < 2) return [];

  const rows = await prisma.contact.findMany({
    where: {
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { egn: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { fullName: "asc" },
    take: CONTACT_SEARCH_LIMIT,
    select: { id: true, fullName: true, phone: true, email: true },
  });
  return rows;
}
