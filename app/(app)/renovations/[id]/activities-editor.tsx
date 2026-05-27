"use client";

// Per-renovation activity list — inline-editable. Replaces the prior
// `tasks-editor.tsx` for the template-driven activity model.
//
// Per spec §6.3:
//   - drag handle (▲▼) → reorderRenovationActivities
//   - name (InlineTextCell), team (read-only chip)
//   - people (InlineNumberCell), days (InlineNumberCell, step 0.5)
//   - start/end (InlineDateCell), status (InlineStatusCell, 4 tones)
//   - per-row × delete (one-click + native confirm; cascades plannedEndDate
//     recompute server-side).
//
// All cells share the same per-row disabled gate — admin/manager + the
// renovation's responsible manager can edit; otherwise read-only.

import { useState, useTransition } from "react";
import type { RenovationTaskStatus } from "@prisma/client";
import { InlineDateCell } from "@/components/ui/inline-date-cell";
import { InlineNumberCell } from "@/components/ui/inline-number-cell";
import {
  InlineStatusCell,
  type StatusOption,
} from "@/components/ui/inline-status-cell";
import { InlineTextCell } from "@/components/ui/inline-text-cell";
import { ReadOnlyBadge } from "@/components/ui/read-only-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TBody, THead, TH, TR, TD } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import {
  RENOVATION_TASK_STATUSES,
  RENOVATION_TASK_STATUS_LABELS,
  RENOVATION_TASK_STATUS_TONES,
} from "@/lib/renovations/constants";
import {
  deleteRenovationActivity,
  reorderRenovationActivities,
  setRenovationActivityDurationDays,
  setRenovationActivityEndDate,
  setRenovationActivityName,
  setRenovationActivityPeopleRequired,
  setRenovationActivityStartDate,
  setRenovationActivityStatus,
} from "../actions";

export type ActivityRowVm = {
  id: string;
  name: string;
  teamId: string | null;
  teamName: string | null;
  teamSpecialty: string | null;
  peopleRequired: number;
  durationDays: number;
  startDateIso: string | null;
  endDateIso: string | null;
  status: RenovationTaskStatus;
  sortOrder: number;
  canEdit: boolean;
};

type Props = {
  renovationId: string;
  activities: ActivityRowVm[];
  canEdit: boolean;
};

const STATUS_OPTIONS: ReadonlyArray<StatusOption<RenovationTaskStatus>> =
  RENOVATION_TASK_STATUSES.map((value) => ({
    value,
    label: RENOVATION_TASK_STATUS_LABELS[value],
    tone: RENOVATION_TASK_STATUS_TONES[value],
  }));

export function RenovationActivitiesEditor({
  renovationId,
  activities,
  canEdit,
}: Props) {
  if (activities.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Все още няма дейности. Натиснете „+ Добави дейност“, за да започнете.
      </p>
    );
  }

  return (
    <Table>
      <THead>
        <TR hover={false}>
          <TH className="w-16">Ред</TH>
          <TH>Дейност</TH>
          <TH>Екип</TH>
          <TH align="right">Хора</TH>
          <TH align="right">Дни</TH>
          <TH>Начало</TH>
          <TH>Край</TH>
          <TH>Статус</TH>
          <TH align="right" className="w-12">{/* delete */}</TH>
        </TR>
      </THead>
      <TBody>
        {activities.map((a, idx) => (
          <ActivityRow
            key={a.id}
            row={a}
            index={idx}
            allIds={activities.map((x) => x.id)}
            renovationId={renovationId}
            canEdit={canEdit && a.canEdit}
          />
        ))}
      </TBody>
    </Table>
  );
}

function ActivityRow({
  row,
  index,
  allIds,
  renovationId,
  canEdit,
}: {
  row: ActivityRowVm;
  index: number;
  allIds: string[];
  renovationId: string;
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const disabled = !canEdit;

  function moveUp() {
    if (index === 0) return;
    const next = [...allIds];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    startTransition(async () => {
      setErr(null);
      const res = await reorderRenovationActivities(renovationId, next);
      if (!res.ok) setErr(res.error);
    });
  }

  function moveDown() {
    if (index === allIds.length - 1) return;
    const next = [...allIds];
    [next[index + 1], next[index]] = [next[index], next[index + 1]];
    startTransition(async () => {
      setErr(null);
      const res = await reorderRenovationActivities(renovationId, next);
      if (!res.ok) setErr(res.error);
    });
  }

  function onDelete() {
    if (!confirm(`Премахни дейност „${row.name}“ от ремонта?`)) return;
    startTransition(async () => {
      setErr(null);
      const res = await deleteRenovationActivity(row.id);
      if (!res.ok) setErr(res.error);
    });
  }

  // Visual cue when the activity is overdue and still open.
  const overdue =
    row.endDateIso !== null &&
    row.status !== "done" &&
    row.status !== "cancelled" &&
    row.endDateIso < new Date().toISOString().slice(0, 10);

  return (
    <TR className={cn(overdue && "border-l-2 border-danger-500")}>
      <TD muted className="font-mono text-xs">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={moveUp}
            disabled={pending || disabled || index === 0}
            className="px-1 text-neutral-500 hover:text-neutral-900 disabled:opacity-30"
            title="Премести нагоре"
          >▲</button>
          <span className="min-w-[2ch] text-right">{row.sortOrder}</span>
          <button
            type="button"
            onClick={moveDown}
            disabled={pending || disabled || index === allIds.length - 1}
            className="px-1 text-neutral-500 hover:text-neutral-900 disabled:opacity-30"
            title="Премести надолу"
          >▼</button>
        </div>
      </TD>
      <TD>
        <InlineTextCell
          value={row.name}
          onSave={(v) => setRenovationActivityName(row.id, v)}
          maxLength={200}
          disabled={disabled}
        />
        {err && <div className="text-xs text-danger-700 mt-1">{err}</div>}
      </TD>
      <TD muted className="text-sm">
        {/* Team chip is read-only per spec §6.3 — the snapshot value is
            baked at activity-load time and cannot be edited from the row.
            The 🔒 badge surfaces why. */}
        <span className="inline-flex items-center gap-1.5">
          {row.teamName ? (
            <StatusBadge tone="neutral">
              {row.teamSpecialty ?? row.teamName}
            </StatusBadge>
          ) : (
            <StatusBadge tone="neutral-outline">Outsourced</StatusBadge>
          )}
          <ReadOnlyBadge reason="Екипът е фиксиран при зареждане на дейността от каталога." />
        </span>
      </TD>
      <TD align="right">
        <InlineNumberCell
          value={row.peopleRequired}
          format="integer"
          min={0}
          suffix={null}
          onSave={(v) => setRenovationActivityPeopleRequired(row.id, v)}
          disabled={disabled}
        />
      </TD>
      <TD align="right">
        <InlineNumberCell
          value={row.durationDays}
          format="decimal"
          decimalDigits={1}
          min={0}
          suffix={null}
          onSave={(v) => setRenovationActivityDurationDays(row.id, v)}
          disabled={disabled}
        />
      </TD>
      <TD muted className="text-sm">
        <InlineDateCell
          value={row.startDateIso}
          onSave={(iso) => setRenovationActivityStartDate(row.id, iso)}
          disabled={disabled}
        />
      </TD>
      <TD muted className="text-sm">
        <InlineDateCell
          value={row.endDateIso}
          onSave={(iso) => setRenovationActivityEndDate(row.id, iso)}
          disabled={disabled}
        />
      </TD>
      <TD>
        <InlineStatusCell
          value={row.status}
          options={STATUS_OPTIONS}
          onSave={(next) => setRenovationActivityStatus(row.id, next)}
          disabled={disabled}
        />
      </TD>
      <TD align="right">
        {canEdit && (
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className={cn(
              "text-sm text-neutral-400 hover:text-danger-700 transition-colors duration-120",
              pending && "opacity-50",
            )}
            aria-label="Премахни дейността"
          >
            ×
          </button>
        )}
      </TD>
    </TR>
  );
}
