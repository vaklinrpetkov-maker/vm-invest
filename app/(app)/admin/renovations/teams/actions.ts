"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import {
  createTeam,
  updateTeam,
  softDeleteTeam,
  type CatalogMutationResult,
} from "@/lib/renovations/catalog-actions";

// Thin server-action wrappers over lib/renovations/catalog-actions.ts.
// Admin-only; wrappers carry the role-check + path revalidation so the page
// stays declarative. Pattern mirrors app/(app)/admin/buildings/actions.ts.

export type TeamActionResult = { ok: true } | { ok: false; error: string };

function strip(res: CatalogMutationResult): TeamActionResult {
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function createTeamAction(formData: FormData): Promise<TeamActionResult> {
  const me = await requireRole("admin");
  const name = String(formData.get("name") ?? "");
  const specialtyRaw = String(formData.get("specialty") ?? "");
  const specialty = specialtyRaw.trim() === "" ? null : specialtyRaw.trim();
  const totalPeopleRaw = String(formData.get("totalPeople") ?? "0");
  const totalPeople = Number.parseInt(totalPeopleRaw, 10);
  if (!Number.isFinite(totalPeople)) {
    return { ok: false, error: "Невалиден брой хора." };
  }

  const res = await createTeam(
    { name, specialty, totalPeople },
    { actorId: me.id },
  );
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/admin/renovations/teams");
  revalidatePath("/admin/renovations/activities");
  return { ok: true };
}

export async function updateTeamAction(
  id: string,
  patch: { name?: string; specialty?: string | null; totalPeople?: number },
): Promise<TeamActionResult> {
  const me = await requireRole("admin");
  const res = await updateTeam(id, patch, { actorId: me.id });
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/admin/renovations/teams");
  revalidatePath("/admin/renovations/activities");
  // Renovation pages read team.totalPeople live for capacity checks — bust
  // their cache too. Cheap because revalidatePath is path-key based.
  revalidatePath("/renovations");
  return { ok: true };
}

export async function softDeleteTeamAction(id: string): Promise<TeamActionResult> {
  const me = await requireRole("admin");
  const res = await softDeleteTeam(id, { actorId: me.id });
  return strip(res);
}
