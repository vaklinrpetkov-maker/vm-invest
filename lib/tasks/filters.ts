import type { Prisma, TaskStatus } from "@prisma/client";
import {
  firstParam,
  parsePageParam,
  repeatedOrCsvParam,
} from "@/lib/url-params";
import { TASK_OPEN_STATUSES, TASKS_PAGE_SIZE } from "./constants";

// URL-driven filters for the /tasks list page. Three tabs:
//   - mine — owner = current profile, status in (todo, in_progress)
//   - all  — any owner, status in (todo, in_progress)
//   - done — any owner, status = done
//
// Plus orthogonal filters: assignee multi-select, status multi-select. The
// tab + filters compose; `mine` overrides assignee, `done` overrides status.
//
// Pagination: TASKS_PAGE_SIZE per page. Tab state is in the URL so links/
// reloads preserve it.
//
// Multi-value params: the serializer emits repeated-param style
// (`?assignee=a&assignee=b`); the parser uses `repeatedOrCsvParam` so a
// hand-edited `?assignee=a,b` URL also works.

export type TaskTab = "mine" | "all" | "done";

export type TaskSearchParams = {
  tab?: string;
  assignee?: string | string[];
  status?: string | string[];
  page?: string;
};

export type ParsedTaskFilters = {
  tab: TaskTab;
  assigneeIds: string[];
  statuses: TaskStatus[];
  page: number;
};

const VALID_TABS: ReadonlySet<string> = new Set(["mine", "all", "done"]);
const VALID_STATUSES: ReadonlySet<string> = new Set([
  "todo",
  "in_progress",
  "done",
]);

export function parseTaskFilters(p: TaskSearchParams): ParsedTaskFilters {
  const tabRaw = firstParam(p.tab) ?? "mine";
  const tab: TaskTab = (VALID_TABS.has(tabRaw) ? tabRaw : "mine") as TaskTab;
  const assigneeIds = repeatedOrCsvParam(p.assignee);
  const statuses = repeatedOrCsvParam(p.status)
    .filter((s) => VALID_STATUSES.has(s))
    .map((s) => s as TaskStatus);
  return { tab, assigneeIds, statuses, page: parsePageParam(p.page) };
}

export function serializeTaskFilters(f: ParsedTaskFilters): URLSearchParams {
  const qs = new URLSearchParams();
  if (f.tab !== "mine") qs.set("tab", f.tab);
  for (const id of f.assigneeIds) qs.append("assignee", id);
  for (const s of f.statuses) qs.append("status", s);
  if (f.page > 1) qs.set("page", String(f.page));
  return qs;
}

// Build the Prisma `where` clause given filters + the current user's id (for
// the `mine` tab). The tab predicate is applied first; orthogonal filters
// narrow the result. `done` tab pins status; `mine`/`all` apply the
// open-statuses default unless the user picked specific statuses.
export function buildTaskWhere(
  f: ParsedTaskFilters,
  meId: string,
): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = {};

  if (f.tab === "mine") {
    where.ownerId = meId;
  }

  // Status: tab default vs explicit picks.
  if (f.tab === "done") {
    where.status = "done";
  } else if (f.statuses.length > 0) {
    where.status = { in: f.statuses };
  } else {
    where.status = { in: [...TASK_OPEN_STATUSES] };
  }

  // Assignee filter — only meaningful on "all"/"done" since "mine" already
  // pins owner = me.
  if (f.tab !== "mine" && f.assigneeIds.length > 0) {
    where.ownerId = { in: f.assigneeIds };
  }

  return where;
}

export { TASKS_PAGE_SIZE };
