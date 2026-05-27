import type {
  ApartmentSize,
  Prisma,
  RenovationStatus,
  RenovationTaskStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeCapacity, countCapacityOverageDaysNext90 } from "./capacity";
import type { ParsedRenovationFilters } from "./filters";

// Per-module queries for `/renovations`. Same shape as the queries libs in
// Contacts / Properties — page query returns rows + total; per-record
// queries return raw Prisma rows that the page transforms for display.
//
// Pivot (20.05.2026): activities replace tasks. Progress + KPIs count
// `RenovationActivity` rows; `RenovationTask` rows from the free-task era
// are no longer surfaced anywhere (the model lingers in the schema for
// historical readability and will be retired in Round 5).

export type RenovationListRow = {
  id: string;
  status: RenovationStatus;
  apartmentSize: ApartmentSize | null;
  bathroomCount: number | null;
  description: string | null;
  propertyId: string;
  propertyName: string;
  propertyBuilding: string;
  requestedByContactId: string | null;
  requestedByContactName: string | null;
  managerId: string | null;
  managerName: string | null;
  managerActive: boolean | null;
  plannedStartDate: Date | null;
  plannedEndDate: Date | null;
  actualStartDate: Date | null;
  actualEndDate: Date | null;
  activityTotal: number;
  activityDone: number;
  // Slim per-activity slice used by the Капацитет column on the list table
  // (spec §5.1 #7). Pulled here so the page transformer can walk each row
  // against the already-computed capacity map without a second query.
  // `null` teamId = outsourced (no capacity contribution).
  activities: ReadonlyArray<{
    teamId: string | null;
    startDate: Date | null;
    endDate: Date | null;
    peopleRequired: number;
    status: RenovationTaskStatus;
  }>;
  createdAt: Date;
};

// Today at UTC midnight — used by the overdue filter + the KPI tiles. One
// helper so both surfaces agree on "now."
function todayUtcMidnight(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Build the `where` clause shared by the list query + the count.
function buildWhere(f: ParsedRenovationFilters): Prisma.RenovationWhereInput {
  const where: Prisma.RenovationWhereInput = { deletedAt: null };
  if (f.statuses.length > 0) where.status = { in: f.statuses };
  if (f.apartmentSizes.length > 0) where.apartmentSize = { in: f.apartmentSizes };
  if (f.managerIds.length > 0) {
    // The synthetic "none" sentinel from the filter bar maps to
    // `managerId IS NULL`. Mix with real ids via an OR so a user can
    // narrow to "Без отговорник + конкретен човек" at once.
    const hasNone = f.managerIds.includes("none");
    const realIds = f.managerIds.filter((id) => id !== "none");
    const orParts: Prisma.RenovationWhereInput[] = [];
    if (realIds.length > 0) orParts.push({ managerId: { in: realIds } });
    if (hasNone) orParts.push({ managerId: null });
    if (orParts.length === 1) {
      Object.assign(where, orParts[0]);
    } else if (orParts.length > 1) {
      where.OR = [...(where.OR ?? []), ...orParts];
    }
  }
  if (f.buildingIds.length > 0) where.property = { buildingId: { in: f.buildingIds } };
  if (f.requestedByContactId) where.requestedByContactId = f.requestedByContactId;
  if (f.plannedFrom || f.plannedTo) {
    const range: Prisma.DateTimeFilter = {};
    if (f.plannedFrom) range.gte = f.plannedFrom;
    if (f.plannedTo) {
      // `to` is inclusive — add 24h so anything on that day matches.
      range.lte = new Date(f.plannedTo.getTime() + 24 * 60 * 60 * 1000 - 1);
    }
    where.plannedStartDate = range;
  }
  if (f.overdueOnly) {
    // Spec §5.1: plannedEndDate strictly before today AND status NOT IN
    // (done, cancelled).
    where.plannedEndDate = { lt: todayUtcMidnight() };
    const statusExclude = ["done", "cancelled"] as const;
    if (f.statuses.length > 0) {
      where.status = {
        in: f.statuses.filter((s) => !statusExclude.includes(s as typeof statusExclude[number])),
      };
    } else {
      where.status = { notIn: [...statusExclude] };
    }
  }
  // `capacityOver` is handled by `listRenovationsForPage` directly — it
  // requires the cross-portfolio capacity result, not just a SQL where
  // clause. Left out of buildWhere().
  if (f.q) {
    // ILIKE across description / linked property name + contact name.
    // Title is dropped (derived display), so search across the remaining
    // textual surfaces.
    where.OR = [
      { description: { contains: f.q, mode: "insensitive" } },
      { property: { name: { contains: f.q, mode: "insensitive" } } },
      { requestedByContact: { fullName: { contains: f.q, mode: "insensitive" } } },
    ];
  }
  return where;
}

export async function listRenovationsForPage(
  f: ParsedRenovationFilters,
  pagination: { skip: number; take: number },
  opts?: {
    // Pre-computed portfolio-wide overage days (ISO-day strings). When
    // `f.capacityOver` is on we use this set to narrow the result without
    // running a second capacity query. Callers that already computed
    // capacity for the page (the renovations index page) pass it in;
    // others (the dashboard, future ad-hoc callers) leave it undefined
    // and the function computes lazily.
    precomputedOverageDays?: ReadonlySet<string>;
  },
): Promise<{ rows: RenovationListRow[]; total: number }> {
  const where = buildWhere(f);

  // `capacityOver` filter — restricts to renovations whose plannedWindow
  // intersects any portfolio-overage day.
  if (f.capacityOver) {
    let overageIsoSet: ReadonlySet<string>;
    if (opts?.precomputedOverageDays !== undefined) {
      overageIsoSet = opts.precomputedOverageDays;
    } else {
      // Lazy path — compute capacity over the union of all active
      // renovations' planned windows. Avoid in the page case by passing
      // `precomputedOverageDays` above.
      const dated = await prisma.renovation.findMany({
        where: { deletedAt: null, status: { notIn: ["cancelled"] } },
        select: { plannedStartDate: true, plannedEndDate: true },
      });
      const ranges = dated.filter(
        (r): r is { plannedStartDate: Date; plannedEndDate: Date } =>
          r.plannedStartDate !== null && r.plannedEndDate !== null,
      );
      if (ranges.length === 0) return { rows: [], total: 0 };
      let min = ranges[0].plannedStartDate.getTime();
      let max = ranges[0].plannedEndDate.getTime();
      for (const r of ranges) {
        const s = r.plannedStartDate.getTime();
        const e = r.plannedEndDate.getTime();
        if (s < min) min = s;
        if (e > max) max = e;
      }
      const cap = await computeCapacity({
        windowStart: new Date(min),
        windowEnd: new Date(max),
      });
      overageIsoSet = cap.overageDays;
    }
    if (overageIsoSet.size === 0) return { rows: [], total: 0 };

    // Resolve to ids: which active renovations have a planned window that
    // intersects any overage day.
    const dated = await prisma.renovation.findMany({
      where: { deletedAt: null, status: { notIn: ["cancelled"] } },
      select: { id: true, plannedStartDate: true, plannedEndDate: true },
    });
    const overTimes = Array.from(overageIsoSet).map((iso) =>
      new Date(`${iso}T00:00:00Z`).getTime(),
    );
    const matching: string[] = [];
    for (const r of dated) {
      if (!r.plannedStartDate || !r.plannedEndDate) continue;
      const start = r.plannedStartDate.getTime();
      const end = r.plannedEndDate.getTime();
      if (overTimes.some((t) => t >= start && t <= end)) matching.push(r.id);
    }
    if (matching.length === 0) return { rows: [], total: 0 };
    where.id = { in: matching };
  }

  const [rows, total] = await Promise.all([
    prisma.renovation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
      include: {
        property: {
          select: {
            id: true,
            name: true,
            building: { select: { displayName: true } },
          },
        },
        requestedByContact: { select: { id: true, fullName: true } },
        manager: { select: { id: true, fullName: true, active: true } },
        activities: {
          select: {
            status: true,
            teamId: true,
            startDate: true,
            endDate: true,
            peopleRequired: true,
          },
        },
      },
    }),
    prisma.renovation.count({ where }),
  ]);

  const out: RenovationListRow[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    apartmentSize: r.apartmentSize,
    bathroomCount: r.bathroomCount,
    description: r.description,
    propertyId: r.property.id,
    propertyName: r.property.name,
    propertyBuilding: r.property.building.displayName,
    requestedByContactId: r.requestedByContact?.id ?? null,
    requestedByContactName: r.requestedByContact?.fullName ?? null,
    managerId: r.manager?.id ?? null,
    managerName: r.manager?.fullName ?? null,
    managerActive: r.manager?.active ?? null,
    plannedStartDate: r.plannedStartDate,
    plannedEndDate: r.plannedEndDate,
    actualStartDate: r.actualStartDate,
    actualEndDate: r.actualEndDate,
    activityTotal: r.activities.length,
    activityDone: r.activities.filter((a) => a.status === "done").length,
    activities: r.activities.map((a) => ({
      teamId: a.teamId,
      startDate: a.startDate,
      endDate: a.endDate,
      peopleRequired: a.peopleRequired,
      status: a.status,
    })),
    createdAt: r.createdAt,
  }));

  return { rows: out, total };
}

// Single-record fetch for the detail / edit page. Includes everything the
// detail page needs in one round-trip (activities + status history +
// relations).
export async function getRenovationById(id: string) {
  return prisma.renovation.findUnique({
    where: { id },
    include: {
      property: {
        select: {
          id: true,
          name: true,
          entrance: true,
          floor: true,
          status: true,
          type: true,
          bathroomCount: true,
          contractId: true,
          building: { select: { id: true, displayName: true } },
        },
      },
      requestedByContact: {
        select: { id: true, fullName: true, phone: true, email: true },
      },
      manager: { select: { id: true, fullName: true, email: true, active: true } },
      createdBy: { select: { fullName: true } },
      activities: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          team: { select: { id: true, name: true, specialty: true } },
        },
      },
      statusHistory: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { author: { select: { fullName: true } } },
      },
    },
  });
}

// Helper for "+ Добави дейност" on the renovation detail page: returns the
// non-soft-deleted templates that are NOT already loaded onto this
// renovation (strict one-of-each per locked answer 7). Ordered by catalog
// `sortOrder` so the sub-modal mirrors the loader checklist.
export async function listAvailableTemplatesForRenovation(renovationId: string) {
  const loaded = await prisma.renovationActivity.findMany({
    where: { renovationId },
    select: { templateId: true },
  });
  const loadedIds = loaded
    .map((a) => a.templateId)
    .filter((id): id is string => id !== null);

  return prisma.activityTemplate.findMany({
    where: {
      deletedAt: null,
      ...(loadedIds.length > 0 ? { id: { notIn: loadedIds } } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      teamId: true,
      peopleRequired: true,
      bathroomMultiplied: true,
      durationStudio: true,
      durationTwoRoom: true,
      durationThreeRoom: true,
      durationFourRoom: true,
      sortOrder: true,
      team: { select: { name: true, specialty: true } },
    },
  });
}

// KPI strip on `/renovations` per spec §5.4. Five tiles in the
// template-driven model:
//   1. Активни проекти       — quoted + approved + in_progress
//   2. В процес сега         — in_progress; subtitle = open activities
//   3. Просрочени            — plannedEndDate < today, status NOT IN (done, cancelled)
//   4. Превишен капацитет    — added in R4 (capacity overlay round)
//   5. Завършени тримесечие  — done in the current calendar quarter
//
// R3 ships KPIs 1, 2, 3, 5. KPI 4 (capacity overage) is wired in R4 when
// the capacity lib + portfolio Gantt overlay land.

export type RenovationKpis = {
  activeProjects: number;
  inProgressNow: number;
  inProgressOpenActivities: number;
  overdue: number;
  // Count of distinct ISO-days in the next 90 days where at least one team
  // is over capacity across the portfolio. Computed by lib/renovations/
  // capacity.ts; ignored by the user's other filters by design (capacity
  // is portfolio-wide — the tile shows the global signal regardless of
  // which renovations the user has scoped to).
  capacityOverageDaysNext90: number;
  completedThisQuarter: number;
};

// Strip the user's status filter so a KPI can apply its own. Returns a new
// filter object — the original is left untouched (callers pass it to the
// list query separately).
function stripStatusFilter(
  f: ParsedRenovationFilters,
): ParsedRenovationFilters {
  // KPIs apply their own status predicates and ignore capacityOver
  // (capacity is portfolio-wide; KPI 4 reports it explicitly).
  return { ...f, statuses: [], overdueOnly: false, capacityOver: false };
}

// Current calendar-quarter window in UTC. [start, nextQuarterStart).
function currentQuarterRange(): { start: Date; nextStart: Date } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const qStartMonth = Math.floor(m / 3) * 3;
  const start = new Date(Date.UTC(y, qStartMonth, 1));
  const nextStart = new Date(Date.UTC(y, qStartMonth + 3, 1));
  return { start, nextStart };
}

export async function computeRenovationKpis(
  f: ParsedRenovationFilters,
  opts?: {
    // Pre-computed overage count to avoid re-querying capacity here when
    // the caller already has the data. Used by `/renovations/page.tsx`
    // which computes capacity once for the page (the KPI tile + the
    // portfolio Gantt danger bands + the optional list filter all share
    // the same overage set).
    precomputedCapacityOverage90?: number;
  },
): Promise<RenovationKpis> {
  const baseWithoutStatus = buildWhere(stripStatusFilter(f));
  const today = todayUtcMidnight();
  const { start: qStart, nextStart: qNext } = currentQuarterRange();

  // Sequential awaits — the Supabase pooler runs at connection_limit=1 in
  // this project's setup, so wide Promise.all() fan-out causes the
  // "Timed out fetching a new connection from the connection pool" error
  // (see decisions.md / runtime error 20.05.2026). Same fix shape we
  // used for the invoice detail page.
  const activeProjects = await prisma.renovation.count({
    where: {
      ...baseWithoutStatus,
      status: { in: ["quoted", "approved", "in_progress"] },
    },
  });
  const inProgressRenovations = await prisma.renovation.findMany({
    where: { ...baseWithoutStatus, status: "in_progress" },
    select: { id: true },
  });
  const overdue = await prisma.renovation.count({
    where: {
      ...baseWithoutStatus,
      plannedEndDate: { lt: today },
      status: { notIn: ["done", "cancelled"] },
    },
  });
  const completedThisQuarter = await prisma.renovation.count({
    where: {
      ...baseWithoutStatus,
      status: "done",
      updatedAt: { gte: qStart, lt: qNext },
    },
  });

  // Open-activity count subtitle for KPI 2. Counted across all in-progress
  // renovations the user is viewing.
  let inProgressOpenActivities = 0;
  if (inProgressRenovations.length > 0) {
    inProgressOpenActivities = await prisma.renovationActivity.count({
      where: {
        renovationId: { in: inProgressRenovations.map((r) => r.id) },
        status: { notIn: ["done", "cancelled"] },
      },
    });
  }

  const capacityOverageDaysNext90 =
    opts?.precomputedCapacityOverage90 !== undefined
      ? opts.precomputedCapacityOverage90
      : await countCapacityOverageDaysNext90();

  return {
    activeProjects,
    inProgressNow: inProgressRenovations.length,
    inProgressOpenActivities,
    overdue,
    capacityOverageDaysNext90,
    completedThisQuarter,
  };
}

// Compact list used by the Ремонти relations tab on /properties/[id].
export async function listRenovationsByProperty(propertyId: string) {
  return prisma.renovation.findMany({
    where: { propertyId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      manager: { select: { id: true, fullName: true, active: true } },
      activities: { select: { status: true } },
      property: { select: { name: true, building: { select: { displayName: true } } } },
    },
  });
}

// Compact list used by the Ремонти relations tab on /contacts/[id].
// Matches by `requestedByContactId` (the contact who asked for the work).
export async function listRenovationsByContact(contactId: string) {
  return prisma.renovation.findMany({
    where: { requestedByContactId: contactId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      property: {
        select: { id: true, name: true, building: { select: { displayName: true } } },
      },
      activities: { select: { status: true } },
    },
  });
}

// Helper for the status auto-stamp rule per spec §3.1: moving to
// `in_progress` auto-fills `actualStartDate` if blank; moving to `done`
// auto-fills `actualEndDate` if blank. Used by `setRenovationStatus`.
export function autoStampDatesFor(
  toStatus: RenovationStatus,
  current: { actualStartDate: Date | null; actualEndDate: Date | null },
): { actualStartDate?: Date; actualEndDate?: Date } {
  const patch: { actualStartDate?: Date; actualEndDate?: Date } = {};
  if (toStatus === "in_progress" && current.actualStartDate === null) {
    patch.actualStartDate = new Date();
  }
  if (toStatus === "done" && current.actualEndDate === null) {
    patch.actualEndDate = new Date();
  }
  return patch;
}

// Re-export the Prisma activity-status enum (we reuse `RenovationTaskStatus`
// for `RenovationActivity.status` — the four states are identical and there
// was no reason to add a second enum).
export type { RenovationTaskStatus };
