import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildContractWhere, type ParsedContractFilters } from "./filters";

// List + detail queries for the Contracts module.

export const contractListInclude = {
  contact: { select: { id: true, fullName: true } },
  // Salesperson FK — the "Консултант на сделката" assigned to the deal.
  // Legacy CSV-imported rows have only the free-text `salesperson` column;
  // the table renders `salespersonProfile?.fullName ?? salesperson ?? "—"`.
  salespersonProfile: { select: { id: true, fullName: true, active: true } },
  properties: {
    select: {
      property: {
        select: {
          id: true,
          name: true,
          building: { select: { displayName: true } },
        },
      },
    },
  },
  attachments: {
    orderBy: { uploadedAt: "asc" },
    include: { uploadedBy: { select: { id: true, fullName: true } } },
  },
  _count: { select: { properties: true } },
} satisfies Prisma.ContractInclude;

export type ContractListRow = Prisma.ContractGetPayload<{
  include: typeof contractListInclude;
}>;

export async function listContractsForPage(
  filters: ParsedContractFilters,
  pagination: { skip: number; take: number },
): Promise<{ rows: ContractListRow[]; total: number }> {
  const where = buildContractWhere(filters);
  const [rows, total] = await Promise.all([
    prisma.contract.findMany({
      where,
      include: contractListInclude,
      orderBy: [{ createdAt: "desc" }],
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.contract.count({ where }),
  ]);
  return { rows, total };
}

// Distinct-value helpers for the filter bar.
export async function listDistinctContractBuildings(): Promise<string[]> {
  const rows = await prisma.contract.findMany({
    where: { building: { not: null } },
    distinct: ["building"],
    select: { building: true },
    orderBy: { building: "asc" },
  });
  return rows.map((r) => r.building!).filter((s): s is string => typeof s === "string");
}

export async function listDistinctSalespeople(): Promise<string[]> {
  const rows = await prisma.contract.findMany({
    where: { salesperson: { not: null } },
    distinct: ["salesperson"],
    select: { salesperson: true },
    orderBy: { salesperson: "asc" },
  });
  return rows.map((r) => r.salesperson!).filter((s): s is string => typeof s === "string");
}

// Detail include — pulls the full payment + installment tree plus linked
// contact and properties for the detail page.
export const contractDetailInclude = {
  contact: {
    select: { id: true, fullName: true, email: true, phone: true, type: true },
  },
  salespersonProfile: {
    select: { id: true, fullName: true, email: true, role: true, active: true },
  },
  properties: {
    include: {
      property: {
        select: {
          id: true,
          name: true,
          status: true,
          type: true,
          building: { select: { displayName: true } },
        },
      },
    },
  },
  payments: {
    orderBy: { number: "asc" },
    include: {
      installments: {
        orderBy: [{ track: "asc" }, { paidAt: "asc" }],
      },
    },
  },
  attachments: {
    orderBy: { uploadedAt: "asc" },
    include: { uploadedBy: { select: { id: true, fullName: true } } },
  },
  createdBy: { select: { fullName: true } },
  updatedBy: { select: { fullName: true } },
} satisfies Prisma.ContractInclude;

export type ContractDetail = Prisma.ContractGetPayload<{
  include: typeof contractDetailInclude;
}>;

export async function getContractById(id: string): Promise<ContractDetail | null> {
  const row = await prisma.contract.findUnique({
    where: { id },
    include: contractDetailInclude,
  });
  // Soft-deleted contracts are treated as not-found everywhere they're
  // surfaced — the detail page renders 404, edit page redirects, etc.
  if (!row || row.deletedAt !== null) return null;
  return row;
}
