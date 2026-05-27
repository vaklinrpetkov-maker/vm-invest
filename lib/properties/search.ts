"use server";

import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

// Typeahead search for picking properties in other modules' create/edit
// flows (currently: the contract create form). Returns the building's
// display name + the property name + entrance + floor so the picker can
// distinguish co-located units like "Ап.1 вх.А" vs "Ап.1 вх.Б".
//
// Match is ILIKE across `Property.name`, `Building.displayName`, and
// `Building.storageName` — covers both "Ап.12" + "Асеневци" queries. Soft-
// deleted rows are filtered out. Result count is capped to keep the
// dropdown manageable.

// Local constant — not exported because Next.js 15 only allows async
// function exports from "use server" files. Inlined since nothing outside
// this module needs the value.
const PROPERTY_SEARCH_LIMIT = 20;

export type PropertySuggestion = {
  id: string;
  name: string;
  buildingDisplayName: string;
  // Entrance + floor are surfaced so the picker can tell apart two
  // properties with the same name across different entrances ("Ап.1 вх.А"
  // vs "Ап.1 вх.Б"), which is common in vminvest's buildings.
  entrance: string | null;
  floor: number | null;
  status: string;
  type: string;
};

export async function searchProperties(query: string): Promise<PropertySuggestion[]> {
  await requireProfile();
  const q = query.trim();
  if (q.length < 2) return [];

  const rows = await prisma.property.findMany({
    where: {
      deletedAt: null,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { building: { displayName: { contains: q, mode: "insensitive" } } },
        { building: { storageName: { contains: q, mode: "insensitive" } } },
      ],
    },
    orderBy: [
      { building: { displayName: "asc" } },
      { entrance: "asc" },
      { name: "asc" },
    ],
    take: PROPERTY_SEARCH_LIMIT,
    select: {
      id: true,
      name: true,
      entrance: true,
      floor: true,
      status: true,
      type: true,
      building: { select: { displayName: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    buildingDisplayName: r.building.displayName,
    entrance: r.entrance,
    floor: r.floor,
    status: r.status,
    type: r.type,
  }));
}

