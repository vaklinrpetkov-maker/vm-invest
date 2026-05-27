import { prisma } from "@/lib/prisma";

// Reads for the Building table. Used by the navigator sidebar, the filter
// dropdowns, and the admin CRUD page.

export type BuildingOption = {
  id: string;
  storageName: string;
  displayName: string;
  complex: string | null;
  active: boolean;
};

export async function listActiveBuildings(): Promise<BuildingOption[]> {
  const rows = await prisma.building.findMany({
    where: { active: true },
    orderBy: [{ complex: "asc" }, { displayName: "asc" }],
    select: {
      id: true,
      storageName: true,
      displayName: true,
      complex: true,
      active: true,
    },
  });
  return rows;
}

export async function listAllBuildings(): Promise<
  (BuildingOption & { propertyCount: number })[]
> {
  const [rows, counts] = await Promise.all([
    prisma.building.findMany({
      orderBy: [{ active: "desc" }, { complex: "asc" }, { displayName: "asc" }],
      select: {
        id: true,
        storageName: true,
        displayName: true,
        complex: true,
        active: true,
      },
    }),
    prisma.property.groupBy({
      by: ["buildingId"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
  ]);
  const countByBuilding = new Map(counts.map((c) => [c.buildingId, c._count._all]));
  return rows.map((r) => ({ ...r, propertyCount: countByBuilding.get(r.id) ?? 0 }));
}

// Tree used by the navigator sidebar on the Properties list page. Groups
// active buildings by `complex`; standalone buildings land in the `null`
// bucket. Each node carries the live (non-deleted) property count.
export type NavigatorNode = {
  complex: string | null; // null = standalone bucket
  buildings: Array<{
    id: string;
    displayName: string;
    storageName: string;
    propertyCount: number;
  }>;
  complexTotal: number;
};

export async function getBuildingNavigator(): Promise<NavigatorNode[]> {
  const [rows, counts] = await Promise.all([
    prisma.building.findMany({
      where: { active: true },
      orderBy: [{ complex: "asc" }, { displayName: "asc" }],
      select: {
        id: true,
        storageName: true,
        displayName: true,
        complex: true,
      },
    }),
    prisma.property.groupBy({
      by: ["buildingId"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
  ]);
  const countByBuilding = new Map(counts.map((c) => [c.buildingId, c._count._all]));

  const byComplex = new Map<string | null, NavigatorNode>();
  for (const r of rows) {
    const key = r.complex ?? null;
    let node = byComplex.get(key);
    if (!node) {
      node = { complex: key, buildings: [], complexTotal: 0 };
      byComplex.set(key, node);
    }
    const propertyCount = countByBuilding.get(r.id) ?? 0;
    node.buildings.push({
      id: r.id,
      displayName: r.displayName,
      storageName: r.storageName,
      propertyCount,
    });
    node.complexTotal += propertyCount;
  }

  // Stable ordering: named complexes alphabetically, then standalone bucket.
  const named = [...byComplex.values()].filter((n) => n.complex !== null);
  const standalone = [...byComplex.values()].filter((n) => n.complex === null);
  named.sort((a, b) => (a.complex ?? "").localeCompare(b.complex ?? "", "bg"));
  return [...named, ...standalone];
}

export async function listDistinctComplexes(): Promise<string[]> {
  const rows = await prisma.building.findMany({
    where: { complex: { not: null } },
    distinct: ["complex"],
    select: { complex: true },
    orderBy: { complex: "asc" },
  });
  return rows.map((r) => r.complex!).filter((c): c is string => typeof c === "string");
}

// Aggregate snapshot for the building overview strip shown above the
// properties table when a user drills into a single building via the
// navigator. Pure read; the UI is collapsible and informational only.
// See specs/properties.md §4.4.
export type BuildingOverview = {
  id: string;
  displayName: string;
  total: number;
  available: number; // count of status = Свободен
  soldTotalPriceEur: string | null; // sum of priceEur across "Продаден Нот. Акт"
  soldCount: number;
  byStatus: Array<{ status: string; count: number }>;
  byType: Array<{ type: string; count: number }>;
};

export async function getBuildingOverview(
  buildingId: string,
): Promise<BuildingOverview | null> {
  const building = await prisma.building.findUnique({
    where: { id: buildingId },
    select: { id: true, displayName: true },
  });
  if (!building) return null;

  const baseWhere = { buildingId, deletedAt: null };
  const SOLD_STATUS = "Продаден Нот. Акт";
  const AVAILABLE_STATUS = "Свободен";

  const [total, byStatus, byType, soldAgg] = await Promise.all([
    prisma.property.count({ where: baseWhere }),
    prisma.property.groupBy({
      by: ["status"],
      where: baseWhere,
      _count: { _all: true },
    }),
    prisma.property.groupBy({
      by: ["type"],
      where: baseWhere,
      _count: { _all: true },
    }),
    prisma.property.aggregate({
      where: { ...baseWhere, status: SOLD_STATUS },
      _sum: { priceEur: true },
      _count: { _all: true },
    }),
  ]);

  const available = byStatus.find((r) => r.status === AVAILABLE_STATUS)?._count._all ?? 0;

  return {
    id: building.id,
    displayName: building.displayName,
    total,
    available,
    soldTotalPriceEur: soldAgg._sum.priceEur ? soldAgg._sum.priceEur.toString() : null,
    soldCount: soldAgg._count._all,
    byStatus: byStatus
      .map((r) => ({ status: r.status, count: r._count._all }))
      .sort((a, b) => b.count - a.count),
    byType: byType
      .map((r) => ({ type: r.type, count: r._count._all }))
      .sort((a, b) => b.count - a.count),
  };
}
