"use client";

import Link from "next/link";
import type { Route } from "next";
import type { ApartmentSize, RenovationStatus } from "@prisma/client";
import {
  type ColumnDef,
} from "@/components/ui/column-picker";
import { DeleteRowButton } from "@/components/ui/delete-row-button";
import { ReadOnlyBadge } from "@/components/ui/read-only-badge";
import {
  InlinePersonCell,
  type PersonOption,
} from "@/components/ui/inline-person-cell";
import {
  InlineStatusCell,
  type StatusOption,
} from "@/components/ui/inline-status-cell";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TBody, THead, TH, TR, TD, TableEmpty } from "@/components/ui/table";
import {
  APARTMENT_SIZE_LABELS,
  RENOVATION_STATUSES,
  RENOVATION_STATUS_LABELS,
  RENOVATION_STATUS_TONES,
} from "@/lib/renovations/constants";
import { deleteRenovation, setRenovationManager, setRenovationStatus } from "./actions";

// List-view table for `/renovations`. Updated 20.05.2026 for the template-
// driven activity model:
//   - Title column dropped (derived display — building/unit chip identifies
//     the renovation at a glance).
//   - Тип column dropped (no longer in schema).
//   - Размер column added (apartmentSize).
//   - "Прогрес" + the period column read activity counts not task counts.

export type RenovationListRowVm = {
  id: string;
  status: RenovationStatus;
  apartmentSize: ApartmentSize | null;
  bathroomCount: number | null;
  description: string | null;
  propertyId: string;
  propertyName: string;
  propertyBuilding: string;
  managerId: string | null;
  managerName: string | null;
  managerActive: boolean | null;
  requestedByContactId: string | null;
  requestedByContactName: string | null;
  periodLabel: string;
  plannedStartIso: string | null;
  plannedEndIso: string | null;
  actualStartFormatted: string | null;
  actualEndFormatted: string | null;
  activityTotal: number;
  activityDone: number;
  // Per-row capacity chip (spec §5.1 #7). When `capacityChipApplies` is
  // false (renovation in draft/cancelled), the column renders empty. When
  // true and `capacityChip` is null, the renovation is OK. When non-null,
  // shows `+N TeamName` in danger tone.
  capacityChip: { teamName: string; over: number } | null;
  capacityChipApplies: boolean;
  createdAtFormatted: string;
};

// Per spec §5.1 — Hidden-by-default columns surface via the shared
// <ColumnPicker> + useColumnVisibility primitives (localStorage-backed).
// Default columns: Имот, Размер, Статус, Отговорник, Период, Прогрес,
// Капацитет, Създаден.
// Hidden by default: Заявител, Брой бани, Реално начало, Реално завършване,
// Описание.
export type RenovationsColumnKey =
  | "property"
  | "apartmentSize"
  | "status"
  | "manager"
  | "requestedBy"
  | "bathrooms"
  | "period"
  | "actualStart"
  | "actualEnd"
  | "description"
  | "progress"
  | "capacity"
  | "createdAt";

export const RENOVATIONS_COLUMNS: ReadonlyArray<ColumnDef<RenovationsColumnKey>> = [
  { key: "property", label: "Имот", defaultVisible: true },
  { key: "apartmentSize", label: "Размер", defaultVisible: true },
  { key: "bathrooms", label: "Брой бани", defaultVisible: false },
  { key: "status", label: "Статус", defaultVisible: true },
  { key: "manager", label: "Отговорник", defaultVisible: true },
  { key: "requestedBy", label: "Заявител", defaultVisible: false },
  { key: "period", label: "Планиран период", defaultVisible: true },
  { key: "actualStart", label: "Реално начало", defaultVisible: false },
  { key: "actualEnd", label: "Реално завършване", defaultVisible: false },
  { key: "description", label: "Описание", defaultVisible: false },
  { key: "progress", label: "Прогрес", defaultVisible: true },
  { key: "capacity", label: "Капацитет", defaultVisible: true },
  { key: "createdAt", label: "Създаден", defaultVisible: true },
];

const STATUS_OPTIONS: ReadonlyArray<StatusOption<RenovationStatus>> =
  RENOVATION_STATUSES.map((value) => ({
    value,
    label: RENOVATION_STATUS_LABELS[value],
    tone: RENOVATION_STATUS_TONES[value],
  }));

export function RenovationsTable({
  rows,
  managerOptions,
  visible,
  canDelete,
}: {
  rows: RenovationListRowVm[];
  managerOptions: PersonOption[];
  // Column visibility map. Keys default to true; the caller (list-view.tsx)
  // owns the actual state via `useColumnVisibility`.
  visible: Record<RenovationsColumnKey, boolean>;
  // Admin-only: when true, each row gets a trailing × button (R12).
  canDelete: boolean;
}) {
  const visibleCount = Object.values(visible).filter(Boolean).length + (canDelete ? 1 : 0);
  return (
    <Table>
      <THead>
        <TR hover={false}>
          {visible.property && <TH>Имот</TH>}
          {visible.apartmentSize && <TH>Размер</TH>}
          {visible.bathrooms && <TH align="right">Бани</TH>}
          {visible.status && <TH>Статус</TH>}
          {visible.manager && <TH>Отговорник</TH>}
          {visible.requestedBy && <TH>Заявител</TH>}
          {visible.period && <TH>Планиран период</TH>}
          {visible.actualStart && <TH>Реално начало</TH>}
          {visible.actualEnd && <TH>Реално завършване</TH>}
          {visible.description && <TH>Описание</TH>}
          {visible.progress && <TH align="right">Прогрес</TH>}
          {visible.capacity && <TH>Капацитет</TH>}
          {visible.createdAt && <TH align="right">Създаден</TH>}
          {canDelete && <TH align="right" className="w-10" />}
        </TR>
      </THead>
      <TBody>
        {rows.length === 0 && (
          <TableEmpty colSpan={visibleCount}>Няма намерени ремонти.</TableEmpty>
        )}
        {rows.map((r) => {
          const pct = r.activityTotal === 0
            ? 0
            : Math.round((r.activityDone / r.activityTotal) * 100);
          return (
            <TR key={r.id}>
              {visible.property && (
                <TD>
                  <Link
                    href={`/renovations/${r.id}` as Route}
                    className="text-neutral-900 hover:text-accent-700 transition-colors duration-120"
                  >
                    {r.propertyBuilding} · {r.propertyName}
                  </Link>
                </TD>
              )}
              {visible.apartmentSize && (
                <TD muted className="text-sm">
                  {r.apartmentSize ? (
                    <StatusBadge tone="neutral">
                      {APARTMENT_SIZE_LABELS[r.apartmentSize]}
                    </StatusBadge>
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </TD>
              )}
              {visible.bathrooms && (
                <TD muted numeric className="text-sm tabular-nums">
                  {r.bathroomCount ?? <span className="text-neutral-400">—</span>}
                </TD>
              )}
              {visible.status && (
                <TD>
                  <InlineStatusCell
                    value={r.status}
                    options={STATUS_OPTIONS}
                    onSave={(next) => setRenovationStatus(r.id, next)}
                  />
                </TD>
              )}
              {visible.manager && (
                <TD className="text-sm">
                  <InlinePersonCell
                    value={
                      r.managerId && r.managerName
                        ? { id: r.managerId, fullName: r.managerName }
                        : null
                    }
                    valueActive={r.managerActive ?? true}
                    options={managerOptions}
                    onSave={(next) => setRenovationManager(r.id, next)}
                    emptyLabel="— Без отговорник"
                  />
                </TD>
              )}
              {visible.requestedBy && (
                <TD muted className="text-sm">
                  {r.requestedByContactId && r.requestedByContactName ? (
                    <Link
                      href={`/contacts/${r.requestedByContactId}` as Route}
                      className="hover:text-accent-700 transition-colors duration-120"
                    >
                      {r.requestedByContactName}
                    </Link>
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </TD>
              )}
              {visible.period && (
                <TD muted numeric className="text-sm tabular-nums">
                  {r.periodLabel}
                </TD>
              )}
              {visible.actualStart && (
                <TD muted numeric className="text-sm tabular-nums">
                  {r.actualStartFormatted ?? <span className="text-neutral-400">—</span>}
                </TD>
              )}
              {visible.actualEnd && (
                <TD muted numeric className="text-sm tabular-nums">
                  {r.actualEndFormatted ?? <span className="text-neutral-400">—</span>}
                </TD>
              )}
              {visible.description && (
                <TD muted className="text-sm">
                  {r.description ? (
                    <span
                      className="block max-w-xs truncate"
                      title={r.description}
                    >
                      {r.description}
                    </span>
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </TD>
              )}
              {visible.progress && (
                <TD numeric>
                  {r.activityTotal === 0 ? (
                    <span className="text-neutral-400 text-sm">— няма дейности</span>
                  ) : (
                    <div className="flex items-center gap-2 justify-end">
                      <span className="text-sm tabular-nums text-neutral-600 w-16 text-right">
                        {r.activityDone} / {r.activityTotal}
                      </span>
                      <div className="w-20 h-2 bg-neutral-150 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-success-500 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </TD>
              )}
              {visible.capacity && (
                <TD>
                  {r.capacityChipApplies ? (
                    r.capacityChip ? (
                      <StatusBadge tone="danger">
                        +{r.capacityChip.over} {r.capacityChip.teamName}
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="success">OK</StatusBadge>
                    )
                  ) : (
                    <span className="text-neutral-300 text-sm">—</span>
                  )}
                </TD>
              )}
              {visible.createdAt && (
                <TD muted numeric className="text-sm tabular-nums">
                  {r.createdAtFormatted}
                  <ReadOnlyBadge reason="Системно поле, попълва се автоматично." />
                </TD>
              )}
              {canDelete && (
                <TD align="right">
                  <DeleteRowButton
                    label={`ремонт „${r.propertyBuilding} · ${r.propertyName}"`}
                    onDelete={() => {
                      const fd = new FormData();
                      fd.set("renovationId", r.id);
                      return deleteRenovation(fd);
                    }}
                  />
                </TD>
              )}
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
