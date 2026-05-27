import { prisma } from "@/lib/prisma";

// Team is approximated by shared `managerId` — we don't have a department
// field on Profile (and won't until the user adds one). Fires on approve and
// captures any *other* approved absence by a teammate whose date range
// overlaps by at least one day.
//
// Single flag per newly-approved request. If multiple teammates already overlap
// with this one, we still write one row (the detail lives in the payload).
export async function detectTeamOverlapOnApprove(requestId: string): Promise<void> {
  const request = await prisma.absenceRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      employeeId: true,
      startDate: true,
      endDate: true,
      employee: { select: { managerId: true } },
    },
  });
  if (!request?.employee.managerId) return;

  const overlappingCount = await prisma.absenceRequest.count({
    where: {
      id: { not: request.id },
      status: "approved",
      startDate: { lte: request.endDate },
      endDate: { gte: request.startDate },
      employeeId: { not: request.employeeId },
      employee: { managerId: request.employee.managerId },
    },
  });

  if (overlappingCount === 0) return;

  await prisma.anomalyFlag.create({
    data: {
      requestId: request.id,
      rule: "team_overlap",
      severity: "warn",
    },
  });
}
