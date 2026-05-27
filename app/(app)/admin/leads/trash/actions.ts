"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

// Restore a soft-deleted lead. Admin-only per Leads.md §10. Strips the delete
// metadata so the lead is indistinguishable from a never-deleted one going
// forward (its original createdAt is preserved).
export async function restoreLead(formData: FormData): Promise<void> {
  const actor = await requireRole("admin");
  const leadId = String(formData.get("leadId") ?? "");
  if (!leadId) throw new Error("Невалидна заявка.");

  const existing = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, deletedAt: true },
  });
  if (!existing) throw new Error("Лийдът не съществува.");
  if (!existing.deletedAt) {
    // Already live — just bounce to its profile.
    redirect(`/leads/${leadId}`);
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: { deletedAt: null, deletedById: null, deleteReason: null },
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    action: "leads.restore",
    targetType: "lead",
    targetId: leadId,
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/admin/leads/trash");
  revalidatePath("/leads");
  redirect(`/leads/${leadId}`);
}
