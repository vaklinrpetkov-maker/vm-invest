"use server";

// Inline-edit server action for changing a Lead's source. Open team-wide
// (any signed-in profile can change), matching how lead status + owner work.
//
// Only `manual` and `phone` are user-selectable per `LEAD_SOURCE_USER_SELECTABLE`
// in `lib/leads/constants.ts`. `email_form` and `email_unparsed` are set by
// the Resend inbound webhook parser and rejected here explicitly so a
// tampered client can't fake an email-sourced lead.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { LeadSource } from "@prisma/client";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireProfile } from "@/lib/auth/session";
import { LEAD_SOURCE_USER_SELECTABLE } from "@/lib/leads/constants";
import { prisma } from "@/lib/prisma";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const USER_SELECTABLE: ReadonlySet<LeadSource> = new Set(
  LEAD_SOURCE_USER_SELECTABLE,
);

export type SetLeadSourceResult =
  | { ok: true }
  | { ok: false; error: string };

export async function setLeadSource(
  leadId: string,
  newSource: LeadSource,
): Promise<SetLeadSourceResult> {
  const actor = await requireProfile();

  if (!UUID_RE.test(leadId)) {
    return { ok: false, error: "Невалиден лийд." };
  }
  if (!USER_SELECTABLE.has(newSource)) {
    return {
      ok: false,
      error: "Този източник се задава автоматично от системата.",
    };
  }

  const before = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { source: true },
  });
  if (!before) return { ok: false, error: "Лийдът не съществува." };
  if (before.source === newSource) return { ok: true };

  await prisma.lead.update({
    where: { id: leadId },
    data: { source: newSource },
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    action: "leads.source.changed",
    targetType: "lead",
    targetId: leadId,
    before: { source: before.source },
    after: { source: newSource },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);

  return { ok: true };
}
