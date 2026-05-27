"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export type UpdateEmployeeResult =
  | { ok: true }
  | { ok: false; error: string };

// Updates one or more absence-specific fields on a profile. Each field is
// optional in the payload — only sent fields are written. Any change is
// recorded as a single `absence.balance.set` audit event with before/after
// JSON so admins can trace who adjusted what.
export async function updateEmployee(formData: FormData): Promise<UpdateEmployeeResult> {
  const actor = await requireRole("admin");
  const employeeId = String(formData.get("employeeId") ?? "");
  if (!employeeId) return { ok: false, error: "Невалидна заявка." };

  const managerIdRaw = formData.get("managerId");
  const annualDaysRaw = formData.get("annualDays");
  const carryoverDaysRaw = formData.get("carryoverDays");
  const hireDateRaw = formData.get("hireDate");

  const before = await prisma.profile.findUnique({
    where: { id: employeeId },
    select: {
      managerId: true,
      annualDays: true,
      carryoverDays: true,
      carryoverYear: true,
      hireDate: true,
    },
  });
  if (!before) return { ok: false, error: "Служителят не съществува." };

  const patch: {
    managerId?: string | null;
    annualDays?: number;
    carryoverDays?: number;
    carryoverYear?: number;
    hireDate?: Date | null;
  } = {};

  if (managerIdRaw !== null) {
    const value = String(managerIdRaw);
    if (value === "") {
      patch.managerId = null;
    } else if (value === employeeId) {
      return { ok: false, error: "Служителят не може да е собствен мениджър." };
    } else {
      const manager = await prisma.profile.findUnique({
        where: { id: value },
        select: { active: true },
      });
      if (!manager?.active) return { ok: false, error: "Избраният мениджър е неактивен." };
      patch.managerId = value;
    }
  }

  if (annualDaysRaw !== null) {
    const n = Number(annualDaysRaw);
    if (!Number.isFinite(n) || n < 0 || n > 60) {
      return { ok: false, error: "Годишните дни трябва да са между 0 и 60." };
    }
    patch.annualDays = n;
  }

  if (carryoverDaysRaw !== null) {
    const n = Number(carryoverDaysRaw);
    if (!Number.isFinite(n) || n < 0 || n > 10) {
      return { ok: false, error: "Пренесените дни трябва да са между 0 и 10." };
    }
    patch.carryoverDays = n;
    patch.carryoverYear = new Date().getFullYear();
  }

  if (hireDateRaw !== null) {
    const value = String(hireDateRaw);
    patch.hireDate = value === "" ? null : new Date(`${value}T00:00:00Z`);
  }

  if (Object.keys(patch).length === 0) return { ok: true };

  await prisma.profile.update({ where: { id: employeeId }, data: patch });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    action: "absence.balance.set",
    targetType: "profile",
    targetId: employeeId,
    before: {
      managerId: before.managerId,
      annualDays: before.annualDays.toString(),
      carryoverDays: before.carryoverDays.toString(),
      carryoverYear: before.carryoverYear,
      hireDate: before.hireDate?.toISOString() ?? null,
    },
    after: {
      managerId: patch.managerId ?? null,
      annualDays: patch.annualDays ?? null,
      carryoverDays: patch.carryoverDays ?? null,
      carryoverYear: patch.carryoverYear ?? null,
      hireDate: patch.hireDate?.toISOString() ?? null,
    },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/admin/employees");
  return { ok: true };
}
