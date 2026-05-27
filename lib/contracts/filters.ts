import type { Prisma } from "@prisma/client";
import {
  csvParam,
  firstParam,
  parseNumberParam,
  parsePageParam,
  parseTriStateParam,
} from "@/lib/url-params";
import { CONTRACTS_PAGE_SIZE } from "./constants";

// URL query shape for /contracts list + export. Same pattern as
// lib/properties/filters.ts — parser + Prisma where builder live together.

export type ContractSearchParams = {
  q?: string | string[];
  status?: string | string[];
  type?: string | string[];
  building?: string | string[];
  salesperson?: string | string[];
  preOrPost?: string | string[];
  usesCredit?: string | string[]; // "yes" | "no" | any
  hasRemaining?: string | string[]; // "yes" | "no" | any
  totalMin?: string | string[];
  totalMax?: string | string[];
  page?: string | string[];
};

export { CONTRACTS_PAGE_SIZE };

export type ParsedContractFilters = {
  q: string | null;
  statuses: string[];
  types: string[];
  buildings: string[];
  salespeople: string[];
  preOrPost: string[];
  usesCredit: "yes" | "no" | null;
  hasRemaining: "yes" | "no" | null;
  totalMin: number | null;
  totalMax: number | null;
  page: number;
};

export function parseContractFilters(raw: ContractSearchParams): ParsedContractFilters {
  return {
    q: firstParam(raw.q)?.trim() || null,
    statuses: csvParam(raw.status),
    types: csvParam(raw.type),
    buildings: csvParam(raw.building),
    salespeople: csvParam(raw.salesperson),
    preOrPost: csvParam(raw.preOrPost),
    usesCredit: parseTriStateParam(raw.usesCredit),
    hasRemaining: parseTriStateParam(raw.hasRemaining),
    totalMin: parseNumberParam(raw.totalMin),
    totalMax: parseNumberParam(raw.totalMax),
    page: parsePageParam(raw.page),
  };
}

export function buildContractWhere(f: ParsedContractFilters): Prisma.ContractWhereInput {
  // Exclude soft-deleted contracts from every list / count / filter. Single
  // source of truth — every caller goes through this builder, so the
  // filter applies everywhere consistently. The detail page uses
  // getContractById which has its own filter (see queries.ts).
  const where: Prisma.ContractWhereInput = { deletedAt: null };
  const AND: Prisma.ContractWhereInput[] = [];

  if (f.q) {
    const q = f.q;
    AND.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { buyerFullName: { contains: q, mode: "insensitive" } },
        { salesperson: { contains: q, mode: "insensitive" } },
        { contact: { fullName: { contains: q, mode: "insensitive" } } },
      ],
    });
  }

  if (f.statuses.length > 0) AND.push({ status: { in: f.statuses } });
  if (f.types.length > 0) AND.push({ contractType: { in: f.types } });
  if (f.buildings.length > 0) AND.push({ building: { in: f.buildings } });
  if (f.salespeople.length > 0) AND.push({ salesperson: { in: f.salespeople } });
  if (f.preOrPost.length > 0) AND.push({ preOrPost: { in: f.preOrPost } });

  if (f.usesCredit === "yes") AND.push({ usesCredit: true });
  if (f.usesCredit === "no") AND.push({ usesCredit: false });

  if (f.hasRemaining === "yes") AND.push({ totalRemainingEur: { gt: 0 } });
  if (f.hasRemaining === "no") AND.push({ totalRemainingEur: { lte: 0 } });

  if (f.totalMin !== null || f.totalMax !== null) {
    const total: Prisma.DecimalFilter = {};
    if (f.totalMin !== null) total.gte = f.totalMin;
    if (f.totalMax !== null) total.lte = f.totalMax;
    AND.push({ totalDueEur: total });
  }

  if (AND.length > 0) where.AND = AND;
  return where;
}

export function serializeContractFilters(f: ParsedContractFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.statuses.length) p.set("status", f.statuses.join(","));
  if (f.types.length) p.set("type", f.types.join(","));
  if (f.buildings.length) p.set("building", f.buildings.join(","));
  if (f.salespeople.length) p.set("salesperson", f.salespeople.join(","));
  if (f.preOrPost.length) p.set("preOrPost", f.preOrPost.join(","));
  if (f.usesCredit) p.set("usesCredit", f.usesCredit);
  if (f.hasRemaining) p.set("hasRemaining", f.hasRemaining);
  if (f.totalMin !== null) p.set("totalMin", String(f.totalMin));
  if (f.totalMax !== null) p.set("totalMax", String(f.totalMax));
  if (f.page > 1) p.set("page", String(f.page));
  return p;
}
