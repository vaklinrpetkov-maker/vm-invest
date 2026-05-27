import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildPropertyWhere, type ParsedPropertyFilters } from "./filters";

// Page-level queries for the Properties list. Heavy row shapes live here so
// the page component stays focused on rendering.

export const propertyListInclude = {
  building: {
    select: { id: true, displayName: true, storageName: true, complex: true },
  },
  // Phone + email are included because the list table's inline owner picker
  // pre-fills the ContactPicker pill with them. Rendering the list row only
  // uses fullName, so the extra columns are essentially free (same JOIN).
  owner: {
    select: { id: true, fullName: true, phone: true, email: true },
  },
} satisfies Prisma.PropertyInclude;

export type PropertyListRow = Prisma.PropertyGetPayload<{
  include: typeof propertyListInclude;
}>;

export async function listPropertiesForPage(
  filters: ParsedPropertyFilters,
  pagination: { skip: number; take: number },
): Promise<{ rows: PropertyListRow[]; total: number }> {
  const where = buildPropertyWhere(filters);
  const [rows, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: propertyListInclude,
      orderBy: [
        { building: { displayName: "asc" } },
        // DB-level `name` asc gives a reasonable pre-sort; the page component
        // applies Intl.Collator natural-sort in-memory to get `Ап.2` before
        // `Ап.10`.
        { name: "asc" },
      ],
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.property.count({ where }),
  ]);
  return { rows, total };
}

// Distinct sellers across non-deleted properties — feeds the Продавач
// multi-select on /properties and the autocomplete on the property form.
// Sorted alphabetically by the Bulgarian collator.
//
// `sellers` is a Postgres String[] now, so we use UNNEST in a raw query to
// flatten the array column into rows, then COUNT-DISTINCT in JS. Cheaper than
// fetching every property and aggregating client-side at our row count
// (~1,800 today).
export async function listDistinctSellers(): Promise<string[]> {
  type Row = { seller: string };
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT DISTINCT UNNEST(sellers) AS seller
    FROM public.properties
    WHERE deleted_at IS NULL
  `;
  const collator = new Intl.Collator("bg", { sensitivity: "base" });
  return rows
    .map((r) => r.seller)
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .sort(collator.compare);
}

// Distinct entrances (scoped to the currently-filtered buildings, if any) —
// feeds the Вход multi-select. §4.1 says the filter options should reflect
// the filtered subset so users don't see impossible combinations.
export async function listDistinctEntrances(
  buildingIds: string[] = [],
): Promise<string[]> {
  const rows = await prisma.property.findMany({
    where: {
      deletedAt: null,
      entrance: { not: null },
      ...(buildingIds.length > 0 ? { buildingId: { in: buildingIds } } : {}),
    },
    distinct: ["entrance"],
    select: { entrance: true },
  });
  return rows
    .map((r) => r.entrance!)
    .filter((e): e is string => typeof e === "string" && e.length > 0)
    .sort();
}

// Single-row fetch for the detail page.
export const propertyDetailInclude = {
  building: true,
  owner: {
    select: { id: true, fullName: true, email: true, phone: true, type: true },
  },
  createdBy: { select: { fullName: true } },
  updatedBy: { select: { fullName: true } },
  deletedBy: { select: { fullName: true } },
  statusHistory: {
    orderBy: { at: "desc" },
    include: { author: { select: { fullName: true } } },
  },
} satisfies Prisma.PropertyInclude;

export type PropertyDetail = Prisma.PropertyGetPayload<{
  include: typeof propertyDetailInclude;
}>;

export async function getPropertyById(id: string): Promise<PropertyDetail | null> {
  const p = await prisma.property.findUnique({
    where: { id },
    include: propertyDetailInclude,
  });
  if (!p || p.deletedAt) return null;
  return p;
}
