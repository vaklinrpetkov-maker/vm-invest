import type { TaskStatus } from "@prisma/client";
import type { BadgeTone } from "@/components/ui/status-badge";

// Bulgarian labels + tones for the Task module. Keep in sync with the
// `TaskStatus` enum in prisma/schema.prisma.

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Нов",
  in_progress: "В процес",
  done: "Завършен",
};

export const TASK_STATUS_TONES: Record<TaskStatus, BadgeTone> = {
  todo: "info",
  in_progress: "accent",
  done: "success",
};

// Order matters for the inline-status picker — top-to-bottom is the natural
// pipeline (new → in progress → done).
export const TASK_STATUSES: ReadonlyArray<TaskStatus> = [
  "todo",
  "in_progress",
  "done",
] as const;

// `done` is hidden from the "open tasks" tabs and shown in the "Завършени"
// tab. The other two are "open" — the default working set.
export const TASK_OPEN_STATUSES: ReadonlyArray<TaskStatus> = [
  "todo",
  "in_progress",
] as const;

export const TASKS_PAGE_SIZE = 50;
