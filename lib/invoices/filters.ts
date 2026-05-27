import type { InvoiceStatus, Prisma } from "@prisma/client";

// URL-search-param filter parsing for /invoices.
//
// Most filter shapes mirror /leads + /tasks: multi-select via repeated ?key=v,
// "only mine" toggle as a boolean, and a single page number.

export const INVOICES_PAGE_SIZE = 25;

export type InvoiceSearchParams = {
  section?: string | string[];
  status?: string | string[];
  uploader?: string | string[];
  // ISO YYYY-MM-DD inclusive range for invoice_date.
  from?: string;
  to?: string;
  q?: string; // fuzzy search
  // "Само мои" toggle — defaults to true so each manager sees their own
  // invoices first. The toggle pins to URL when off ("&mine=0") so a manager
  // can bookmark "everyone's invoices in section X".
  mine?: string;
  // "Само с ценови сигнали" toggle.
  anomalies?: string;
  page?: string;
};

export type ParsedInvoiceFilters = {
  sectionIds: string[];
  statuses: InvoiceStatus[];
  uploaderIds: string[];
  from: Date | null;
  to: Date | null;
  q: string;
  mine: boolean;
  anomaliesOnly: boolean;
  page: number;
};

function asArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function parseIsoDate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return new Date(`${value}T00:00:00Z`);
}

const VALID_STATUSES: InvoiceStatus[] = ["pending", "paid"];

export function parseInvoiceFilters(params: InvoiceSearchParams): ParsedInvoiceFilters {
  const statuses = asArray(params.status).filter((s): s is InvoiceStatus =>
    VALID_STATUSES.includes(s as InvoiceStatus),
  );
  const pageRaw = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  // `mine` defaults to true. The user explicitly turns it off via &mine=0.
  // Any value other than "0" or "false" keeps mine on.
  const mineParam = params.mine;
  const mine = !(mineParam === "0" || mineParam === "false");

  return {
    sectionIds: asArray(params.section),
    statuses,
    uploaderIds: asArray(params.uploader),
    from: parseIsoDate(params.from),
    to: parseIsoDate(params.to),
    q: (params.q ?? "").trim(),
    mine,
    anomaliesOnly: params.anomalies === "1" || params.anomalies === "true",
    page,
  };
}

// Build the Prisma `where` clause from parsed filters. `viewerId` is the
// requesting user's profile id — needed for the "mine" toggle.
export function buildInvoiceWhere(
  filters: ParsedInvoiceFilters,
  viewerId: string,
): Prisma.InvoiceWhereInput {
  const where: Prisma.InvoiceWhereInput = {};

  if (filters.sectionIds.length > 0) {
    where.sectionId = { in: filters.sectionIds };
  }
  if (filters.statuses.length > 0) {
    where.status = { in: filters.statuses };
  }
  if (filters.mine) {
    where.uploadedById = viewerId;
  } else if (filters.uploaderIds.length > 0) {
    where.uploadedById = { in: filters.uploaderIds };
  }
  if (filters.from || filters.to) {
    where.invoiceDate = {};
    if (filters.from) where.invoiceDate.gte = filters.from;
    if (filters.to) where.invoiceDate.lte = filters.to;
  }
  if (filters.anomaliesOnly) {
    where.lineItems = { some: { priceAnomalyPct: { not: null } } };
  }
  if (filters.q.length > 0) {
    const q = filters.q;
    where.OR = [
      { vendorName: { contains: q, mode: "insensitive" } },
      { invoiceNumber: { contains: q, mode: "insensitive" } },
      { notes: { contains: q, mode: "insensitive" } },
      { lineItems: { some: { description: { contains: q, mode: "insensitive" } } } },
    ];
  }
  return where;
}
