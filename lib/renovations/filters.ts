import type { ApartmentSize, RenovationStatus } from "@prisma/client";
import {
  firstParam,
  parseIsoDateParam,
  parsePageParam,
  repeatedOrCsvParam,
} from "@/lib/url-params";
import { isValidApartmentSize, isValidRenovationStatus } from "./constants";

// Filter-parsing for `/renovations` — mirrors the per-module filters lib in
// Contacts / Properties / Leads. URL-driven; the page passes
// `searchParams` straight in and gets a typed shape back.
//
// Multi-value params accept BOTH repeated (`?status=a&status=b`) and CSV
// (`?status=a,b,c`) styles via `repeatedOrCsvParam` — the serializer emits
// CSV; the parser is forgiving for hand-edited URLs and the rare consumer
// that builds repeated keys.
//
// `types` filter dropped in the template-driven pivot (20.05.2026) — the
// free-text `type` field was removed from the schema; `apartmentSize` is
// the new structured taxonomy.

export type ParsedRenovationFilters = {
  q: string;
  statuses: RenovationStatus[];
  apartmentSizes: ApartmentSize[];
  managerIds: string[];
  buildingIds: string[];
  requestedByContactId: string | null;
  // Period range over `plannedStartDate`. UTC-midnight Dates; the
  // where-builder uses them directly.
  plannedFrom: Date | null;
  plannedTo: Date | null;
  // "Само просрочени" toggle — renovations whose `plannedEndDate < today`
  // AND status NOT IN (done, cancelled). Per spec §5.1.
  overdueOnly: boolean;
  // "Само с превишен капацитет" toggle — renovations that contribute to
  // any over-capacity day in their planned window. Per spec §5.1 + §8.
  capacityOver: boolean;
  page: number;
};

export type RenovationSearchParams = Record<
  string,
  string | string[] | undefined
>;

export function parseRenovationFilters(
  params: RenovationSearchParams,
): ParsedRenovationFilters {
  const statuses = repeatedOrCsvParam(params.status).filter((s) =>
    isValidRenovationStatus(s),
  ) as RenovationStatus[];
  const apartmentSizes = repeatedOrCsvParam(params.size).filter((s) =>
    isValidApartmentSize(s),
  ) as ApartmentSize[];
  const overdueRaw = firstParam(params.overdue);
  const overdueOnly = overdueRaw === "1" || overdueRaw === "true";
  const capRaw = firstParam(params.capacityOver);
  const capacityOver = capRaw === "1" || capRaw === "true";

  return {
    q: firstParam(params.q)?.trim() ?? "",
    statuses,
    apartmentSizes,
    managerIds: repeatedOrCsvParam(params.manager),
    buildingIds: repeatedOrCsvParam(params.building),
    requestedByContactId: firstParam(params.requestedBy)?.trim() || null,
    plannedFrom: parseIsoDateParam(params.plannedFrom),
    plannedTo: parseIsoDateParam(params.plannedTo),
    overdueOnly,
    capacityOver,
    page: parsePageParam(params.page),
  };
}

export function serializeRenovationFilters(
  f: ParsedRenovationFilters,
): URLSearchParams {
  const out = new URLSearchParams();
  if (f.q) out.set("q", f.q);
  if (f.statuses.length) out.set("status", f.statuses.join(","));
  if (f.apartmentSizes.length) out.set("size", f.apartmentSizes.join(","));
  if (f.managerIds.length) out.set("manager", f.managerIds.join(","));
  if (f.buildingIds.length) out.set("building", f.buildingIds.join(","));
  if (f.requestedByContactId) out.set("requestedBy", f.requestedByContactId);
  if (f.plannedFrom) out.set("plannedFrom", f.plannedFrom.toISOString().slice(0, 10));
  if (f.plannedTo) out.set("plannedTo", f.plannedTo.toISOString().slice(0, 10));
  if (f.overdueOnly) out.set("overdue", "1");
  if (f.capacityOver) out.set("capacityOver", "1");
  if (f.page > 1) out.set("page", String(f.page));
  return out;
}
