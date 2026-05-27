"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isBootstrap } from "@/lib/auth/bootstrap";
import { recordAuditEvent } from "@/lib/auth/audit";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export type BootstrapState = {
  ok?: boolean;
  errors?: { fullName?: string; email?: string; password?: string; form?: string };
};

const PASSWORD_MIN = 12;

export async function bootstrapFirstAdmin(
  _prev: BootstrapState,
  formData: FormData,
): Promise<BootstrapState> {
  if (!(await isBootstrap())) {
    return { errors: { form: "Системата вече е инициализирана." } };
  }

  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

  const errors: BootstrapState["errors"] = {};
  if (fullName.length < 2) errors.fullName = "Моля, въведете пълно име.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Невалиден имейл адрес.";
  if (password.length < PASSWORD_MIN) errors.password = `Паролата трябва да е поне ${PASSWORD_MIN} символа.`;
  if (password !== passwordConfirm) errors.password = "Паролите не съвпадат.";
  if (Object.keys(errors).length) return { errors };

  const admin = getSupabaseServiceClient();
  let userId: string;

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: "admin", full_name: fullName },
  });

  if (created.data.user) {
    userId = created.data.user.id;
  } else if (created.error?.message?.toLowerCase().includes("already")) {
    // Recovery from a partial first attempt: auth user exists but no profile.
    // Look the user up and overwrite their password to match what was just typed.
    const list = await admin.auth.admin.listUsers();
    const existing = list.data.users.find((u) => u.email === email);
    if (!existing) return { errors: { form: created.error?.message ?? "Грешка при създаване." } };
    userId = existing.id;
    await admin.auth.admin.updateUserById(userId, {
      password,
      user_metadata: { role: "admin", full_name: fullName },
    });
  } else {
    return { errors: { form: created.error?.message ?? "Неуспешно създаване на акаунт." } };
  }

  // Upsert so this works whether or not the auth-trigger migration was applied.
  await prisma.profile.upsert({
    where: { id: userId },
    update: { role: "admin", fullName, active: true },
    create: { id: userId, email, fullName, role: "admin" },
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: userId,
    action: "auth.bootstrap.first_admin",
    targetType: "profile",
    targetId: userId,
    payload: { email },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  // Sign the new admin in immediately so they land in the app.
  const supabase = await getSupabaseServerClient();
  const signin = await supabase.auth.signInWithPassword({ email, password });
  if (signin.error) {
    return { errors: { form: "Акаунтът е създаден, но входа не успя. Моля, влезте ръчно." } };
  }

  redirect("/");
}
