import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@prisma/client";

// Server-side session helpers. Cached per request via React's cache().

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;

  const profile = await prisma.profile.findUnique({ where: { id: data.user.id } });
  if (!profile || !profile.active) return null;

  return profile;
});

export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}

export async function requireRole(...allowed: Role[]): Promise<Profile> {
  const profile = await requireProfile();
  if (!allowed.includes(profile.role)) redirect("/no-access");
  return profile;
}
