"use server";

// Inline-edit server action for changing a Task's status. Open team-wide —
// any signed-in profile can move tasks through the pipeline (per
// specs/tasks.md). Setting → done auto-stamps completedAt; moving back from
// done clears it so the "Завършени" tab stays accurate.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { TaskStatus } from "@prisma/client";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { TASK_STATUSES } from "@/lib/tasks/constants";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_STATUSES: ReadonlySet<TaskStatus> = new Set(TASK_STATUSES);

export type SetTaskStatusResult = { ok: true } | { ok: false; error: string };

export async function setTaskStatus(
  taskId: string,
  newStatus: TaskStatus,
): Promise<SetTaskStatusResult> {
  const actor = await requireProfile();

  if (!UUID_RE.test(taskId)) {
    return { ok: false, error: "Невалидна задача." };
  }
  if (!VALID_STATUSES.has(newStatus)) {
    return { ok: false, error: "Невалиден статус." };
  }

  const before = await prisma.task.findUnique({
    where: { id: taskId },
    select: { status: true, completedAt: true },
  });
  if (!before) return { ok: false, error: "Задачата не съществува." };
  if (before.status === newStatus) return { ok: true };

  // completedAt invariant: stamped iff status === "done". Moving in stamps
  // now; moving out clears it. Avoids a "done task with no completion date"
  // or "open task with a stale completion date".
  const data: { status: TaskStatus; completedAt?: Date | null } = { status: newStatus };
  if (newStatus === "done" && before.status !== "done") {
    data.completedAt = new Date();
  } else if (newStatus !== "done" && before.status === "done") {
    data.completedAt = null;
  }

  await prisma.task.update({
    where: { id: taskId },
    data,
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    action: "tasks.status_changed",
    targetType: "task",
    targetId: taskId,
    before: { status: before.status },
    after: { status: newStatus },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);

  return { ok: true };
}
