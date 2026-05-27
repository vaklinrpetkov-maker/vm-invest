"use server";

// Inline-edit server action for changing a Task's owner. Open team-wide —
// any signed-in profile can reassign any task to anyone (per specs/tasks.md).
//
// Mirror of contacts/leads owner actions.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SetTaskOwnerResult = { ok: true } | { ok: false; error: string };

export async function setTaskOwner(
  taskId: string,
  ownerId: string | null,
): Promise<SetTaskOwnerResult> {
  const actor = await requireProfile();

  if (!UUID_RE.test(taskId)) {
    return { ok: false, error: "Невалидна задача." };
  }
  if (ownerId !== null && !UUID_RE.test(ownerId)) {
    return { ok: false, error: "Невалиден отговорник." };
  }

  const before = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      ownerId: true,
      owner: { select: { fullName: true } },
    },
  });
  if (!before) return { ok: false, error: "Задачата не съществува." };

  let afterName: string | null = null;
  if (ownerId !== null) {
    const profile = await prisma.profile.findUnique({
      where: { id: ownerId },
      select: { id: true, active: true, fullName: true },
    });
    if (!profile) return { ok: false, error: "Отговорникът не съществува." };
    if (!profile.active) return { ok: false, error: "Отговорникът е деактивиран." };
    afterName = profile.fullName;
  }

  if (before.ownerId === ownerId) return { ok: true };

  await prisma.task.update({
    where: { id: taskId },
    data: { ownerId },
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    action: "tasks.owner_changed",
    targetType: "task",
    targetId: taskId,
    before: {
      ownerId: before.ownerId,
      ownerName: before.owner?.fullName ?? null,
    },
    after: { ownerId, ownerName: afterName },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);

  return { ok: true };
}
