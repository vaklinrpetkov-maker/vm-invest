"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { recordAuditEvent } from "@/lib/auth/audit";
import {
  generateInviteToken,
  inviteExpiresAt,
  inviteStatus,
} from "@/lib/auth/invite";
import { requireRole } from "@/lib/auth/session";
import { sendInviteEmail } from "@/lib/email/invite";
import { prisma } from "@/lib/prisma";

export type SendInviteState = {
  ok?: boolean;
  message?: string;
  errors?: { email?: string; role?: string; form?: string };
};

const ALLOWED_ROLES: Role[] = ["admin", "manager", "user"];

export async function sendInvite(
  _prev: SendInviteState,
  formData: FormData,
): Promise<SendInviteState> {
  const actor = await requireRole("admin");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const roleRaw = String(formData.get("role") ?? "");
  const role = ALLOWED_ROLES.includes(roleRaw as Role) ? (roleRaw as Role) : null;

  const errors: SendInviteState["errors"] = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Невалиден имейл адрес.";
  if (!role) errors.role = "Изберете роля.";
  if (Object.keys(errors).length) return { errors };

  // Reject if email already belongs to an active profile.
  const existingProfile = await prisma.profile.findUnique({ where: { email } });
  if (existingProfile && existingProfile.active) {
    return { errors: { email: "Този имейл вече има активен акаунт." } };
  }

  // If there's an unredeemed, uncancelled, unexpired invite for this email,
  // deactivate it and issue a new one (resend behavior, per spec §4.2).
  const liveInvite = await prisma.invite.findFirst({
    where: { email, redeemedAt: null, cancelledAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for") ?? null;
  const userAgent = hdrs.get("user-agent") ?? null;

  if (liveInvite) {
    await prisma.invite.update({
      where: { id: liveInvite.id },
      data: { cancelledAt: new Date() },
    });
    await recordAuditEvent({
      actorId: actor.id,
      action: "auth.invite.cancelled",
      targetType: "invite",
      targetId: liveInvite.id,
      payload: { email, reason: "superseded_by_resend" },
      ip,
      userAgent,
    });
  }

  const token = generateInviteToken();
  const invite = await prisma.invite.create({
    data: {
      email,
      role: role!,
      invitedById: actor.id,
      token,
      expiresAt: inviteExpiresAt(),
    },
  });

  try {
    await sendInviteEmail({
      to: email,
      token,
      role: role!,
      invitedByName: actor.fullName,
    });
  } catch (err) {
    console.error("[invite] send failed", err);
    return { errors: { form: "Поканата е създадена, но изпращането на имейл се провали. Опитайте отново." } };
  }

  await recordAuditEvent({
    actorId: actor.id,
    action: liveInvite ? "auth.invite.resent" : "auth.invite.sent",
    targetType: "invite",
    targetId: invite.id,
    payload: { email, role },
    ip,
    userAgent,
  });

  revalidatePath("/admin/users");

  return { ok: true, message: `Поканата е изпратена на ${email}.` };
}

export async function cancelInvite(formData: FormData): Promise<void> {
  const actor = await requireRole("admin");
  const inviteId = String(formData.get("inviteId") ?? "");

  const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
  if (!invite) return;
  if (inviteStatus(invite) !== "active") return;

  await prisma.invite.update({
    where: { id: inviteId },
    data: { cancelledAt: new Date() },
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    action: "auth.invite.cancelled",
    targetType: "invite",
    targetId: inviteId,
    payload: { email: invite.email, reason: "manual" },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/admin/users");
}
