import type { Prisma } from "@prisma/client";
import {
  csvParam,
  firstParam,
  parseNumberParam,
  parsePageParam,
  parseTriStateParam,
} from "@/lib/url-params";
import { PROPERTIES_PAGE_SIZE } from "./constants";

// URL query string shape for the Properties list + CSV export. Same pattern
// as lib/contacts/filters.ts — parser + where-builder live together so both
// surfaces share the truth.

export type PropertySearchParams = {
  q?: string | string[];
  status?: string | string[];
  type?: string | string[];
  entrance?: string | string[];
  building?: string | string[]; // Building.id, comma-separated
  complex?: string | string[]; // single complex label
  seller?: string | string[];
  floorMin?: string | string[];
  floorMax?: string | string[];
  priceMin?: string | string[];
  priceMax?: string | string[];
  netMin?: string | string[];
  netMax?: string | string[];
  hasOwner?: string | string[]; // "yes" | "no" | anything → any
  hasCredit?: string | string[]; // "yes" | "no" | anything → any
  page?: string | string[];
};

export { PROPERTIES_PAGE_SIZE };

export type ParsedPropertyFilters = {
  q: string | null;
  statuses: string[];
  types: string[];
  entrances: string[];
  buildingIds: string[];
  complex: string | null;
  sellers: string[];
  floorMin: number | null;
  floorMax: number | null;
  priceMin: number | null;
  priceMax: number | null;
  netMin: number | null;
  netMax: number | null;
  hasOwner: "yes" | "no" | null;
  hasCredit: "yes" | "no" | null;
  page: number;
};

export function parsePropertyFilters(raw: PropertySearchParams): ParsedPropertyFilters {
  return {
    q: firstParam(raw.q)?.trim() || null,
    statuses: csvParam(raw.status),
    types: csvParam(raw.type),
    entrances: csvParam(raw.entrance),
    buildingIds: csvParam(raw.building),
    complex: firstParam(raw.complex)?.trim() || null,
    sellers: csvParam(raw.seller),
    floorMin: parseNumberParam(raw.floorMin),
    floorMax: parseNumberParam(raw.floorMax),
    priceMin: parseNumberParam(raw.priceMin),
    priceMax: parseNumberParam(raw.priceMax),
    netMin: parseNumberParam(raw.netMin),
    netMax: parseNumberParam(raw.netMax),
    hasOwner: parseTriStateParam(raw.hasOwner),
    hasCredit: parseTriStateParam(raw.hasCredit),
    page: parsePageParam(raw.page),
  };
}

// Build the Prisma `where` clause for the list + export. Always filters out
// soft-deleted rows.
export function buildPropertyWhere(f: ParsedPropertyFilters): Prisma.PropertyWhereInput {
  const where: Prisma.PropertyWhereInput = { deletedAt: null };
  const AND: Prisma.PropertyWhereInput[] = [];

  if (f.q) {
    const q = f.q;
    AND.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        // Postgres `String[] has` check is exact-match; for fuzzy search we
        // use `hasSome` against an explicit single-element array? That's also
        // exact. The only way to fuzzy-search across the array values is via
        // `array_to_string(...) ILIKE ...`, which Prisma can't express
        // directly — we fall back to a raw filter via the `hasSome` op
        // against case-insensitive prefix matches. For Phase 1 we accept
        // that the search behaves as "matches a full seller value" rather
        // than substring; the admin tool covers cleanup, and the admin
        // search box on /properties is mostly for property names anyway.
        // TODO: revisit if users complain.
        { sellers: { has: q } },
        { contractLabel: { contains: q, mode: "insensitive" } },
        { buyerLabel: { contains: q, mode: "insensitive" } },
        { owner: { fullName: { contains: q, mode: "insensitive" } } },
      ],
    });
  }

  if (f.statuses.length > 0) AND.push({ status: { in: f.statuses } });
  if (f.types.length > 0) AND.push({ type: { in: f.types } });
  if (f.entrances.length > 0) AND.push({ entrance: { in: f.entrances } });
  if (f.buildingIds.length > 0) AND.push({ buildingId: { in: f.buildingIds } });
  if (f.complex) AND.push({ building: { complex: f.complex } });
  // `hasSome` matches any property whose `sellers` array contains at least
  // one of the filter values — the right shape for a multi-select.
  if (f.sellers.length > 0) AND.push({ sellers: { hasSome: f.sellers } });

  if (f.floorMin !== null || f.floorMax !== null) {
    const floor: Prisma.IntFilter = {};
    if (f.floorMin !== null) floor.gte = f.floorMin;
    if (f.floorMax !== null) floor.lte = f.floorMax;
    AND.push({ floor });
  }

  if (f.priceMin !== null || f.priceMax !== null) {
    const price: Prisma.DecimalFilter = {};
    if (f.priceMin !== null) price.gte = f.priceMin;
    if (f.priceMax !== null) price.lte = f.priceMax;
    AND.push({ priceEur: price });
  }

  if (f.netMin !== null || f.netMax !== null) {
    const net: Prisma.DecimalFilter = {};
    if (f.netMin !== null) net.gte = f.netMin;
    if (f.netMax !== null) net.lte = f.netMax;
    AND.push({ netAreaM2: net });
  }

  if (f.hasOwner === "yes") AND.push({ ownerId: { not: null } });
  if (f.hasOwner === "no") AND.push({ ownerId: null });
  if (f.hasCredit === "yes") AND.push({ hasCredit: true });
  if (f.hasCredit === "no") AND.push({ hasCredit: false });

  if (AND.length > 0) where.AND = AND;
  return where;
}

// Natural-sort helper for property names within a building — so `Ап.2` sorts
// before `Ап.10`. Postgres doesn't do this without a raw SQL extension.
// Apply in-memory after the query.
const naturalCollator = new Intl.Collator("bg", { numeric: true, sensitivity: "base" });

export function naturalSortByName<T extends { name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => naturalCollator.compare(a.name, b.name));
}

// Serialize back to URLSearchParams — used by the CSV export link and by the
// pagination helper on the list page.
export function serializePropertyFilters(f: ParsedPropertyFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.statuses.length) p.set("status", f.statuses.join(","));
  if (f.types.length) p.set("type", f.types.join(","));
  if (f.entrances.length) p.set("entrance", f.entrances.join(","));
  if (f.buildingIds.length) p.set("building", f.buildingIds.join(","));
  if (f.complex) p.set("complex", f.complex);
  if (f.sellers.length) p.set("seller", f.sellers.join(","));
  if (f.floorMin !== null) p.set("floorMin", String(f.floorMin));
  if (f.floorMax !== null) p.set("floorMax", String(f.floorMax));
  if (f.priceMin !== null) p.set("priceMin", String(f.priceMin));
  if (f.priceMax !== null) p.set("priceMax", String(f.priceMax));
  if (f.netMin !== null) p.set("netMin", String(f.netMin));
  if (f.netMax !== null) p.set("netMax", String(f.netMax));
  if (f.hasOwner) p.set("hasOwner", f.hasOwner);
  if (f.hasCredit) p.set("hasCredit", f.hasCredit);
  if (f.page > 1) p.set("page", String(f.page));
  return p;
}
