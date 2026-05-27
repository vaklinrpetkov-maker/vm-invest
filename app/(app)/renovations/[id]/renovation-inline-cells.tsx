"use client";

// Header status + dates-panel inline cells for the renovation detail page.
// Thin client wrapper so the detail page itself stays fully server-rendered
// — same pattern as `tasks/[id]/task-inline-cells.tsx`.
//
// Per `specs/renovations.md`:
//   §6.1 — header status as <InlineStatusCell>
//   §6.2 — plannedStartDate / actualStartDate / actualEndDate as
//          <InlineDateCell>; plannedEndDate stays read-only with a 🔒
//          ReadOnlyBadge (derived from MAX(activity.endDate)).

import type { RenovationStatus } from "@prisma/client";
import { InlineDateCell } from "@/components/ui/inline-date-cell";
import {
  InlineStatusCell,
  type StatusOption,
} from "@/components/ui/inline-status-cell";
import { ReadOnlyBadge } from "@/components/ui/read-only-badge";
import { formatDate } from "@/lib/format";
import {
  setRenovationActualEndDate,
  setRenovationActualStartDate,
  setRenovationPlannedStartDate,
  setRenovationStatus,
} from "../actions";

export function RenovationStatusInline({
  renovationId,
  value,
  options,
  disabled,
}: {
  renovationId: string;
  value: RenovationStatus;
  options: ReadonlyArray<StatusOption<RenovationStatus>>;
  disabled?: boolean;
}) {
  return (
    <InlineStatusCell
      value={value}
      options={options}
      onSave={(next) => setRenovationStatus(renovationId, next)}
      disabled={disabled}
    />
  );
}

// Dates panel: a 2×2 grid wired with the per-field setters. Each cell shows
// the value via <InlineDateCell> when editable, or a small static label +
// 🔒 badge when locked (plannedEndDate is the only locked field — it's
// derived from MAX(activity.endDate) and recomputed on every activity write).
export function RenovationDatesInline({
  renovationId,
  plannedStartDate,
  plannedEndDate,
  actualStartDate,
  actualEndDate,
  canEdit,
}: {
  renovationId: string;
  plannedStartDate: Date | null;
  plannedEndDate: Date | null;
  actualStartDate: Date | null;
  actualEndDate: Date | null;
  canEdit: boolean;
}) {
  const plannedStartIso = plannedStartDate
    ? plannedStartDate.toISOString().slice(0, 10)
    : null;
  const actualStartIso = actualStartDate
    ? actualStartDate.toISOString().slice(0, 10)
    : null;
  const actualEndIso = actualEndDate
    ? actualEndDate.toISOString().slice(0, 10)
    : null;

  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Планирано начало">
        <InlineDateCell
          value={plannedStartIso}
          onSave={(iso) => setRenovationPlannedStartDate(renovationId, iso)}
          disabled={!canEdit}
        />
      </Field>

      <Field label="Планиран край (изчислен)">
        <div className="flex items-center gap-1.5">
          <span className="tabular-nums text-base text-neutral-900">
            {plannedEndDate ? (
              formatDate(plannedEndDate)
            ) : (
              <span className="text-neutral-400">—</span>
            )}
          </span>
          <ReadOnlyBadge reason="Изчислява се автоматично от датите на дейностите." />
        </div>
      </Field>

      <Field label="Реално начало">
        <InlineDateCell
          value={actualStartIso}
          onSave={(iso) => setRenovationActualStartDate(renovationId, iso)}
          disabled={!canEdit}
        />
      </Field>

      <Field label="Реално завършване">
        <InlineDateCell
          value={actualEndIso}
          onSave={(iso) => setRenovationActualEndDate(renovationId, iso)}
          disabled={!canEdit}
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm text-neutral-500">{label}</span>
      <span className="text-base text-neutral-900">{children}</span>
    </div>
  );
}
