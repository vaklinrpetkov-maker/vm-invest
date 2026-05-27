import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import type { TaskStatus } from "@prisma/client";
import { ActivityFeed } from "@/components/ui/activity-feed/activity-feed";
import { Button } from "@/components/ui/button";
import { type PersonOption } from "@/components/ui/inline-person-cell";
import { type StatusOption } from "@/components/ui/inline-status-cell";
import { requireProfile } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_STATUS_TONES,
} from "@/lib/tasks/constants";
import { getTaskById } from "@/lib/tasks/queries";
import { deleteTask } from "../actions";
import { TaskInlineCells } from "./task-inline-cells";

export const dynamic = "force-dynamic";

const TASK_STATUS_OPTIONS: ReadonlyArray<StatusOption<TaskStatus>> =
  TASK_STATUSES.map((value) => ({
    value,
    label: TASK_STATUS_LABELS[value],
    tone: TASK_STATUS_TONES[value],
  }));

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireProfile();
  const { id } = await params;
  const task = await getTaskById(id);
  if (!task) notFound();

  const owners = await prisma.profile.findMany({
    where: { active: true },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true },
  });

  const canDelete = me.role === "admin";

  // Overdue calc — compare against today UTC midnight, see /tasks page.tsx.
  const now = new Date();
  const todayUtcMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).getTime();
  const isOverdue =
    task.dueDate !== null &&
    task.status !== "done" &&
    task.dueDate.getTime() < todayUtcMidnight;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Link
            href="/tasks"
            className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors duration-120"
          >
            ← Задачи
          </Link>
          <h1
            className={cn(
              "text-xl text-neutral-900 mt-1",
              task.status === "done" && "line-through text-neutral-500",
            )}
          >
            {task.title}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/tasks/${task.id}/edit` as Route}>
            <Button variant="secondary">Редактирай</Button>
          </Link>
          {canDelete && (
            <form action={deleteTask}>
              <input type="hidden" name="taskId" value={task.id} />
              <Button type="submit" variant="ghost">
                Изтрий
              </Button>
            </form>
          )}
        </div>
      </div>

      <section className="bg-neutral-0 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <TaskInlineCells
            taskId={task.id}
            initialStatus={task.status}
            statusOptions={TASK_STATUS_OPTIONS}
            initialOwner={
              task.owner
                ? { id: task.owner.id, fullName: task.owner.fullName }
                : null
            }
            ownerActive={task.owner?.active ?? null}
            ownerOptions={owners as PersonOption[]}
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-neutral-500">Краен срок</span>
            {task.dueDate ? (
              <span
                className={cn(
                  "text-base tabular-nums",
                  isOverdue ? "text-danger-700 font-medium" : "text-neutral-900",
                )}
              >
                {formatDate(task.dueDate)}
                {isOverdue && (
                  <span className="ml-2 text-sm text-danger-700">просрочен</span>
                )}
              </span>
            ) : (
              <span className="text-neutral-400">—</span>
            )}
          </div>
        </div>
      </section>

      {task.description && (
        <section className="bg-neutral-0 rounded-xl p-5 space-y-2">
          <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
            Описание
          </h2>
          <p className="text-base text-neutral-900 whitespace-pre-wrap leading-relaxed">
            {task.description}
          </p>
        </section>
      )}

      <section className="bg-neutral-0 rounded-xl p-5 space-y-3 text-sm">
        <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
          Метаданни
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-neutral-600">
          <div>
            <span className="text-neutral-500">Създадена: </span>
            <span className="tabular-nums">{formatDateTime(task.createdAt)}</span>
            {task.createdBy && (
              <span className="text-neutral-500"> от {task.createdBy.fullName}</span>
            )}
          </div>
          <div>
            <span className="text-neutral-500">Последна промяна: </span>
            <span className="tabular-nums">{formatDateTime(task.updatedAt)}</span>
          </div>
          {task.completedAt && (
            <div>
              <span className="text-neutral-500">Завършена: </span>
              <span className="tabular-nums">{formatDateTime(task.completedAt)}</span>
            </div>
          )}
        </div>
      </section>

      <ActivityFeed
        targetType="task"
        targetId={task.id}
        viewerId={me.id}
        viewerRole={me.role}
      />
    </div>
  );
}

