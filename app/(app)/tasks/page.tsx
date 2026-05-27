import Link from "next/link";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { PageHelp } from "@/components/ui/page-help";
import { requireProfile } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { prisma } from "@/lib/prisma";
import {
  TASKS_PAGE_SIZE,
  buildTaskWhere,
  parseTaskFilters,
  serializeTaskFilters,
  type ParsedTaskFilters,
  type TaskSearchParams,
  type TaskTab,
} from "@/lib/tasks/filters";
import { listTasksForPage } from "@/lib/tasks/queries";
import { TaskFilters } from "./filters";
import { TasksTable, type TaskRow } from "./tasks-table";

export const dynamic = "force-dynamic";

const TAB_LABELS: Record<TaskTab, string> = {
  mine: "Мои",
  all: "Всички",
  done: "Завършени",
};

function pageHref(filters: ParsedTaskFilters, page: number): Route {
  const f = { ...filters, page };
  const qs = serializeTaskFilters(f).toString();
  return (qs ? `/tasks?${qs}` : "/tasks") as Route;
}

function tabHref(tab: TaskTab): Route {
  // Switching tabs resets pagination + per-status filters; assignee filter
  // is also reset because it doesn't apply on the "mine" tab.
  const qs = serializeTaskFilters({ tab, assigneeIds: [], statuses: [], page: 1 }).toString();
  return (qs ? `/tasks?${qs}` : "/tasks") as Route;
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<TaskSearchParams>;
}) {
  const me = await requireProfile();
  const params = await searchParams;
  const filters = parseTaskFilters(params);
  const where = buildTaskWhere(filters, me.id);

  const [pageData, profiles, tabCounts] = await Promise.all([
    listTasksForPage(where, {
      skip: (filters.page - 1) * TASKS_PAGE_SIZE,
      take: TASKS_PAGE_SIZE,
    }),
    prisma.profile.findMany({
      where: { active: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
    // Counts shown next to each tab so the user sees their own pile vs.
    // team pile at a glance. Three small queries — at our scale (max a
    // few hundred open tasks) this is cheap.
    Promise.all([
      prisma.task.count({
        where: { ownerId: me.id, status: { in: ["todo", "in_progress"] } },
      }),
      prisma.task.count({
        where: { status: { in: ["todo", "in_progress"] } },
      }),
      prisma.task.count({ where: { status: "done" } }),
    ]),
  ]);

  const [mineCount, allCount, doneCount] = tabCounts;
  const tabBadges: Record<TaskTab, number> = {
    mine: mineCount,
    all: allCount,
    done: doneCount,
  };

  const totalPages = Math.max(1, Math.ceil(pageData.total / TASKS_PAGE_SIZE));
  const rangeStart = pageData.total === 0 ? 0 : (filters.page - 1) * TASKS_PAGE_SIZE + 1;
  const rangeEnd = Math.min(filters.page * TASKS_PAGE_SIZE, pageData.total);

  // Today's date for overdue calculation. Compared against task.dueDate
  // (DATE column → midnight UTC). A task is overdue when dueDate is strictly
  // before "today UTC" and status !== done.
  const todayUtcMidnight = new Date(
    Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate(),
    ),
  ).getTime();

  const rows: TaskRow[] = pageData.rows.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    ownerId: t.owner?.id ?? null,
    ownerName: t.owner?.fullName ?? null,
    ownerActive: t.owner?.active ?? null,
    dueDateIso: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
    dueDateFormatted: t.dueDate ? formatDate(t.dueDate) : null,
    isOverdue:
      t.dueDate !== null &&
      t.status !== "done" &&
      t.dueDate.getTime() < todayUtcMidnight,
    createdAtFormatted: formatDate(t.createdAt),
    completedAtFormatted: t.completedAt ? formatDate(t.completedAt) : null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl text-neutral-900">Задачи</h1>
            <PageHelp
              content={
                <p>
                  Лични и екипни задачи. Табът Мои показва само твоите
                  отворени; Всички — на цялата компания; Завършени — приключените.
                  Заглавието, статусът, отговорникът и крайният срок са
                  редактируеми директно в таблицата. Просрочените задачи
                  получават червен индикатор; броячът до Задачи в навигацията
                  показва колко имаш за днес или просрочени.
                </p>
              }
            />
          </div>
          <p className="text-base text-neutral-600">
            {pageData.total === 0
              ? "Няма намерени задачи."
              : `Показани ${rangeStart}–${rangeEnd} от ${pageData.total}.`}
          </p>
        </div>
        <Link href="/tasks/new">
          <Button>+ Нова задача</Button>
        </Link>
      </div>

      {/* Tabs */}
      <nav className="flex items-center gap-1 border-b border-neutral-150">
        {(["mine", "all", "done"] as const).map((t) => {
          const isActive = filters.tab === t;
          return (
            <Link
              key={t}
              href={tabHref(t)}
              className={cn(
                "inline-flex items-center gap-2 px-3 h-9 text-base transition-colors duration-120 -mb-px border-b-2",
                isActive
                  ? "border-accent-500 text-neutral-900"
                  : "border-transparent text-neutral-600 hover:text-neutral-900",
              )}
            >
              <span>{TAB_LABELS[t]}</span>
              {tabBadges[t] > 0 && (
                <span
                  className={cn(
                    "inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-xs font-medium tabular-nums",
                    isActive
                      ? "bg-accent-500 text-neutral-0"
                      : "bg-neutral-100 text-neutral-600",
                  )}
                >
                  {tabBadges[t]}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <TaskFilters owners={profiles} />

      <TasksTable
        rows={rows}
        ownerOptions={profiles}
        canDelete={me.role === "admin"}
      />

      {totalPages > 1 && (
        <nav className="flex items-center justify-between gap-2 pt-1">
          <div className="text-sm text-neutral-500">
            Страница {filters.page} от {totalPages}
          </div>
          <div className="flex items-center gap-2">
            {filters.page > 1 ? (
              <Link href={pageHref(filters, filters.page - 1)}>
                <Button variant="secondary" size="sm">
                  ← Предишна
                </Button>
              </Link>
            ) : (
              <Button variant="secondary" size="sm" disabled>
                ← Предишна
              </Button>
            )}
            {filters.page < totalPages ? (
              <Link href={pageHref(filters, filters.page + 1)}>
                <Button variant="secondary" size="sm">
                  Следваща →
                </Button>
              </Link>
            ) : (
              <Button variant="secondary" size="sm" disabled>
                Следваща →
              </Button>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
