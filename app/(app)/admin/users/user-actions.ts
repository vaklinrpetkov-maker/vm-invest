"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const ALLOWED_ROLES: Role[] = ["admin", "manager", "user"];

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function changeUserRole(formData: FormData): Promise<ActionResult> {
  const actor = await requireRole("admin");
  const profileId = String(formData.get("profileId") ?? "");
  const newRoleRaw = String(formData.get("role") ?? "");
  const newRole = ALLOWED_ROLES.includes(newRoleRaw as Role) ? (newRoleRaw as Role) : null;
  if (!profileId || !newRole) return { ok: false, error: "Невалидна заявка." };

  const target = await prisma.profile.findUnique({ where: { id: profileId } });
  if (!target) return { ok: false, error: "Потребителят не съществува." };
  if (target.role === newRole) return { ok: true };

  // Last-admin protection: can't demote the only remaining active admin.
  if (target.role === "admin" && newRole !== "admin") {
    const activeAdmins = await prisma.profile.count({
      where: { role: "admin", active: true, NOT: { id: profileId } },
    });
    if (activeAdmins === 0) {
      return { ok: false, error: "Не може да премахнете последния активен администратор." };
    }
  }

  await prisma.profile.update({
    where: { id: profileId },
    data: { role: newRole },
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    action: "auth.role.changed",
    targetType: "profile",
    targetId: profileId,
    payload: { from: target.role, to: newRole, target_email: target.email },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setUserActive(formData: FormData): Promise<ActionResult> {
  const actor = await requireRole("admin");
  const profileId = String(formData.get("profileId") ?? "");
  const active = formData.get("active") === "true";
  if (!profileId) return { ok: false, error: "Невалидна заявка." };

  const target = await prisma.profile.findUnique({ where: { id: profileId } });
  if (!target) return { ok: false, error: "Потребителят не съществува." };
  if (target.active === active) return { ok: true };

  // An admin can't deactivate themselves (would lock them out mid-action).
  if (!active && target.id === actor.id) {
    return { ok: false, error: "Не може да деактивирате собствения си акаунт." };
  }

  // Last-admin protection: can't deactivate the only remaining active admin.
  if (!active && target.role === "admin") {
    const activeAdmins = await prisma.profile.count({
      where: { role: "admin", active: true, NOT: { id: profileId } },
    });
    if (activeAdmins === 0) {
      return { ok: false, error: "Не може да деактивирате последния активен администратор." };
    }
  }

  await prisma.profile.update({
    where: { id: profileId },
    data: { active, deactivatedAt: active ? null : new Date() },
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    action: "auth.account.deactivated",
    targetType: "profile",
    targetId: profileId,
    payload: { active, target_email: target.email },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/admin/users");
  return { ok: true };
}
