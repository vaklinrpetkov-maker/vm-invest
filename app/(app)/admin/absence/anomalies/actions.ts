"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export type ResolveResult = { ok: true } | { ok: false; error: string };

export async function resolveAnomaly(formData: FormData): Promise<ResolveResult> {
  const actor = await requireRole("admin");
  const flagId = String(formData.get("flagId") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!flagId) return { ok: false, error: "Невалидна заявка." };

  const flag = await prisma.anomalyFlag.findUnique({ where: { id: flagId } });
  if (!flag) return { ok: false, error: "Аномалията не съществува." };
  if (flag.resolvedAt) return { ok: true };

  await prisma.anomalyFlag.update({
    where: { id: flagId },
    data: { resolvedAt: new Date(), resolvedById: actor.id, resolveNote: note },
  });

  revalidatePath("/admin/absence/anomalies");
  revalidatePath("/admin/absence");
  return { ok: true };
}
