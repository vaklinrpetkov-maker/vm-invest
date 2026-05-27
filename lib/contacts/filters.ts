import type { Prisma } from "@prisma/client";
import {
  csvParam,
  firstParam,
  parseIsoDateParam,
  parsePageParam,
} from "@/lib/url-params";

// URL query string shape for the contacts list and CSV export. Keeping the
// parser + Prisma-where builder in one place so both surfaces stay in sync.
//
// Multi-value params use comma separation: ?type=Клиент,VIP%20Клиент.
// `owner=none` is the special sentinel for "Без отговорник".

export type ContactSearchParams = {
  q?: string | string[];
  type?: string | string[];
  owner?: string | string[];
  building?: string | string[];
  from?: string | string[];
  to?: string | string[];
  bdays?: string | string[];
  page?: string | string[];
};

export const CONTACTS_PAGE_SIZE = 100;

export type ParsedFilters = {
  q: string | null;
  types: string[];
  owners: string[]; // profile IDs
  ownerNone: boolean; // "Без отговорник" selected
  buildings: string[];
  from: Date | null;
  to: Date | null;
  birthdaysWithinDays: number | null;
  page: number; // 1-indexed
};

export function parseContactFilters(raw: ContactSearchParams): ParsedFilters {
  const q = firstParam(raw.q)?.trim() || null;

  const types = csvParam(raw.type);
  const buildings = csvParam(raw.building);

  const ownersRaw = csvParam(raw.owner);
  const ownerNone = ownersRaw.includes("none");
  const owners = ownersRaw.filter((id) => id !== "none");

  const from = parseIsoDateParam(raw.from);
  const to = parseIsoDateParam(raw.to);

  // Upcoming-birthdays day window: 1–366 (one full year max). Numbers
  // outside the range collapse to null so the filter is a no-op.
  const bdaysStr = firstParam(raw.bdays);
  const bdaysNum = bdaysStr ? Number(bdaysStr) : NaN;
  const birthdaysWithinDays =
    Number.isFinite(bdaysNum) && bdaysNum > 0 && bdaysNum <= 366 ? bdaysNum : null;

  return {
    q,
    types,
    owners,
    ownerNone,
    buildings,
    from,
    to,
    birthdaysWithinDays,
    page: parsePageParam(raw.page),
  };
}

// Build the Prisma `where` clause. Mirrors the list and CSV export.
export function buildContactWhere(f: ParsedFilters): Prisma.ContactWhereInput {
  const where: Prisma.ContactWhereInput = {};
  const AND: Prisma.ContactWhereInput[] = [];

  if (f.q) {
    const q = f.q;
    AND.push({
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { egn: { contains: q, mode: "insensitive" } },
        { properties: { contains: q, mode: "insensitive" } },
        { notes: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  if (f.types.length > 0) AND.push({ type: { in: f.types } });

  if (f.buildings.length > 0) {
    // Building FK: match against the new `Contact.building` relation by
    // displayName (the UI still sends names in the URL for readability).
    AND.push({ building: { displayName: { in: f.buildings } } });
  }

  if (f.owners.length > 0 || f.ownerNone) {
    const ownerClauses: Prisma.ContactWhereInput[] = [];
    if (f.owners.length > 0) ownerClauses.push({ ownerId: { in: f.owners } });
    if (f.ownerNone) ownerClauses.push({ ownerId: null });
    AND.push({ OR: ownerClauses });
  }

  if (f.from) AND.push({ createdAt: { gte: f.from } });
  if (f.to) {
    // "to" is inclusive — add 24h so all of that day matches
    const end = new Date(f.to.getTime() + 24 * 60 * 60 * 1000);
    AND.push({ createdAt: { lt: end } });
  }

  // Upcoming birthdays: filter in TS post-query since we need month/day
  // comparison that's awkward to express in Prisma without raw SQL.
  // buildContactWhere leaves birthday filtering to the caller.

  if (AND.length > 0) where.AND = AND;
  return where;
}

// Apply the birthday filter in TS after the query.
export function filterByUpcomingBirthdays<
  T extends { birthDate: Date | null },
>(rows: T[], days: number | null): T[] {
  if (days == null) return rows;

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const horizon = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);

  return rows.filter((r) => {
    if (!r.birthDate) return false;
    const bd = r.birthDate;
    const thisYear = new Date(Date.UTC(today.getUTCFullYear(), bd.getUTCMonth(), bd.getUTCDate()));
    // Handle wrap-around the new year
    const nextYear = new Date(
      Date.UTC(today.getUTCFullYear() + 1, bd.getUTCMonth(), bd.getUTCDate()),
    );
    return (
      (thisYear >= today && thisYear <= horizon) ||
      (nextYear >= today && nextYear <= horizon)
    );
  });
}

// Serialize a ParsedFilters back into a URLSearchParams — used by the CSV
// export link and for sharing.
export function serializeFilters(f: ParsedFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.types.length) p.set("type", f.types.join(","));
  if (f.buildings.length) p.set("building", f.buildings.join(","));
  const owners = [...f.owners, ...(f.ownerNone ? ["none"] : [])];
  if (owners.length) p.set("owner", owners.join(","));
  if (f.from) p.set("from", f.from.toISOString().slice(0, 10));
  if (f.to) p.set("to", f.to.toISOString().slice(0, 10));
  if (f.birthdaysWithinDays) p.set("bdays", String(f.birthdaysWithinDays));
  if (f.page > 1) p.set("page", String(f.page));
  return p;
}
