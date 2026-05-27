import { prisma } from "@/lib/prisma";

// Computes an employee's absence balance for a given year. See spec §"absence.balances_view".
// At our scale (25 employees × ~50 requests/year) live computation is trivial;
// no need for a materialized view.

export type AbsenceBalance = {
  year: number;
  annualDays: number;
  carryoverDays: number;
  paidTaken: number;
  paidScheduled: number;
  paidRemaining: number;
  sickYTD: number;
  unpaidYTD: number;
};

export async function getBalance(
  employeeId: string,
  year: number = new Date().getFullYear(),
): Promise<AbsenceBalance> {
  const [profile, approvedPaid, approvedSick, approvedUnpaid] = await Promise.all([
    prisma.profile.findUniqueOrThrow({
      where: { id: employeeId },
      select: { annualDays: true, carryoverDays: true, carryoverYear: true },
    }),
    prisma.absenceRequest.findMany({
      where: {
        employeeId,
        status: "approved",
        category: { deductsFromPaid: true },
        startDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
      },
      select: { workingDaysCount: true, startDate: true },
    }),
    prisma.absenceRequest.findMany({
      where: {
        employeeId,
        status: "approved",
        categoryCode: "SICK",
        startDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
      },
      select: { workingDaysCount: true },
    }),
    prisma.absenceRequest.findMany({
      where: {
        employeeId,
        status: "approved",
        categoryCode: "UNPAID",
        startDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
      },
      select: { workingDaysCount: true },
    }),
  ]);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const annualDays = profile.annualDays.toNumber();
  const carryoverDays = profile.carryoverYear === year ? profile.carryoverDays.toNumber() : 0;

  const paidTaken = approvedPaid
    .filter((r) => r.startDate <= today)
    .reduce((sum, r) => sum + r.workingDaysCount.toNumber(), 0);

  const paidScheduled = approvedPaid
    .filter((r) => r.startDate > today)
    .reduce((sum, r) => sum + r.workingDaysCount.toNumber(), 0);

  const paidRemaining = annualDays + carryoverDays - paidTaken - paidScheduled;

  const sickYTD = approvedSick.reduce((sum, r) => sum + r.workingDaysCount.toNumber(), 0);
  const unpaidYTD = approvedUnpaid.reduce((sum, r) => sum + r.workingDaysCount.toNumber(), 0);

  return {
    year,
    annualDays,
    carryoverDays,
    paidTaken,
    paidScheduled,
    paidRemaining: Math.max(paidRemaining, 0),
    sickYTD,
    unpaidYTD,
  };
}
