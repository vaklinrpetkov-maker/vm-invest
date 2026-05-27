"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import {
  createActivityTemplate,
  updateActivityTemplate,
  softDeleteActivityTemplate,
  reorderActivityTemplates,
  type CatalogMutationResult,
} from "@/lib/renovations/catalog-actions";

// Thin server-action wrappers over lib/renovations/catalog-actions.ts.
// Admin-only. Pattern mirrors teams/actions.ts.

export type ActivityTemplateActionResult = { ok: true } | { ok: false; error: string };

function strip(res: CatalogMutationResult): ActivityTemplateActionResult {
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function createActivityTemplateAction(
  formData: FormData,
): Promise<ActivityTemplateActionResult> {
  const me = await requireRole("admin");
  const name = String(formData.get("name") ?? "");
  const teamIdRaw = String(formData.get("teamId") ?? "");
  const teamId = teamIdRaw === "" ? null : teamIdRaw;
  const peopleRequired = Number.parseInt(String(formData.get("peopleRequired") ?? "0"), 10);
  const bathroomMultiplied = formData.get("bathroomMultiplied") === "on";
  const durationStudio = Number(formData.get("durationStudio") ?? "0");
  const durationTwoRoom = Number(formData.get("durationTwoRoom") ?? "0");
  const durationThreeRoom = Number(formData.get("durationThreeRoom") ?? "0");
  const durationFourRoom = Number(formData.get("durationFourRoom") ?? "0");

  const res = await createActivityTemplate(
    {
      name,
      teamId,
      peopleRequired,
      bathroomMultiplied,
      durationStudio,
      durationTwoRoom,
      durationThreeRoom,
      durationFourRoom,
    },
    { actorId: me.id },
  );
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/admin/renovations/activities");
  return { ok: true };
}

export async function updateActivityTemplateAction(
  id: string,
  patch: {
    name?: string;
    teamId?: string | null;
    peopleRequired?: number;
    bathroomMultiplied?: boolean;
    durationStudio?: number;
    durationTwoRoom?: number;
    durationThreeRoom?: number;
    durationFourRoom?: number;
  },
): Promise<ActivityTemplateActionResult> {
  const me = await requireRole("admin");
  const res = await updateActivityTemplate(id, patch, { actorId: me.id });
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/admin/renovations/activities");
  return { ok: true };
}

export async function softDeleteActivityTemplateAction(
  id: string,
): Promise<ActivityTemplateActionResult> {
  const me = await requireRole("admin");
  const res = await softDeleteActivityTemplate(id, { actorId: me.id });
  if (res.ok) revalidatePath("/admin/renovations/activities");
  return strip(res);
}

export async function reorderActivityTemplatesAction(
  orderedIds: string[],
): Promise<ActivityTemplateActionResult> {
  const me = await requireRole("admin");
  const res = await reorderActivityTemplates(orderedIds, { actorId: me.id });
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/admin/renovations/activities");
  return { ok: true };
}
