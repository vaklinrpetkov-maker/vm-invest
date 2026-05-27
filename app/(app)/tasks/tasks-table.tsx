"use client";

import Link from "next/link";
import type { Route } from "next";
import type { TaskStatus } from "@prisma/client";
import {
  ColumnPicker,
  useColumnVisibility,
  type ColumnDef,
} from "@/components/ui/column-picker";
import { DeleteRowButton } from "@/components/ui/delete-row-button";
import {
  InlinePersonCell,
  type PersonOption,
} from "@/components/ui/inline-person-cell";
import {
  InlineDateCell,
} from "@/components/ui/inline-date-cell";
import {
  InlineStatusCell,
  type StatusOption,
} from "@/components/ui/inline-status-cell";
import { InlineTextCell } from "@/components/ui/inline-text-cell";
import { ReadOnlyBadge } from "@/components/ui/read-only-badge";
import {
  Table,
  TBody,
  THead,
  TH,
  TR,
  TD,
  TableEmpty,
} from "@/components/ui/table";
import { cn } from "@/lib/cn";
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_STATUS_TONES,
} from "@/lib/tasks/constants";
import { deleteTask } from "./actions";
import { setTaskDueDate, setTaskTitle } from "./field-actions";
import { setTaskOwner } from "./owner-actions";
import { setTaskStatus } from "./status-actions";

export type TaskRow = {
  id: string;
  title: string;
  status: TaskStatus;
  ownerId: string | null;
  ownerName: string | null;
  ownerActive: boolean | null;
  dueDateIso: string | null; // YYYY-MM-DD; null when unset
  dueDateFormatted: string | null;
  isOverdue: boolean;
  createdAtFormatted: string;
  completedAtFormatted: string | null;
};

type ColumnKey =
  | "title"
  | "status"
  | "owner"
  | "dueDate"
  | "createdAt"
  | "completedAt";

const COLUMNS: ReadonlyArray<ColumnDef<ColumnKey>> = [
  { key: "title", label: "Заглавие", defaultVisible: true },
  { key: "status", label: "Статус", defaultVisible: true },
  { key: "owner", label: "Отговорник", defaultVisible: true },
  { key: "dueDate", label: "Краен срок", defaultVisible: true },
  { key: "createdAt", label: "Създадена", defaultVisible: false },
  { key: "completedAt", label: "Завършена", defaultVisible: false },
];

const STORAGE_KEY = "tasks:visible-columns";

const TASK_STATUS_OPTIONS: ReadonlyArray<StatusOption<TaskStatus>> =
  TASK_STATUSES.map((value) => ({
    value,
    label: TASK_STATUS_LABELS[value],
    tone: TASK_STATUS_TONES[value],
  }));

export function TasksTable({
  rows,
  ownerOptions,
  canDelete,
}: {
  rows: TaskRow[];
  ownerOptions: PersonOption[];
  canDelete: boolean;
}) {
  const { state: visible, toggle } = useColumnVisibility(STORAGE_KEY, COLUMNS);
  const visibleCount = Object.values(visible).filter(Boolean).length + (canDelete ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <ColumnPicker columns={COLUMNS} visible={visible} onToggle={toggle} />
      </div>

      <Table>
        <THead>
          <TR hover={false}>
            {visible.title && <TH>Заглавие</TH>}
            {visible.status && <TH>Статус</TH>}
            {visible.owner && <TH>Отговорник</TH>}
            {visible.dueDate && <TH>Краен срок</TH>}
            {visible.createdAt && <TH>Създадена</TH>}
            {visible.completedAt && <TH>Завършена</TH>}
            {canDelete && <TH align="right" className="w-10" />}
          </TR>
        </THead>
        <TBody>
          {rows.length === 0 && (
            <TableEmpty colSpan={visibleCount}>
              Няма намерени задачи.
            </TableEmpty>
          )}
          {rows.map((t) => (
            <TR key={t.id}>
              {visible.title && (
                <TD
                  className={cn(
                    // Overdue tasks get a left border + danger tint to draw
                    // the eye without making the row unreadable.
                    t.isOverdue && "border-l-2 border-danger-500 pl-2",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/tasks/${t.id}` as Route}
                      title="Отвори детайли"
                      className="text-neutral-400 hover:text-neutral-700 text-sm shrink-0"
                    >
                      ↗
                    </Link>
                    <InlineTextCell
                      value={t.title}
                      onSave={(v) => setTaskTitle(t.id, v)}
                      maxLength={200}
                      className="flex-1 min-w-0"
                    />
                  </div>
                </TD>
              )}
              {visible.status && (
                <TD>
                  <InlineStatusCell
                    value={t.status}
                    options={TASK_STATUS_OPTIONS}
                    onSave={(next) => setTaskStatus(t.id, next)}
                  />
                </TD>
              )}
              {visible.owner && (
                <TD>
                  <InlinePersonCell
                    value={
                      t.ownerId && t.ownerName
                        ? { id: t.ownerId, fullName: t.ownerName }
                        : null
                    }
                    valueActive={t.ownerActive ?? true}
                    options={ownerOptions}
                    onSave={(newId) => setTaskOwner(t.id, newId)}
                    emptyLabel="— Без отговорник"
                  />
                </TD>
              )}
              {visible.dueDate && (
                <TD
                  className={cn(
                    "text-sm",
                    t.isOverdue && "text-danger-700 font-medium",
                  )}
                >
                  <InlineDateCell
                    value={t.dueDateIso}
                    onSave={(iso) => setTaskDueDate(t.id, iso)}
                  />
                </TD>
              )}
              {visible.createdAt && (
                <TD muted className="text-sm tabular-nums">
                  {t.createdAtFormatted}
                  <ReadOnlyBadge reason="Системно поле, попълва се автоматично." />
                </TD>
              )}
              {visible.completedAt && (
                <TD muted className="text-sm tabular-nums">
                  {t.completedAtFormatted ?? (
                    <span className="text-neutral-400">—</span>
                  )}
                  <ReadOnlyBadge reason="Попълва се автоматично при преминаване в „Завършен“." />
                </TD>
              )}
              {canDelete && (
                <TD align="right">
                  <DeleteRowButton
                    label={`задача „${t.title}"`}
                    onDelete={() => {
                      const fd = new FormData();
                      fd.set("taskId", t.id);
                      return deleteTask(fd);
                    }}
                  />
                </TD>
              )}
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
