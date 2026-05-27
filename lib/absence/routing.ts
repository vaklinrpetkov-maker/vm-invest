import { prisma } from "@/lib/prisma";

// Resolve who approves a given employee's request.
//
// Spec §"Manager-delegation routing":
//   1. Start with requester's managerId.
//   2. If that person has an approved absence covering today → climb.
//   3. If chain ends → any active admin who isn't the requester and isn't absent today.
//   4. Self-approval is hard-blocked at the DB via trigger.
//
// In M2 we implement (1) + (3) but NOT (2) — no "walk past absent approvers"
// yet. That's an M3 enhancement once we have a body of approved requests to
// check against. For now, managerId is trusted to be present and active.

export async function resolveApprover(employeeId: string): Promise<string | null> {
  const employee = await prisma.profile.findUnique({
    where: { id: employeeId },
    select: { managerId: true },
  });

  if (employee?.managerId) {
    const manager = await prisma.profile.findUnique({
      where: { id: employee.managerId },
      select: { id: true, active: true },
    });
    if (manager?.active && manager.id !== employeeId) return manager.id;
  }

  // Fallback: any active admin who isn't the requester.
  const admin = await prisma.profile.findFirst({
    where: { role: "admin", active: true, NOT: { id: employeeId } },
    select: { id: true },
  });
  return admin?.id ?? null;
}
