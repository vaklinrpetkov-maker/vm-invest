"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export type TimerStopResult = { ok: true } | { ok: false; error: string };

const MIN_COMMENT_LENGTH = 15;

// Stop a lead's response timer. Anyone can stop; stopping also claims the
// lead (assigns ownerId to the actor if null) and bumps `new` → `in_progress`.
// Requires a comment of ≥15 characters per spec §8.3.
export async function stopLeadTimer(formData: FormData): Promise<TimerStopResult> {
  const actor = await requireProfile();
  const leadId = String(formData.get("leadId") ?? "");
  const comment = String(formData.get("comment") ?? "").trim();

  if (!leadId) return { ok: false, error: "Невалидна заявка." };
  if (comment.length < MIN_COMMENT_LENGTH) {
    return {
      ok: false,
      error: `Коментарът трябва да е поне ${MIN_COMMENT_LENGTH} символа.`,
    };
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      deletedAt: true,
      source: true,
      ownerId: true,
      status: true,
      timerStartedAt: true,
      timerStoppedAt: true,
    },
  });
  if (!lead) return { ok: false, error: "Лийдът не съществува." };
  if (lead.deletedAt) return { ok: false, error: "Лийдът е изтрит." };
  if (!lead.timerStartedAt) {
    return { ok: false, error: "За този лийд няма активен таймер." };
  }
  if (lead.timerStoppedAt) {
    return { ok: false, error: "Таймерът вече е спрян." };
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      timerStoppedAt: new Date(),
      timerStoppedById: actor.id,
      timerStopComment: comment,
      // Claim the lead if unassigned.
      ownerId: lead.ownerId ?? actor.id,
      // Bump status forward if still `new`.
      status: lead.status === "new" ? "in_progress" : lead.status,
    },
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    action: "leads.timer.stopped",
    targetType: "lead",
    targetId: leadId,
    payload: {
      comment,
      claimed: lead.ownerId === null,
      elapsedMs: Date.now() - lead.timerStartedAt.getTime(),
    },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads/inbox");
  revalidatePath("/leads");
  return { ok: true };
}
