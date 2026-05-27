"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { LeadFormState } from "@/app/(app)/leads/lead-form";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireProfile } from "@/lib/auth/session";
import { parseLeadFormData } from "@/lib/leads/parse";
import { prisma } from "@/lib/prisma";

// Edit rules per Leads.md §10:
// - Admin/manager: edit any lead.
// - User: edit only if they are the assigned owner.
function canEdit(role: "admin" | "manager" | "user", ownerId: string | null, meId: string) {
  if (role === "admin" || role === "manager") return true;
  return ownerId === meId;
}

export async function updateLead(
  leadId: string,
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const actor = await requireProfile();

  const existing = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      ownerId: true,
      status: true,
      deletedAt: true,
      contactId: true,
      source: true,
      properties: true,
      message: true,
    },
  });
  if (!existing) return { errors: { form: "Лийдът не съществува." } };
  if (existing.deletedAt) return { errors: { form: "Лийдът е изтрит." } };
  if (!canEdit(actor.role, existing.ownerId, actor.id)) {
    return { errors: { form: "Нямате право да редактирате този лийд." } };
  }
  if (existing.status === "converted") {
    return { errors: { form: "Преобразуваните лийдове са заключени." } };
  }

  const parsed = await parseLeadFormData(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  // Phase 1: contactId is read-only after creation (see Leads.md §15).
  const patch = { ...parsed.data, contactId: existing.contactId };

  await prisma.lead.update({
    where: { id: leadId },
    data: patch,
  });

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for") ?? null;
  const userAgent = hdrs.get("user-agent") ?? null;

  await recordAuditEvent({
    actorId: actor.id,
    action: "leads.update",
    targetType: "lead",
    targetId: leadId,
    before: {
      status: existing.status,
      ownerId: existing.ownerId,
      source: existing.source,
      properties: existing.properties,
      message: existing.message,
    },
    after: {
      status: patch.status,
      ownerId: patch.ownerId,
      source: patch.source,
      properties: patch.properties,
      message: patch.message,
    },
    ip,
    userAgent,
  });

  // Emit targeted events when owner or status changed — makes filtering the
  // audit log per-event-type useful.
  if (existing.ownerId !== patch.ownerId) {
    await recordAuditEvent({
      actorId: actor.id,
      action: "leads.owner.changed",
      targetType: "lead",
      targetId: leadId,
      payload: { from: existing.ownerId, to: patch.ownerId },
      ip,
      userAgent,
    });
  }
  if (existing.status !== patch.status) {
    await recordAuditEvent({
      actorId: actor.id,
      action: "leads.status.changed",
      targetType: "lead",
      targetId: leadId,
      payload: { from: existing.status, to: patch.status },
      ip,
      userAgent,
    });
  }

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  redirect(`/leads/${leadId}`);
}

// Soft delete. Per Leads.md §10: all roles can delete any lead. Audit trail +
// soft delete provides the safety net. Optional reason captured in payload.
export async function deleteLead(formData: FormData): Promise<void> {
  const actor = await requireProfile();
  const leadId = String(formData.get("leadId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!leadId) throw new Error("Невалидна заявка.");

  const existing = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, deletedAt: true },
  });
  if (!existing) throw new Error("Лийдът не съществува.");
  if (existing.deletedAt) {
    // Idempotent — already deleted, just bounce home.
    redirect("/leads");
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      deletedAt: new Date(),
      deletedById: actor.id,
      deleteReason: reason,
    },
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    action: "leads.delete",
    targetType: "lead",
    targetId: leadId,
    payload: { reason },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/leads");
  redirect("/leads");
}
