"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/auth/audit";
import { getCurrentProfile } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function signOut(): Promise<void> {
  const profile = await getCurrentProfile();
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();

  if (profile) {
    const hdrs = await headers();
    await recordAuditEvent({
      actorId: profile.id,
      action: "auth.logout",
      ip: hdrs.get("x-forwarded-for") ?? null,
      userAgent: hdrs.get("user-agent") ?? null,
    });
  }

  redirect("/login");
}
