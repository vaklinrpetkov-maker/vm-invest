"use server";

// Server actions for the Tasks module. Two shapes:
//   - Form-driven actions for create + update + delete (used by /tasks/new
//     and /tasks/[id]/edit) — return `void` and `redirect` on success.
//   - Inline-edit actions for status + owner — return discriminated results
//     so the cell can drive its rollback toast.
//
// Permission model (per specs/tasks.md): open team-wide for create / edit /
// status / owner. Admin-only for delete. No role checks beyond requireProfile
// for the open paths.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { TaskStatus } from "@prisma/client";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireProfile, requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { TASK_STATUSES } from "@/lib/tasks/constants";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_STATUSES: ReadonlySet<TaskStatus> = new Set(TASK_STATUSES);

function parseDueDate(raw: string): { ok: true; value: Date | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  // <input type="date"> always serializes as YYYY-MM-DD.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { ok: false, error: "Невалидна дата." };
  }
  const d = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, error: "Невалидна дата." };
  }
  return { ok: true, value: d };
}

export type TaskFormState = {
  errors?: { title?: string; dueDate?: string; form?: string };
};

export async function createTask(
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const me = await requireProfile();

  const title = String(formData.get("title") ?? "").trim();
  if (title.length === 0) {
    return { errors: { title: "Заглавието е задължително." } };
  }
  if (title.length > 200) {
    return { errors: { title: "Заглавието е твърде дълго (макс. 200 символа)." } };
  }
  const description = String(formData.get("description") ?? "").trim() || null;
  const ownerIdRaw = String(formData.get("ownerId") ?? "").trim();
  const ownerId =
    ownerIdRaw === "" ? null : UUID_RE.test(ownerIdRaw) ? ownerIdRaw : null;
  if (ownerIdRaw !== "" && ownerId === null) {
    return { errors: { form: "Невалиден отговорник." } };
  }
  const due = parseDueDate(String(formData.get("dueDate") ?? ""));
  if (!due.ok) {
    return { errors: { dueDate: due.error } };
  }
  const statusRaw = String(formData.get("status") ?? "todo");
  const status: TaskStatus = VALID_STATUSES.has(statusRaw as TaskStatus)
    ? (statusRaw as TaskStatus)
    : "todo";

  const created = await prisma.task.create({
    data: {
      title,
      description,
      status,
      dueDate: due.value,
      ownerId,
      createdById: me.id,
      // If the user creates the task already in `done`, stamp completedAt now.
      completedAt: status === "done" ? new Date() : null,
    },
    select: { id: true },
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: me.id,
    action: "tasks.create",
    targetType: "task",
    targetId: created.id,
    payload: { title, status, ownerId, dueDate: due.value?.toISOString().slice(0, 10) ?? null },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/tasks");
  redirect(`/tasks/${created.id}`);
}

export async function updateTask(
  taskId: string,
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const me = await requireProfile();
  if (!UUID_RE.test(taskId)) {
    return { errors: { form: "Невалидна задача." } };
  }

  const before = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, description: true, dueDate: true, ownerId: true },
  });
  if (!before) return { errors: { form: "Задачата не съществува." } };

  const title = String(formData.get("title") ?? "").trim();
  if (title.length === 0) {
    return { errors: { title: "Заглавието е задължително." } };
  }
  if (title.length > 200) {
    return { errors: { title: "Заглавието е твърде дълго (макс. 200 символа)." } };
  }
  const description = String(formData.get("description") ?? "").trim() || null;
  const due = parseDueDate(String(formData.get("dueDate") ?? ""));
  if (!due.ok) return { errors: { dueDate: due.error } };

  await prisma.task.update({
    where: { id: taskId },
    data: { title, description, dueDate: due.value },
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: me.id,
    action: "tasks.update",
    targetType: "task",
    targetId: taskId,
    before: {
      title: before.title,
      description: before.description,
      dueDate: before.dueDate?.toISOString().slice(0, 10) ?? null,
    },
    after: {
      title,
      description,
      dueDate: due.value?.toISOString().slice(0, 10) ?? null,
    },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
  redirect(`/tasks/${taskId}`);
}

// Wired directly to a <form action={...}> on the detail page so signature is
// Promise<void>. Throws on permission failure (admin-only).
export async function deleteTask(formData: FormData): Promise<void> {
  const actor = await requireRole("admin");
  const taskId = String(formData.get("taskId") ?? "");
  if (!UUID_RE.test(taskId)) throw new Error("Невалидна задача.");

  const before = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true },
  });
  if (!before) throw new Error("Задачата не съществува.");

  await prisma.task.delete({ where: { id: taskId } });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    action: "tasks.deleted",
    targetType: "task",
    targetId: taskId,
    payload: { title: before.title },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/tasks");
  redirect("/tasks");
}
