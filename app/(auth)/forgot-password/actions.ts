"use server";

import { headers } from "next/headers";
import { recordAuditEvent } from "@/lib/auth/audit";
import { publicEnv } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export type ForgotState = { ok?: boolean; error?: string };

export async function requestPasswordReset(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Невалиден имейл адрес." };
  }

  const supabase = await getSupabaseServerClient();
  // Don't reveal whether the email exists. We always show success.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
  });

  const profile = await prisma.profile.findUnique({ where: { email } });
  const hdrs = await headers();
  await recordAuditEvent({
    actorId: profile?.id ?? null,
    action: "auth.password.reset_requested",
    payload: { email, profile_existed: !!profile },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  return { ok: true };
}
