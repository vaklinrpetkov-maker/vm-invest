"use client";

import Link from "next/link";
import type { Route } from "next";
import type { MeetingType } from "@prisma/client";
import { ColumnPicker, useColumnVisibility, type ColumnDef } from "@/components/ui/column-picker";
import { InlineDateTimeCell } from "@/components/ui/inline-datetime-cell";
import {
  InlineMultiSelectCell,
  type MultiSelectOption,
} from "@/components/ui/inline-multi-select-cell";
import { InlineNumberCell } from "@/components/ui/inline-number-cell";
import {
  InlineStatusCell,
  type StatusOption,
} from "@/components/ui/inline-status-cell";
import { InlineTextCell } from "@/components/ui/inline-text-cell";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TBody, THead, TH, TR, TD, TableEmpty } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import {
  MEETING_STATUS_LABELS,
  MEETING_STATUS_TONES,
  MEETING_TYPE_LABELS,
  MEETING_TYPE_TONES,
} from "@/lib/meetings/constants";
import {
  setMeetingAssignees,
  setMeetingDuration,
  setMeetingLocation,
  setMeetingStartsAt,
  setMeetingType,
} from "./field-actions";

export type MeetingRow = {
  id: string;
  startsAtIso: string;       // ISO UTC — for past-date arithmetic on the client
  startsAtLocal: string;     // YYYY-MM-DDTHH:MM in Europe/Sofia — for the inline datetime input
  startsAtFormatted: string; // Pretty display from formatDateTime()
  durationMinutes: number;
  contactName: string;
  type: keyof typeof MEETING_TYPE_LABELS;
  status: keyof typeof MEETING_STATUS_LABELS;
  location: string | null;
  // Full assignee objects (id + label) so the multi-select cell can render
  // pills without an extra option lookup.
  assignees: MultiSelectOption[];
  // Per-row permission flag — disables inline cells when the user can't
  // edit (not an assignee + not manager/admin) or when the meeting is
  // cancelled. Computed at the page layer; mirrors the server-side check
  // in field-actions.ts so the affordance matches the action.
  canEdit: boolean;
};

type ColumnKey = "when" | "contact" | "type" | "location" | "assignees" | "status";

const COLUMNS: ReadonlyArray<ColumnDef<ColumnKey>> = [
  { key: "when", label: "Кога", defaultVisible: true },
  { key: "contact", label: "Клиент", defaultVisible: true },
  { key: "type", label: "Тип", defaultVisible: true },
  { key: "location", label: "Локация", defaultVisible: true },
  { key: "assignees", label: "Участници", defaultVisible: true },
  { key: "status", label: "Статус", defaultVisible: true },
];

const STORAGE_KEY = "meetings:visible-columns";

// Inline type picker — five options, color-coded via the existing
// MEETING_TYPE_TONES map.
const MEETING_TYPE_OPTIONS: ReadonlyArray<StatusOption<MeetingType>> = (
  Object.keys(MEETING_TYPE_LABELS) as MeetingType[]
).map((value) => ({
  value,
  label: MEETING_TYPE_LABELS[value],
  tone: MEETING_TYPE_TONES[value],
}));

export function MeetingsTable({
  rows,
  assigneeOptions,
}: {
  rows: MeetingRow[];
  assigneeOptions: MultiSelectOption[];
}) {
  const { state: visible, toggle } = useColumnVisibility(STORAGE_KEY, COLUMNS);
  const visibleCount = Object.values(visible).filter(Boolean).length;
  const now = Date.now();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <ColumnPicker columns={COLUMNS} visible={visible} onToggle={toggle} />
      </div>

      <Table>
        <THead>
          <TR hover={false}>
            {visible.when && <TH>Кога</TH>}
            {visible.contact && <TH>Клиент</TH>}
            {visible.type && <TH>Тип</TH>}
            {visible.location && <TH>Локация</TH>}
            {visible.assignees && <TH>Участници</TH>}
            {visible.status && <TH>Статус</TH>}
          </TR>
        </THead>
        <TBody>
          {rows.length === 0 && (
            <TableEmpty colSpan={visibleCount}>Няма намерени срещи.</TableEmpty>
          )}
          {rows.map((m) => {
            const startsAt = new Date(m.startsAtIso).getTime();
            const isPast = startsAt < now;
            const createdPastDate =
              isPast && m.status === "upcoming" && startsAt + m.durationMinutes * 60_000 < now;
            return (
              <TR key={m.id}>
                {visible.when && (
                  <TD
                    className={cn(
                      "font-mono",
                      createdPastDate && "border-l-2 border-danger-500 pl-2",
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/meetings/${m.id}` as Route}
                        title="Отвори детайли"
                        className="text-neutral-400 hover:text-neutral-700 text-sm shrink-0"
                      >
                        ↗
                      </Link>
                      <InlineDateTimeCell
                        value={m.startsAtLocal}
                        onSave={(iso) => setMeetingStartsAt(m.id, iso)}
                        disabled={!m.canEdit}
                        className="flex-1 min-w-0"
                      />
                      <InlineNumberCell
                        value={m.durationMinutes}
                        onSave={(v) => setMeetingDuration(m.id, v)}
                        format="integer"
                        suffix="мин"
                        min={0}
                        max={720}
                        disabled={!m.canEdit}
                        className="shrink-0 text-sm"
                      />
                    </div>
                  </TD>
                )}
                {visible.contact && (
                  <TD>
                    <Link
                      href={`/meetings/${m.id}` as Route}
                      className="text-neutral-900 hover:text-accent-700 transition-colors duration-120"
                    >
                      {m.contactName}
                    </Link>
                  </TD>
                )}
                {visible.type && (
                  <TD>
                    <InlineStatusCell
                      value={m.type}
                      options={MEETING_TYPE_OPTIONS}
                      onSave={(next) => setMeetingType(m.id, next)}
                      disabled={!m.canEdit}
                    />
                  </TD>
                )}
                {visible.location && (
                  <TD muted className="text-sm">
                    <InlineTextCell
                      value={m.location}
                      onSave={(v) => setMeetingLocation(m.id, v)}
                      maxLength={500}
                      disabled={!m.canEdit}
                    />
                  </TD>
                )}
                {visible.assignees && (
                  <TD className="text-sm">
                    <InlineMultiSelectCell
                      values={m.assignees}
                      options={assigneeOptions}
                      onSave={(ids) => setMeetingAssignees(m.id, ids)}
                      disabled={!m.canEdit}
                      searchPlaceholder="Търси участник…"
                      emptyLabel="—"
                    />
                  </TD>
                )}
                {visible.status && (
                  <TD>
                    <StatusBadge tone={MEETING_STATUS_TONES[m.status]}>
                      {MEETING_STATUS_LABELS[m.status]}
                    </StatusBadge>
                  </TD>
                )}
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
