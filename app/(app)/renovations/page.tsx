import Link from "next/link";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { PageHelp } from "@/components/ui/page-help";
import { listActiveBuildings } from "@/lib/buildings/queries";
import { requireProfile } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { RENOVATIONS_PAGE_SIZE } from "@/lib/renovations/constants";
import {
  parseRenovationFilters,
  serializeRenovationFilters,
  type ParsedRenovationFilters,
  type RenovationSearchParams,
} from "@/lib/renovations/filters";
import {
  computeCapacity,
  computeWorstOverageForRenovation,
} from "@/lib/renovations/capacity";
import {
  computeRenovationKpis,
  listRenovationsForPage,
} from "@/lib/renovations/queries";
import { RenovationFilters } from "./filters";
import { RenovationsKpiStrip } from "./kpi-strip";
import { RenovationsListView } from "./list-view";
import type { RenovationListRowVm } from "./renovations-table";

export const dynamic = "force-dynamic";

function pageHref(filters: ParsedRenovationFilters, page: number): Route {
  const f = { ...filters, page };
  const qs = serializeRenovationFilters(f).toString();
  return (qs ? `/renovations?${qs}` : "/renovations") as Route;
}

function formatPeriod(start: Date | null, end: Date | null): string {
  if (start === null && end === null) return "—";
  const s = start ? formatDate(start) : "—";
  const e = end ? formatDate(end) : "—";
  return `${s} → ${e}`;
}

export default async function RenovationsPage({
  searchParams,
}: {
  searchParams: Promise<RenovationSearchParams>;
}) {
  const me = await requireProfile();
  const params = await searchParams;
  const filters = parseRenovationFilters(params);

  // Serialize the top-level queries — the Supabase pooler runs at
  // connection_limit=1/5, so wide Promise.all() chains can cause the
  // "Timed out fetching a new connection from the connection pool"
  // runtime error. Same fix shape as the invoice-detail page.
  //
  // Order: capacity first (so the list query + KPI tile can reuse it
  // without re-running the query), then list, then aux data.
  const DAY_MS = 24 * 60 * 60 * 1000;
  const todayMs = (() => {
    const n = new Date();
    return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
  })();
  // Capacity window: union of all active renovations' planned ranges,
  // ALWAYS including [today, today+89] so the КПИ tile's 90-day count
  // works even when the company has no active renovations yet. Padded
  // 7 days on each side so the danger bands extend to the visible
  // edges of the portfolio Gantt's auto-fit viewport.
  //
  // Why not a fixed today-relative window? A fixed `today-30 → today+365`
  // misses any renovation whose dates fall outside that window — past
  // renovations stop showing capacity bands the moment they age out of
  // the rear cap, which is the wrong behaviour: any bar on the Gantt
  // should have its overage signal computed.
  const activeBounds = await prisma.renovation.aggregate({
    where: { deletedAt: null, status: { notIn: ["cancelled"] } },
    _min: { plannedStartDate: true },
    _max: { plannedEndDate: true },
  });
  const padMs = 7 * DAY_MS;
  const kpiWindowStartMs = todayMs;
  const kpiWindowEndMs = todayMs + 89 * DAY_MS;
  const minPlannedMs =
    activeBounds._min.plannedStartDate?.getTime() ?? kpiWindowStartMs;
  const maxPlannedMs =
    activeBounds._max.plannedEndDate?.getTime() ?? kpiWindowEndMs;
  const windowStartMs = Math.min(minPlannedMs, kpiWindowStartMs) - padMs;
  const windowEndMs = Math.max(maxPlannedMs, kpiWindowEndMs) + padMs;
  const capacity = await computeCapacity({
    windowStart: new Date(windowStartMs),
    windowEnd: new Date(windowEndMs),
  });
  const portfolioDangerDays = Array.from(capacity.overageDays).sort();

  const { rows, total } = await listRenovationsForPage(
    filters,
    {
      skip: (filters.page - 1) * RENOVATIONS_PAGE_SIZE,
      take: RENOVATIONS_PAGE_SIZE,
    },
    { precomputedOverageDays: capacity.overageDays },
  );
  const owners = await prisma.profile.findMany({
    where: { active: true },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true },
  });
  const buildings = await listActiveBuildings();

  // Whether the user has narrowed the view at all — controls the scope
  // sublabel under the KPI strip so they know whether the numbers are
  // company-wide or filtered.
  const hasAnyFilter =
    filters.statuses.length > 0 ||
    filters.apartmentSizes.length > 0 ||
    filters.managerIds.length > 0 ||
    filters.buildingIds.length > 0 ||
    filters.requestedByContactId !== null ||
    filters.plannedFrom !== null ||
    filters.plannedTo !== null ||
    filters.overdueOnly ||
    filters.capacityOver ||
    filters.q.length > 0;

  const buildingOpts = buildings.map((b) => ({ id: b.id, displayName: b.displayName }));

  const totalPages = Math.max(1, Math.ceil(total / RENOVATIONS_PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (filters.page - 1) * RENOVATIONS_PAGE_SIZE + 1;
  const rangeEnd = Math.min(filters.page * RENOVATIONS_PAGE_SIZE, total);

  // KPI tile counts overage days in the next 90 days specifically. Derive
  // from the same capacity result so we don't run a second query.
  let capacityOverage90 = 0;
  for (const iso of capacity.overageDays) {
    const t = new Date(`${iso}T00:00:00Z`).getTime();
    if (t >= kpiWindowStartMs && t <= kpiWindowEndMs) capacityOverage90++;
  }

  const kpis = await computeRenovationKpis(filters, {
    precomputedCapacityOverage90: capacityOverage90,
  });

  const vmRows: RenovationListRowVm[] = rows.map((r) => {
    // Капацитет column (spec §5.1 #7) — empty for draft/cancelled per spec;
    // OK/+N chip otherwise based on whether THIS renovation contributes to
    // any portfolio overage in its planned window.
    const showCapacity = r.status !== "draft" && r.status !== "cancelled";
    const worstOverage = showCapacity
      ? computeWorstOverageForRenovation(r.activities, capacity)
      : null;
    return {
      id: r.id,
      status: r.status,
      apartmentSize: r.apartmentSize,
      bathroomCount: r.bathroomCount,
      description: r.description,
      propertyId: r.propertyId,
      propertyName: r.propertyName,
      propertyBuilding: r.propertyBuilding,
      managerId: r.managerId,
      managerName: r.managerName,
      managerActive: r.managerActive,
      requestedByContactId: r.requestedByContactId,
      requestedByContactName: r.requestedByContactName,
      periodLabel: formatPeriod(r.plannedStartDate, r.plannedEndDate),
      plannedStartIso: r.plannedStartDate
        ? r.plannedStartDate.toISOString().slice(0, 10)
        : null,
      plannedEndIso: r.plannedEndDate
        ? r.plannedEndDate.toISOString().slice(0, 10)
        : null,
      actualStartFormatted: r.actualStartDate ? formatDate(r.actualStartDate) : null,
      actualEndFormatted: r.actualEndDate ? formatDate(r.actualEndDate) : null,
      activityTotal: r.activityTotal,
      activityDone: r.activityDone,
      // null = either out-of-scope status (draft/cancelled) or no overage.
      // The table distinguishes by reading showCapacityChip separately.
      capacityChip: worstOverage,
      capacityChipApplies: showCapacity,
      createdAtFormatted: formatDate(r.createdAt),
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl text-neutral-900">Ремонти</h1>
            <PageHelp
              content={
                <p>
                  Проектите по ремонти на имоти, които компанията е продала и
                  предала. Всеки ремонт е свързан с един имот. Дейностите се
                  избират от каталог при създаване и се нареждат
                  автоматично в график.
                </p>
              }
            />
          </div>
          <p className="text-base text-neutral-600">
            {total === 0
              ? "Няма намерени ремонти."
              : `Показани ${rangeStart}–${rangeEnd} от ${total}.`}
          </p>
        </div>
        <Link href={"/renovations/new" as Route}>
          <Button>+ Нов ремонт</Button>
        </Link>
      </div>

      <RenovationsKpiStrip
        kpis={kpis}
        scope={hasAnyFilter ? "За филтрите по-долу" : "За цялата компания"}
      />

      <RenovationFilters
        buildings={buildingOpts}
        owners={owners}
      />

      <RenovationsListView
        rows={vmRows}
        managerOptions={owners.map((o) => ({ id: o.id, fullName: o.fullName }))}
        dangerDays={portfolioDangerDays}
        canDelete={me.role === "admin"}
      />

      {totalPages > 1 && (
        <nav className="flex items-center justify-between gap-2 pt-1">
          <div className="text-sm text-neutral-500">
            Страница {filters.page} от {totalPages}
          </div>
          <div className="flex items-center gap-2">
            {filters.page > 1 ? (
              <Link href={pageHref(filters, filters.page - 1)}>
                <Button variant="secondary" size="sm">
                  ← Предишна
                </Button>
              </Link>
            ) : (
              <Button variant="secondary" size="sm" disabled>
                ← Предишна
              </Button>
            )}
            {filters.page < totalPages ? (
              <Link href={pageHref(filters, filters.page + 1)}>
                <Button variant="secondary" size="sm">
                  Следваща →
                </Button>
              </Link>
            ) : (
              <Button variant="secondary" size="sm" disabled>
                Следваща →
              </Button>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
