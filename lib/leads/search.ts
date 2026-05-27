"use server";

import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export type LeadSuggestion = {
  id: string;
  contactName: string;
  status: string;
  firstProperty: string | null;
};

// Typeahead search for picking a Lead from modules that reference them
// (meetings in Phase 1; contracts later). Excludes soft-deleted and
// converted leads — those are terminal states and you can't attach a new
// meeting to them.
export async function searchLeads(query: string): Promise<LeadSuggestion[]> {
  await requireProfile();
  const q = query.trim();
  if (q.length < 2) return [];

  const rows = await prisma.lead.findMany({
    where: {
      deletedAt: null,
      status: { not: "converted" },
      OR: [
        { contact: { fullName: { contains: q, mode: "insensitive" } } },
        { contact: { phone: { contains: q, mode: "insensitive" } } },
        { contact: { email: { contains: q, mode: "insensitive" } } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      status: true,
      properties: true,
      contact: { select: { fullName: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    contactName: r.contact.fullName,
    status: r.status,
    firstProperty: r.properties[0] ?? null,
  }));
}
