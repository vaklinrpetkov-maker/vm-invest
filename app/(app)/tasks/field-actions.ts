"use server";

// Inline-edit server actions for the Tasks table — `setTaskTitle` and
// `setTaskDueDate`. Each returns a discriminated result so the inline cell
// can surface rejection in its rollback toast.
//
// Kept separate from `app/(app)/tasks/actions.ts` (the form-driven create /
// update / delete actions) so the two patterns don't visually mix. Same
// reason the contacts module split inline-edit into `field-actions.ts`
// alongside the form `actions.ts`.
//
// Permissions: open team-wide per specs/tasks.md §3 — any signed-in profile
// can edit any field. `requireProfile()` only.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type SetFieldResult = { ok: true } | { ok: false; error: string };

async function logFieldChange(
  actorId: string,
  taskId: string,
  field: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  const hdrs = await headers();
  await recordAuditEvent({
    actorId,
    action: "tasks.field.updated",
    targetType: "task",
    targetId: taskId,
    payload: { field },
    before: { [field]: before as never } as never,
    after: { [field]: after as never } as never,
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });
}

export async function setTaskTitle(
  taskId: string,
  newValue: string | null,
): Promise<SetFieldResult> {
  const me = await requireProfile();
  if (!UUID_RE.test(taskId)) {
    return { ok: false, error: "Невалидна задача." };
  }

  const trimmed = (newValue ?? "").trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Заглавието е задължително." };
  }
  if (trimmed.length > 200) {
    return { ok: false, error: "Заглавието е твърде дълго (макс. 200 символа)." };
  }

  const before = await prisma.task.findUnique({
    where: { id: taskId },
    select: { title: true },
  });
  if (!before) return { ok: false, error: "Задачата не съществува." };
  if (before.title === trimmed) return { ok: true };

  await prisma.task.update({
    where: { id: taskId },
    data: { title: trimmed },
  });

  await logFieldChange(me.id, taskId, "title", before.title, trimmed);

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

export async function setTaskDueDate(
  taskId: string,
  newIso: string | null,
): Promise<SetFieldResult> {
  const me = await requireProfile();
  if (!UUID_RE.test(taskId)) {
    return { ok: false, error: "Невалидна задача." };
  }

  let next: Date | null = null;
  if (newIso !== null && newIso.length > 0) {
    if (!ISO_DATE_RE.test(newIso)) {
      return { ok: false, error: "Невалидна дата." };
    }
    next = new Date(`${newIso}T00:00:00Z`);
    if (Number.isNaN(next.getTime())) {
      return { ok: false, error: "Невалидна дата." };
    }
  }

  const before = await prisma.task.findUnique({
    where: { id: taskId },
    select: { dueDate: true },
  });
  if (!before) return { ok: false, error: "Задачата не съществува." };

  const beforeIso = before.dueDate
    ? before.dueDate.toISOString().slice(0, 10)
    : null;
  const nextIso = next ? next.toISOString().slice(0, 10) : null;
  if (beforeIso === nextIso) return { ok: true };

  await prisma.task.update({
    where: { id: taskId },
    data: { dueDate: next },
  });

  await logFieldChange(me.id, taskId, "dueDate", beforeIso, nextIso);

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}
