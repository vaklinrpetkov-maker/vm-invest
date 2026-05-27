import type { LeadSource, LeadStatus, Prisma } from "@prisma/client";
import {
  csvParam,
  firstParam,
  parseIsoDateParam,
  parsePageParam,
} from "@/lib/url-params";

// URL query shape + parsing + Prisma where-builder for the Leads list.
// Mirrors lib/contacts/filters.ts patterns.

export type LeadSearchParams = {
  q?: string | string[];
  status?: string | string[];
  source?: string | string[];
  owner?: string | string[];
  building?: string | string[];
  from?: string | string[];
  to?: string | string[];
  page?: string | string[];
};

export const LEADS_PAGE_SIZE = 100;

export type ParsedLeadFilters = {
  q: string | null;
  statuses: LeadStatus[];
  sources: LeadSource[];
  owners: string[];
  ownerNone: boolean;
  buildings: string[];
  from: Date | null;
  to: Date | null;
  page: number;
};

const VALID_STATUS = new Set(["new", "in_progress", "converted", "no_progress"]);
const VALID_SOURCE = new Set(["manual", "email_form", "email_unparsed", "phone"]);

export function parseLeadFilters(raw: LeadSearchParams): ParsedLeadFilters {
  const q = firstParam(raw.q)?.trim() || null;

  const statuses = csvParam(raw.status).filter((s) =>
    VALID_STATUS.has(s),
  ) as LeadStatus[];
  const sources = csvParam(raw.source).filter((s) =>
    VALID_SOURCE.has(s),
  ) as LeadSource[];

  const ownersRaw = csvParam(raw.owner);
  const ownerNone = ownersRaw.includes("none");
  const owners = ownersRaw.filter((x) => x !== "none");

  const buildings = csvParam(raw.building);

  return {
    q,
    statuses,
    sources,
    owners,
    ownerNone,
    buildings,
    from: parseIsoDateParam(raw.from),
    to: parseIsoDateParam(raw.to),
    page: parsePageParam(raw.page),
  };
}

export function buildLeadWhere(f: ParsedLeadFilters): Prisma.LeadWhereInput {
  const AND: Prisma.LeadWhereInput[] = [{ deletedAt: null }];

  if (f.q) {
    const q = f.q;
    AND.push({
      OR: [
        { contact: { fullName: { contains: q, mode: "insensitive" } } },
        { contact: { email: { contains: q, mode: "insensitive" } } },
        { contact: { phone: { contains: q, mode: "insensitive" } } },
        { message: { contains: q, mode: "insensitive" } },
        { emailSubject: { contains: q, mode: "insensitive" } },
        { properties: { hasSome: [q] } },
      ],
    });
  }

  if (f.statuses.length) AND.push({ status: { in: f.statuses } });
  if (f.sources.length) AND.push({ source: { in: f.sources } });

  if (f.owners.length > 0 || f.ownerNone) {
    const clauses: Prisma.LeadWhereInput[] = [];
    if (f.owners.length) clauses.push({ ownerId: { in: f.owners } });
    if (f.ownerNone) clauses.push({ ownerId: null });
    AND.push({ OR: clauses });
  }

  if (f.buildings.length) {
    // Property entries are formatted "Сграда — Имот". Postgres text[] `hasSome`
    // is exact, so fall back to a substring match over the message (which
    // might also mention the building for manual leads).
    AND.push({
      OR: f.buildings.flatMap((b) => [
        { properties: { hasSome: [b] } },
        { message: { contains: b, mode: "insensitive" as const } },
      ]),
    });
  }

  if (f.from) AND.push({ createdAt: { gte: f.from } });
  if (f.to) {
    const end = new Date(f.to.getTime() + 24 * 60 * 60 * 1000);
    AND.push({ createdAt: { lt: end } });
  }

  return { AND };
}

export function serializeLeadFilters(f: ParsedLeadFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.statuses.length) p.set("status", f.statuses.join(","));
  if (f.sources.length) p.set("source", f.sources.join(","));
  const owners = [...f.owners, ...(f.ownerNone ? ["none"] : [])];
  if (owners.length) p.set("owner", owners.join(","));
  if (f.buildings.length) p.set("building", f.buildings.join(","));
  if (f.from) p.set("from", f.from.toISOString().slice(0, 10));
  if (f.to) p.set("to", f.to.toISOString().slice(0, 10));
  if (f.page > 1) p.set("page", String(f.page));
  return p;
}
