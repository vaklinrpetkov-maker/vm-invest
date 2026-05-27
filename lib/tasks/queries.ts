import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// List + detail queries for the Tasks module. Mirrors the convention used by
// /lib/contracts/queries.ts — central include + page-load helper for the
// list, plus a detail helper.

export const taskListInclude = {
  owner: { select: { id: true, fullName: true, active: true } },
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.TaskInclude;

export type TaskListRow = Prisma.TaskGetPayload<{
  include: typeof taskListInclude;
}>;

export async function listTasksForPage(
  where: Prisma.TaskWhereInput,
  pagination: { skip: number; take: number },
): Promise<{ rows: TaskListRow[]; total: number }> {
  const [rows, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: taskListInclude,
      // Sort: open tasks first by due date (asc, nulls last), then by createdAt
      // desc as a tiebreaker. Done tasks sorted by completedAt desc so the
      // most recently finished are at the top of the "Завършени" tab.
      orderBy: [
        { status: "asc" }, // todo < in_progress < done by enum order
        { dueDate: { sort: "asc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.task.count({ where }),
  ]);
  return { rows, total };
}

export const taskDetailInclude = {
  owner: { select: { id: true, fullName: true, active: true } },
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.TaskInclude;

export type TaskDetail = Prisma.TaskGetPayload<{
  include: typeof taskDetailInclude;
}>;

export async function getTaskById(id: string): Promise<TaskDetail | null> {
  return prisma.task.findUnique({
    where: { id },
    include: taskDetailInclude,
  });
}
