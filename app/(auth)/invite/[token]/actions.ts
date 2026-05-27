"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/auth/audit";
import { inviteStatus } from "@/lib/auth/invite";
import {
  getSupabaseServerClient,
  getSupabaseServiceClient,
} from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export type RedeemState = {
  errors?: { fullName?: string; password?: string; form?: string };
};

const PASSWORD_MIN = 12;

export async function redeemInvite(
  _prev: RedeemState,
  formData: FormData,
): Promise<RedeemState> {
  const token = String(formData.get("token") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

  if (!token) return { errors: { form: "Невалиден линк." } };

  const errors: RedeemState["errors"] = {};
  if (fullName.length < 2) errors.fullName = "Моля, въведете пълно име.";
  if (password.length < PASSWORD_MIN) errors.password = `Паролата трябва да е поне ${PASSWORD_MIN} символа.`;
  if (password !== passwordConfirm) errors.password = "Паролите не съвпадат.";
  if (Object.keys(errors).length) return { errors };

  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite) return { errors: { form: "Поканата не е намерена." } };

  const status = inviteStatus(invite);
  if (status === "redeemed") return { errors: { form: "Тази покана вече е използвана." } };
  if (status === "cancelled") return { errors: { form: "Тази покана е отказана." } };
  if (status === "expired") return { errors: { form: "Тази покана е изтекла. Помолете администратор за нова." } };

  const admin = getSupabaseServiceClient();
  let userId: string;

  const created = await admin.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true,
    user_metadata: { role: invite.role, full_name: fullName },
  });

  if (created.data.user) {
    userId = created.data.user.id;
  } else if (created.error?.message?.toLowerCase().includes("already")) {
    // Auth user exists (e.g. someone tried before, or this email was previously
    // a deactivated profile we want to restore). Set their password and proceed.
    const list = await admin.auth.admin.listUsers();
    const existing = list.data.users.find((u) => u.email === invite.email);
    if (!existing) return { errors: { form: created.error?.message ?? "Грешка при създаване." } };
    userId = existing.id;
    await admin.auth.admin.updateUserById(userId, {
      password,
      user_metadata: { role: invite.role, full_name: fullName },
    });
  } else {
    return { errors: { form: created.error?.message ?? "Неуспешно създаване на акаунт." } };
  }

  // Upsert profile so this works whether or not the trigger created the row.
  // Force the role from the invite (don't trust whatever was on auth.users).
  await prisma.profile.upsert({
    where: { id: userId },
    update: { role: invite.role, fullName, active: true, email: invite.email },
    create: { id: userId, email: invite.email, fullName, role: invite.role },
  });

  await prisma.invite.update({
    where: { id: invite.id },
    data: { redeemedAt: new Date() },
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: userId,
    action: "auth.invite.redeemed",
    targetType: "invite",
    targetId: invite.id,
    payload: { email: invite.email, role: invite.role },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  // Sign the new user in immediately and bounce them to the home page.
  const supabase = await getSupabaseServerClient();
  const signin = await supabase.auth.signInWithPassword({
    email: invite.email,
    password,
  });
  if (signin.error) {
    return { errors: { form: "Акаунтът е създаден, но входа не успя. Моля, влезте ръчно от /login." } };
  }

  redirect("/");
}
