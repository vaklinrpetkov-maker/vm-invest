"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import {
  createBuilding as create,
  updateBuilding as update,
  deleteBuilding as remove,
} from "@/lib/buildings/actions";

// Thin wrappers over lib/buildings/actions.ts. Admin-only; wrappers carry
// the role-check + path revalidation so the page stays declarative.

export type BuildingActionResult = { ok: true } | { ok: false; error: string };

export async function createBuildingAction(formData: FormData): Promise<BuildingActionResult> {
  const me = await requireRole("admin");
  const storageName = String(formData.get("storageName") ?? "");
  const displayName = String(formData.get("displayName") ?? "");
  const complexRaw = String(formData.get("complex") ?? "");
  const complex = complexRaw.trim() === "" ? null : complexRaw.trim();

  const res = await create(
    { storageName, displayName, complex },
    { actorId: me.id },
  );

  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/admin/buildings");
  revalidatePath("/properties");
  return { ok: true };
}

export async function updateBuildingAction(
  id: string,
  patch: { displayName?: string; complex?: string | null; active?: boolean },
): Promise<BuildingActionResult> {
  const me = await requireRole("admin");
  const res = await update(id, patch, { actorId: me.id });
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/admin/buildings");
  revalidatePath("/properties");
  return { ok: true };
}

export async function deleteBuildingAction(id: string): Promise<BuildingActionResult> {
  const me = await requireRole("admin");
  const res = await remove(id, { actorId: me.id });
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/admin/buildings");
  revalidatePath("/properties");
  return { ok: true };
}
