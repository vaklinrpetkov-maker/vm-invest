"use server";

// Inline-edit server action for changing a Lead's status. Mirror of the
// owner-actions pattern: returns a discriminated result the cell uses to
// drive its rollback toast on failure.
//
// Permission model (per specs/leads.md / roles.md §3): all signed-in roles
// can edit leads, including status. The `converted` value is system-only
// (set by the Contracts conversion flow); the action rejects it explicitly
// here so a tampered client can't shortcut the conversion path.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { LeadStatus } from "@prisma/client";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const USER_SELECTABLE: ReadonlySet<LeadStatus> = new Set([
  "new",
  "in_progress",
  "no_progress",
]);

export type SetLeadStatusResult =
  | { ok: true }
  | { ok: false; error: string };

export async function setLeadStatus(
  leadId: string,
  newStatus: LeadStatus,
): Promise<SetLeadStatusResult> {
  const actor = await requireProfile();

  if (!UUID_RE.test(leadId)) {
    return { ok: false, error: "Невалиден лийд." };
  }
  if (!USER_SELECTABLE.has(newStatus)) {
    return {
      ok: false,
      error: "Този статус се задава автоматично от системата.",
    };
  }

  const before = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { status: true },
  });
  if (!before) {
    return { ok: false, error: "Лийдът не съществува." };
  }
  if (before.status === newStatus) {
    return { ok: true };
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: { status: newStatus },
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    action: "leads.status.changed",
    targetType: "lead",
    targetId: leadId,
    before: { status: before.status },
    after: { status: newStatus },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);

  return { ok: true };
}
