"use server";

// Inline-edit server action for assigning a Lead's owner. Mirror of the
// contacts version (`app/(app)/contacts/owner-actions.ts`) with the same
// permission model: any signed-in profile can reassign — leads are sales
// prospects and the team works as a single pool.
//
// The audit action `leads.owner.changed` already exists in `lib/auth/audit.ts`
// (added when the leads module first shipped). Wiring it through the
// inline-edit flow just adds a new emission point.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SetLeadOwnerResult = { ok: true } | { ok: false; error: string };

export async function setLeadOwner(
  leadId: string,
  ownerId: string | null,
): Promise<SetLeadOwnerResult> {
  const actor = await requireProfile();

  if (typeof leadId !== "string" || !UUID_RE.test(leadId)) {
    return { ok: false, error: "Невалиден лийд." };
  }
  if (ownerId !== null && (typeof ownerId !== "string" || !UUID_RE.test(ownerId))) {
    return { ok: false, error: "Невалиден отговорник." };
  }

  const before = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      ownerId: true,
      owner: { select: { fullName: true } },
    },
  });
  if (!before) {
    return { ok: false, error: "Лийдът не съществува." };
  }

  let afterName: string | null = null;
  if (ownerId !== null) {
    const profile = await prisma.profile.findUnique({
      where: { id: ownerId },
      select: { id: true, active: true, fullName: true },
    });
    if (!profile) {
      return { ok: false, error: "Отговорникът не съществува." };
    }
    if (!profile.active) {
      return { ok: false, error: "Отговорникът е деактивиран." };
    }
    afterName = profile.fullName;
  }

  // No-op short-circuit: returning ok without writing keeps the audit log
  // free of noise from idempotent saves (e.g. picking the same option).
  if (before.ownerId === ownerId) {
    return { ok: true };
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: { ownerId },
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    action: "leads.owner.changed",
    targetType: "lead",
    targetId: leadId,
    before: {
      ownerId: before.ownerId,
      ownerName: before.owner?.fullName ?? null,
    },
    after: {
      ownerId,
      ownerName: afterName,
    },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);

  return { ok: true };
}
