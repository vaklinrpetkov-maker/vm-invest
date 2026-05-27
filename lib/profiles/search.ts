"use server";

import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

// Typeahead search for picking an active team member ("Profile") in other
// modules' forms. Currently used by the contract create/edit form to assign
// the deal consultant ("Консултант на сделката"). Future modules — task
// assignment, lead routing, "My Work" — will share the same picker shape.
//
// Match is ILIKE across `fullName` + `email`. Deactivated profiles are
// excluded so the picker doesn't suggest people who have left the company;
// they remain visible on existing records (the FK is left intact).

const PROFILE_SEARCH_LIMIT = 20;

export type ProfileSuggestion = {
  id: string;
  fullName: string;
  email: string;
  role: "admin" | "manager" | "user";
};

export async function searchProfiles(query: string): Promise<ProfileSuggestion[]> {
  await requireProfile();
  const q = query.trim();
  if (q.length < 1) return [];

  const rows = await prisma.profile.findMany({
    where: {
      active: true,
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { fullName: "asc" },
    take: PROFILE_SEARCH_LIMIT,
    select: { id: true, fullName: true, email: true, role: true },
  });

  return rows;
}

