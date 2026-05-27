import { prisma } from "@/lib/prisma";

// Aggregates for the admin absence dashboard. 5 KPIs per the scope the user
// set earlier (a subset of the spec's 16). Each function is read-only and
// runs the minimal query set needed. Safe to call in parallel.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type PaceTone = "success" | "warning" | "danger";

export type CompanyBalance = {
  pool: number; // sum of annualDays + applicable carryoverDays
  taken: number; // approved PAID with start <= today
  scheduled: number; // approved PAID with start > today
  remaining: number; // pool - taken - scheduled (floored at 0)
};

export type AbsenceCounts = {
  today: number;
  thisWeek: number;
  thisMonth: number;
  outToday: Array<{
    employeeName: string;
    categoryLabel: string;
    colorHex: string;
    endDate: Date;
  }>;
};

export type PaceRatio = {
  usedPercent: number; // 0..1
  yearElapsedPercent: number; // 0..1
  ratio: number | null; // null if elapsed is 0
  tone: PaceTone;
};

export type AnomalyCounts = Record<string, number>;

export type CarryoverAtRisk = {
  totalDaysAtRisk: number;
  employeesWithRisk: number;
};

// ── helpers ──────────────────────────────────────────────────────────────────

function yearRange(year: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year + 1, 0, 1)),
  };
}

function startOfWeek(d: Date): Date {
  const day = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  const start = new Date(d);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - day);
  return start;
}

// ── queries ─────────────────────────────────────────────────────────────────

export async function getCompanyBalance(year: number): Promise<CompanyBalance> {
  const { start, end } = yearRange(year);

  const [profilesAgg, paid] = await Promise.all([
    prisma.profile.aggregate({
      where: { active: true },
      _sum: { annualDays: true, carryoverDays: true },
    }),
    prisma.absenceRequest.findMany({
      where: {
        status: "approved",
        category: { deductsFromPaid: true },
        startDate: { gte: start, lt: end },
        employee: { active: true },
      },
      select: { workingDaysCount: true, startDate: true, employee: { select: { carryoverYear: true } } },
    }),
  ]);

  // Carryover only counts when the employee's carryoverYear matches the target year.
  // Aggregate above sums all carryover_days; we don't have the filter in SQL, so
  // filter in TS.
  const carryoverEligible = await prisma.profile.aggregate({
    where: { active: true, carryoverYear: year },
    _sum: { carryoverDays: true },
  });

  const annualPool = Number(profilesAgg._sum.annualDays ?? 0);
  const carryoverPool = Number(carryoverEligible._sum.carryoverDays ?? 0);
  const pool = annualPool + carryoverPool;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let taken = 0;
  let scheduled = 0;
  for (const r of paid) {
    const n = r.workingDaysCount.toNumber();
    if (r.startDate <= today) taken += n;
    else scheduled += n;
  }

  return { pool, taken, scheduled, remaining: Math.max(pool - taken - scheduled, 0) };
}

export async function getAbsenceCounts(): Promise<AbsenceCounts> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const weekStart = startOfWeek(today);
  const weekEnd = new Date(weekStart.getTime() + 6 * MS_PER_DAY);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));

  const [outToday, outWeekCount, outMonthCount] = await Promise.all([
    prisma.absenceRequest.findMany({
      where: {
        status: "approved",
        startDate: { lte: today },
        endDate: { gte: today },
        employee: { active: true },
      },
      select: {
        endDate: true,
        employee: { select: { fullName: true } },
        category: { select: { labelBg: true, colorHex: true } },
      },
      orderBy: { endDate: "asc" },
    }),
    prisma.absenceRequest.count({
      where: {
        status: "approved",
        startDate: { lte: weekEnd },
        endDate: { gte: weekStart },
        employee: { active: true },
      },
    }),
    prisma.absenceRequest.count({
      where: {
        status: "approved",
        startDate: { lte: monthEnd },
        endDate: { gte: monthStart },
        employee: { active: true },
      },
    }),
  ]);

  return {
    today: outToday.length,
    thisWeek: outWeekCount,
    thisMonth: outMonthCount,
    outToday: outToday.map((r) => ({
      employeeName: r.employee.fullName,
      categoryLabel: r.category.labelBg,
      colorHex: r.category.colorHex,
      endDate: r.endDate,
    })),
  };
}

export async function getCompanyPace(
  year: number,
  balance?: CompanyBalance,
): Promise<PaceRatio> {
  const b = balance ?? (await getCompanyBalance(year));

  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  const now = Math.min(Date.now(), yearEnd.getTime());
  const yearElapsedMs = now - yearStart.getTime();
  const yearTotalMs = yearEnd.getTime() - yearStart.getTime();
  const yearElapsedPercent = yearTotalMs > 0 ? yearElapsedMs / yearTotalMs : 0;

  const usedPercent = b.pool > 0 ? b.taken / b.pool : 0;
  const ratio = yearElapsedPercent > 0 ? usedPercent / yearElapsedPercent : null;

  let tone: PaceTone = "success";
  if (ratio !== null) {
    if (ratio >= 1.5) tone = "danger";
    else if (ratio >= 1.0) tone = "warning";
  }

  return { usedPercent, yearElapsedPercent, ratio, tone };
}

export async function getOpenAnomalies(): Promise<AnomalyCounts> {
  const rows = await prisma.anomalyFlag.groupBy({
    by: ["rule"],
    where: { resolvedAt: null },
    _count: { _all: true },
  });
  const result: AnomalyCounts = {};
  for (const r of rows) result[r.rule] = r._count._all;
  return result;
}

export async function getCarryoverAtRisk(year: number): Promise<CarryoverAtRisk> {
  const employees = await prisma.profile.findMany({
    where: { active: true },
    select: {
      id: true,
      annualDays: true,
      carryoverDays: true,
      carryoverYear: true,
    },
  });

  if (employees.length === 0) {
    return { totalDaysAtRisk: 0, employeesWithRisk: 0 };
  }

  const { start, end } = yearRange(year);
  const approvedPaid = await prisma.absenceRequest.findMany({
    where: {
      status: "approved",
      category: { deductsFromPaid: true },
      startDate: { gte: start, lt: end },
      employee: { active: true },
    },
    select: { employeeId: true, workingDaysCount: true },
  });

  const usedByEmp = new Map<string, number>();
  for (const r of approvedPaid) {
    usedByEmp.set(
      r.employeeId,
      (usedByEmp.get(r.employeeId) ?? 0) + r.workingDaysCount.toNumber(),
    );
  }

  const MAX_CARRYOVER = 10;
  let totalDaysAtRisk = 0;
  let employeesWithRisk = 0;

  for (const emp of employees) {
    const annual = emp.annualDays.toNumber();
    const carryover = emp.carryoverYear === year ? emp.carryoverDays.toNumber() : 0;
    const used = usedByEmp.get(emp.id) ?? 0;
    const unused = annual + carryover - used;
    const atRisk = Math.max(0, unused - MAX_CARRYOVER);
    if (atRisk > 0) {
      totalDaysAtRisk += atRisk;
      employeesWithRisk += 1;
    }
  }

  return { totalDaysAtRisk, employeesWithRisk };
}
