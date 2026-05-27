"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/auth/audit";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type ResetState = { error?: string };

const PASSWORD_MIN = 12;

export async function setNewPassword(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

  if (password.length < PASSWORD_MIN)
    return { error: `Паролата трябва да е поне ${PASSWORD_MIN} символа.` };
  if (password !== passwordConfirm) return { error: "Паролите не съвпадат." };

  const supabase = await getSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { error: "Сесията за смяна на парола изтече. Поискайте нов линк." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: userData.user.id,
    action: "auth.password.reset_completed",
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  redirect("/");
}
