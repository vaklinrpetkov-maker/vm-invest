"use client";

// Status + owner inline cells for the task detail page. Same primitives the
// list table uses; thin client component so the detail page itself stays
// fully server-rendered.

import type { TaskStatus } from "@prisma/client";
import {
  InlinePersonCell,
  type PersonOption,
} from "@/components/ui/inline-person-cell";
import {
  InlineStatusCell,
  type StatusOption,
} from "@/components/ui/inline-status-cell";
import { setTaskOwner } from "../owner-actions";
import { setTaskStatus } from "../status-actions";

type Props = {
  taskId: string;
  initialStatus: TaskStatus;
  statusOptions: ReadonlyArray<StatusOption<TaskStatus>>;
  initialOwner: { id: string; fullName: string } | null;
  ownerActive: boolean | null;
  ownerOptions: PersonOption[];
};

export function TaskInlineCells({
  taskId,
  initialStatus,
  statusOptions,
  initialOwner,
  ownerActive,
  ownerOptions,
}: Props) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-neutral-500">Статус</span>
        <InlineStatusCell
          value={initialStatus}
          options={statusOptions}
          onSave={(next) => setTaskStatus(taskId, next)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-neutral-500">Отговорник</span>
        <InlinePersonCell
          value={initialOwner}
          valueActive={ownerActive ?? true}
          options={ownerOptions}
          onSave={(newId) => setTaskOwner(taskId, newId)}
          emptyLabel="— Без отговорник"
        />
      </div>
    </>
  );
}
