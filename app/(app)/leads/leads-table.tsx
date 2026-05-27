"use client";

import Link from "next/link";
import type { Route } from "next";
import type { LeadSource, LeadStatus } from "@prisma/client";
import { ColumnPicker, useColumnVisibility, type ColumnDef } from "@/components/ui/column-picker";
import { DeleteRowButton } from "@/components/ui/delete-row-button";
import { InlinePersonCell, type PersonOption } from "@/components/ui/inline-person-cell";
import {
  InlineStatusCell,
  type StatusOption,
} from "@/components/ui/inline-status-cell";
import { ReadOnlyBadge } from "@/components/ui/read-only-badge";
// StatusBadge is no longer imported — every status/source cell uses
// <InlineStatusCell>, which renders a <StatusBadge> internally as its trigger.
import { Table, TBody, THead, TH, TR, TD, TableEmpty } from "@/components/ui/table";
import {
  LEAD_SOURCE_LABELS,
  LEAD_SOURCE_TONES,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_TONES,
} from "@/lib/leads/constants";
import { deleteLead } from "./[id]/actions";
import { setLeadOwner } from "./owner-actions";
import { setLeadSource } from "./source-actions";
import { setLeadStatus } from "./status-actions";

// Build the option list once per render. Includes `converted` as a
// system-only entry — it renders correctly when set but is hidden from the
// picker (the Contracts conversion flow is the only writer).
const LEAD_STATUS_OPTIONS: ReadonlyArray<StatusOption<LeadStatus>> = [
  {
    value: "new",
    label: LEAD_STATUS_LABELS.new,
    tone: LEAD_STATUS_TONES.new,
  },
  {
    value: "in_progress",
    label: LEAD_STATUS_LABELS.in_progress,
    tone: LEAD_STATUS_TONES.in_progress,
  },
  {
    value: "no_progress",
    label: LEAD_STATUS_LABELS.no_progress,
    tone: LEAD_STATUS_TONES.no_progress,
  },
  {
    value: "converted",
    label: LEAD_STATUS_LABELS.converted,
    tone: LEAD_STATUS_TONES.converted,
    systemOnly: true,
  },
];

// Sources: `manual` and `phone` are user-pickable; `email_form` and
// `email_unparsed` are written by the Resend inbound webhook and render as
// current value only (systemOnly hides them from the picker). Tones come
// from the existing LEAD_SOURCE_TONES map. Spec §3.2 says non-status enums
// reuse <InlineStatusCell> with neutral tones — but lead sources already
// have meaningful tones in the existing static badge, so we keep them for
// visual continuity.
const LEAD_SOURCE_OPTIONS: ReadonlyArray<StatusOption<LeadSource>> = [
  {
    value: "manual",
    label: LEAD_SOURCE_LABELS.manual,
    tone: LEAD_SOURCE_TONES.manual,
  },
  {
    value: "phone",
    label: LEAD_SOURCE_LABELS.phone,
    tone: LEAD_SOURCE_TONES.phone,
  },
  {
    value: "email_form",
    label: LEAD_SOURCE_LABELS.email_form,
    tone: LEAD_SOURCE_TONES.email_form,
    systemOnly: true,
  },
  {
    value: "email_unparsed",
    label: LEAD_SOURCE_LABELS.email_unparsed,
    tone: LEAD_SOURCE_TONES.email_unparsed,
    systemOnly: true,
  },
];

export type LeadRow = {
  id: string;
  status: keyof typeof LEAD_STATUS_LABELS;
  source: keyof typeof LEAD_SOURCE_LABELS;
  contactName: string;
  ownerId: string | null;
  ownerName: string | null;
  ownerActive: boolean | null; // null when no owner is set
  properties: string[];
  createdAtFormatted: string;
};

type ColumnKey = "contact" | "status" | "source" | "owner" | "properties" | "createdAt";

const COLUMNS: ReadonlyArray<ColumnDef<ColumnKey>> = [
  { key: "contact", label: "Клиент", defaultVisible: true },
  { key: "status", label: "Статус", defaultVisible: true },
  { key: "source", label: "Източник", defaultVisible: true },
  { key: "owner", label: "Отговорник", defaultVisible: true },
  { key: "properties", label: "Имоти", defaultVisible: true },
  { key: "createdAt", label: "Създаден", defaultVisible: true },
];

const STORAGE_KEY = "leads:visible-columns";

export function LeadsTable({
  rows,
  ownerOptions,
  canDelete,
}: {
  rows: LeadRow[];
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
            {visible.contact && <TH>Клиент</TH>}
            {visible.status && <TH>Статус</TH>}
            {visible.source && <TH>Източник</TH>}
            {visible.owner && <TH>Отговорник</TH>}
            {visible.properties && <TH>Имоти</TH>}
            {visible.createdAt && <TH>Създаден</TH>}
            {canDelete && <TH align="right" className="w-10" />}
          </TR>
        </THead>
        <TBody>
          {rows.length === 0 && (
            <TableEmpty colSpan={visibleCount}>Няма намерени лийдове.</TableEmpty>
          )}
          {rows.map((l) => (
            <TR key={l.id}>
              {visible.contact && (
                <TD>
                  <Link
                    href={`/leads/${l.id}` as Route}
                    className="text-neutral-900 hover:text-accent-700 transition-colors duration-120"
                  >
                    {l.contactName}
                  </Link>
                </TD>
              )}
              {visible.status && (
                <TD>
                  <InlineStatusCell
                    value={l.status}
                    options={LEAD_STATUS_OPTIONS}
                    onSave={(next) => setLeadStatus(l.id, next)}
                  />
                </TD>
              )}
              {visible.source && (
                <TD>
                  <InlineStatusCell
                    value={l.source}
                    options={LEAD_SOURCE_OPTIONS}
                    onSave={(next) => setLeadSource(l.id, next)}
                  />
                </TD>
              )}
              {visible.owner && (
                <TD>
                  <InlinePersonCell
                    value={
                      l.ownerId && l.ownerName
                        ? { id: l.ownerId, fullName: l.ownerName }
                        : null
                    }
                    valueActive={l.ownerActive ?? true}
                    options={ownerOptions}
                    onSave={(newId) => setLeadOwner(l.id, newId)}
                    emptyLabel="— Без отговорник"
                  />
                </TD>
              )}
              {visible.properties && (
                <TD muted className="text-sm">
                  {l.properties.length === 0 ? (
                    <span className="text-neutral-400">—</span>
                  ) : l.properties.length === 1 ? (
                    l.properties[0]
                  ) : (
                    <>
                      {l.properties[0]}
                      <span className="text-neutral-400 ml-1">
                        +{l.properties.length - 1}
                      </span>
                    </>
                  )}
                </TD>
              )}
              {visible.createdAt && (
                <TD muted className="tabular-nums">
                  {l.createdAtFormatted}
                  <ReadOnlyBadge reason="Системно поле, попълва се автоматично." />
                </TD>
              )}
              {canDelete && (
                <TD align="right">
                  <DeleteRowButton
                    label={`лийд „${l.contactName}"`}
                    onDelete={() => {
                      const fd = new FormData();
                      fd.set("leadId", l.id);
                      return deleteLead(fd);
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
