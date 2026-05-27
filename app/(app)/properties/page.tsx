import type { Route } from "next";
import { requireProfile } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import {
  PROPERTIES_PAGE_SIZE,
  parsePropertyFilters,
  serializePropertyFilters,
  naturalSortByName,
  type PropertySearchParams,
  type ParsedPropertyFilters,
} from "@/lib/properties/filters";
import { listPropertiesForPage, listDistinctSellers, listDistinctEntrances } from "@/lib/properties/queries";
import {
  getBuildingNavigator,
  getBuildingOverview,
  listActiveBuildings,
} from "@/lib/buildings/queries";
import { resolveFieldPermissions, canDeleteProperty } from "@/lib/properties/permissions";
import { PropertiesPageClient } from "./page-client";
import type { PropertyRow } from "./properties-table";

export const dynamic = "force-dynamic";

function pageHref(filters: ParsedPropertyFilters, page: number): Route {
  const f = { ...filters, page };
  const qs = serializePropertyFilters(f).toString();
  return (qs ? `/properties?${qs}` : "/properties") as Route;
}

function decimalToString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  // Prisma.Decimal has .toString() — we always serialise to a plain string for
  // the client boundary so React can diff safely.
  return String(v);
}

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<PropertySearchParams>;
}) {
  const me = await requireProfile();
  const params = await searchParams;
  const filters = parsePropertyFilters(params);

  // Building overview strip only fetches when the user drills into exactly
  // one building via the navigator (no complex, no cross-building filter).
  // Spec: properties.md §4.4.
  const singleBuildingId =
    filters.buildingIds.length === 1 && !filters.complex ? filters.buildingIds[0] : null;

  const [pageData, navigatorTree, buildings, sellers, entrances, overview] =
    await Promise.all([
      listPropertiesForPage(filters, {
        skip: (filters.page - 1) * PROPERTIES_PAGE_SIZE,
        take: PROPERTIES_PAGE_SIZE,
      }),
      getBuildingNavigator(),
      listActiveBuildings(),
      listDistinctSellers(),
      listDistinctEntrances(filters.buildingIds),
      singleBuildingId ? getBuildingOverview(singleBuildingId) : Promise.resolve(null),
    ]);

  const sortedRows = naturalSortByName(pageData.rows);
  const rows: PropertyRow[] = sortedRows.map((p) => ({
    id: p.id,
    buildingDisplayName: p.building.displayName,
    buildingId: p.building.id,
    name: p.name,
    status: p.status,
    type: p.type,
    entrance: p.entrance,
    floor: p.floor,
    description: p.description,
    sellers: p.sellers,
    expectedPriceEur: decimalToString(p.expectedPriceEur),
    priceEur: decimalToString(p.priceEur),
    yardTerracePriceEur: decimalToString(p.yardTerracePriceEur),
    priceBgnOriginal: decimalToString(p.priceBgnOriginal),
    expectedPriceBgnOriginal: decimalToString(p.expectedPriceBgnOriginal),
    yardTerracePriceBgnOriginal: decimalToString(p.yardTerracePriceBgnOriginal),
    totalAreaM2: decimalToString(p.totalAreaM2),
    commonPartsM2: decimalToString(p.commonPartsM2),
    netAreaM2: decimalToString(p.netAreaM2),
    idealPartsCoef: decimalToString(p.idealPartsCoef),
    bathroomCount: p.bathroomCount,
    yardM2: decimalToString(p.yardM2),
    terraceM2: decimalToString(p.terraceM2),
    landM2: decimalToString(p.landM2),
    landPct: decimalToString(p.landPct),
    yardPct: decimalToString(p.yardPct),
    contractLabel: p.contractLabel,
    buyerLabel: p.buyerLabel,
    hasCredit: p.hasCredit,
    ownerId: p.ownerId,
    ownerName: p.owner?.fullName ?? null,
    ownerPhone: p.owner?.phone ?? null,
    ownerEmail: p.owner?.email ?? null,
    contractId: p.contractId,
    createdAt: formatDate(p.createdAt),
    updatedAt: formatDate(p.updatedAt),
  }));

  const perm = resolveFieldPermissions(me.role);

  const totalPages = Math.max(1, Math.ceil(pageData.total / PROPERTIES_PAGE_SIZE));
  const hasPrev = filters.page > 1;
  const hasNext = filters.page < totalPages;
  const rangeStart = pageData.total === 0 ? 0 : (filters.page - 1) * PROPERTIES_PAGE_SIZE + 1;
  const rangeEnd = Math.min(filters.page * PROPERTIES_PAGE_SIZE, pageData.total);

  const exportQs = serializePropertyFilters(filters).toString();
  const exportHref = (exportQs
    ? `/api/properties/export?${exportQs}`
    : "/api/properties/export") as Route;

  // The navigator total = count of all live (non-deleted) properties, not the
  // filtered subset. That keeps "Всички (2158)" stable regardless of filter.
  const navigatorTotal = navigatorTree.reduce((sum, node) => sum + node.complexTotal, 0);

  return (
    <PropertiesPageClient
      rows={rows}
      navigatorTree={navigatorTree}
      navigatorTotal={navigatorTotal}
      buildings={buildings.map((b) => ({ id: b.id, displayName: b.displayName }))}
      sellers={sellers}
      entrances={entrances}
      permissions={perm}
      totalCount={pageData.total}
      rangeStart={rangeStart}
      rangeEnd={rangeEnd}
      page={filters.page}
      totalPages={totalPages}
      prevHref={hasPrev ? pageHref(filters, filters.page - 1) : null}
      nextHref={hasNext ? pageHref(filters, filters.page + 1) : null}
      canExport={me.role === "admin"}
      canDelete={me.role === "admin"}
      exportHref={exportHref}
      overview={overview}
    />
  );
}

// Suppress a couple of unused-import warnings the TS compiler might flag on
// the first pass; these are real exports used at call sites elsewhere.
void canDeleteProperty;
