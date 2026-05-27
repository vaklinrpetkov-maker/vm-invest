"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { LeadFormState } from "@/app/(app)/leads/lead-form";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireProfile } from "@/lib/auth/session";
import { parseLeadFormData } from "@/lib/leads/parse";
import { prisma } from "@/lib/prisma";

export async function createLead(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const actor = await requireProfile();
  const parsed = await parseLeadFormData(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const lead = await prisma.lead.create({
    data: { ...parsed.data, createdById: actor.id },
    select: { id: true },
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    action: "leads.create",
    targetType: "lead",
    targetId: lead.id,
    payload: {
      contactId: parsed.data.contactId,
      source: parsed.data.source,
      status: parsed.data.status,
      ownerId: parsed.data.ownerId,
    },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  redirect(`/leads/${lead.id}`);
}
