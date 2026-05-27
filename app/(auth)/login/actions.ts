"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/auth/audit";
import {
  clearFailedLogins,
  isLockedOut,
  recordFailedLogin,
} from "@/lib/auth/lockout";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export type LoginState = { error?: string };

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Моля, попълнете имейл и парола." };

  if (await isLockedOut(email)) {
    return {
      error:
        "Акаунтът е временно заключен заради множество неуспешни опити. Опитайте след 15 минути.",
    };
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for") ?? null;
  const userAgent = hdrs.get("user-agent") ?? null;

  if (error || !data.user) {
    const profile = await prisma.profile.findUnique({ where: { email } });
    await recordFailedLogin(email, profile?.id);
    await recordAuditEvent({
      actorId: profile?.id ?? null,
      action: "auth.login.failed",
      payload: { email, reason: error?.message ?? "unknown" },
      ip,
      userAgent,
    });
    return { error: "Грешен имейл или парола." };
  }

  const profile = await prisma.profile.findUnique({ where: { id: data.user.id } });
  if (!profile || !profile.active) {
    await supabase.auth.signOut();
    return { error: "Акаунтът е деактивиран. Свържете се с администратор." };
  }

  await clearFailedLogins(email);
  await recordAuditEvent({
    actorId: profile.id,
    action: "auth.login.success",
    ip,
    userAgent,
  });

  redirect("/");
}
