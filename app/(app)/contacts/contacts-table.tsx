"use client";

import Link from "next/link";
import type { Route } from "next";
import { ColumnPicker, useColumnVisibility } from "@/components/ui/column-picker";
import { DeleteRowButton } from "@/components/ui/delete-row-button";
import { InlineDateCell } from "@/components/ui/inline-date-cell";
import { InlineMultilineCell } from "@/components/ui/inline-multiline-cell";
import {
  InlinePersonCell,
  type PersonOption,
} from "@/components/ui/inline-person-cell";
import {
  InlineRelationCell,
  type RelationOption,
} from "@/components/ui/inline-relation-cell";
import {
  InlineStatusCell,
  type StatusOption,
} from "@/components/ui/inline-status-cell";
import { InlineTextCell } from "@/components/ui/inline-text-cell";
import { ReadOnlyBadge } from "@/components/ui/read-only-badge";
import { Table, TBody, THead, TH, TR, TD, TableEmpty } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { deleteContact } from "./[id]/actions";
import {
  setContactAddress,
  setContactBirthDate,
  setContactBuilding,
  setContactEgn,
  setContactEmail,
  setContactName,
  setContactNotes,
  setContactPhone,
  setContactProperties,
  setContactType,
} from "./field-actions";
import { setContactOwner } from "./owner-actions";

export type ContactRow = {
  id: string;
  fullName: string;
  type: string;
  phone: string | null;
  email: string | null;
  egn: string | null;
  address: string | null;
  buildingId: string | null;
  buildingName: string | null;
  properties: string | null;
  notes: string | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerActive: boolean | null;
  birthDate: string | null; // ISO YYYY-MM-DD
  age: number | null;
  birthdayThisYear: string | null;
  createdAt: string; // pre-formatted
};

type ColumnKey =
  | "name"
  | "type"
  | "phone"
  | "email"
  | "owner"
  | "building"
  | "createdAt"
  | "egn"
  | "address"
  | "age"
  | "birthdayThisYear"
  | "properties"
  | "notes"
  | "birthDate";

type ColumnDef = {
  key: ColumnKey;
  label: string;
  defaultVisible: boolean;
};

const COLUMNS: ColumnDef[] = [
  { key: "name", label: "Име", defaultVisible: true },
  { key: "type", label: "Тип", defaultVisible: true },
  { key: "phone", label: "Телефон", defaultVisible: true },
  { key: "email", label: "Имейл", defaultVisible: true },
  { key: "owner", label: "Отговорник", defaultVisible: true },
  { key: "building", label: "Сграда", defaultVisible: true },
  { key: "createdAt", label: "Добавен", defaultVisible: true },
  { key: "egn", label: "ЕГН / ЕИК", defaultVisible: false },
  { key: "address", label: "Адрес", defaultVisible: false },
  { key: "birthDate", label: "Рождена дата", defaultVisible: false },
  { key: "age", label: "Възраст", defaultVisible: false },
  { key: "birthdayThisYear", label: "Рожден ден тази година", defaultVisible: false },
  { key: "properties", label: "Имоти", defaultVisible: false },
  { key: "notes", label: "Бележки", defaultVisible: false },
];

const STORAGE_KEY = "contacts:visible-columns";

export function ContactsTable({
  rows,
  ownerOptions,
  buildingOptions,
  contactTypes,
  canDelete,
}: {
  rows: ContactRow[];
  ownerOptions: PersonOption[];
  buildingOptions: ReadonlyArray<RelationOption>;
  contactTypes: ReadonlyArray<string>;
  canDelete: boolean;
}) {
  const { state: visible, toggle } = useColumnVisibility(STORAGE_KEY, COLUMNS);

  // Contact types render as a non-colored enum picker — same primitive as
  // status, all options use the neutral tone per spec §3.2.
  const typeOptions: ReadonlyArray<StatusOption<string>> = contactTypes.map((t) => ({
    value: t,
    label: t,
    tone: "neutral",
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <ColumnPicker columns={COLUMNS} visible={visible} onToggle={toggle} />
      </div>

      <Table>
        <THead>
          <TR hover={false}>
            {COLUMNS.map(
              (c) =>
                visible[c.key] && (
                  <TH key={c.key} align={c.key === "age" ? "right" : "left"}>
                    {c.label}
                  </TH>
                ),
            )}
            {canDelete && <TH align="right" className="w-10" />}
          </TR>
        </THead>
        <TBody>
          {rows.length === 0 && (
            <TableEmpty colSpan={Object.values(visible).filter(Boolean).length + (canDelete ? 1 : 0)}>
              Няма намерени контакти.
            </TableEmpty>
          )}
          {rows.map((c) => (
            <TR key={c.id}>
              {/* Name — link to detail on the icon side, inline edit on the text */}
              {visible.name && (
                <TD>
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/contacts/${c.id}` as Route}
                      title="Отвори детайли"
                      className="text-neutral-400 hover:text-neutral-700 text-sm shrink-0"
                    >
                      ↗
                    </Link>
                    <InlineTextCell
                      value={c.fullName}
                      onSave={(v) => setContactName(c.id, v)}
                      maxLength={200}
                      className="flex-1 min-w-0"
                    />
                  </div>
                </TD>
              )}
              {visible.type && (
                <TD>
                  <InlineStatusCell
                    value={c.type}
                    options={typeOptions}
                    onSave={(v) => setContactType(c.id, v)}
                  />
                </TD>
              )}
              {visible.phone && (
                <TD muted>
                  <InlineTextCell
                    value={c.phone}
                    onSave={(v) => setContactPhone(c.id, v)}
                    type="tel"
                    readClassName="tabular-nums"
                  />
                </TD>
              )}
              {visible.email && (
                <TD muted>
                  <InlineTextCell
                    value={c.email}
                    onSave={(v) => setContactEmail(c.id, v)}
                    type="email"
                  />
                </TD>
              )}
              {visible.owner && (
                <TD>
                  <InlinePersonCell
                    value={
                      c.ownerId && c.ownerName
                        ? { id: c.ownerId, fullName: c.ownerName }
                        : null
                    }
                    valueActive={c.ownerActive ?? true}
                    options={ownerOptions}
                    onSave={(newId) => setContactOwner(c.id, newId)}
                  />
                </TD>
              )}
              {visible.building && (
                <TD muted>
                  <InlineRelationCell
                    value={
                      c.buildingId && c.buildingName
                        ? { id: c.buildingId, label: c.buildingName }
                        : null
                    }
                    options={buildingOptions}
                    onSave={(id) => setContactBuilding(c.id, id)}
                    unassignLabel="— Без сграда"
                    searchPlaceholder="Търси сграда…"
                  />
                </TD>
              )}
              {visible.createdAt && (
                <TD muted numeric>
                  <span className="tabular-nums text-neutral-600">{c.createdAt}</span>
                  <ReadOnlyBadge reason="Системно поле, попълва се автоматично." />
                </TD>
              )}
              {visible.egn && (
                <TD>
                  <InlineTextCell
                    value={c.egn}
                    onSave={(v) => setContactEgn(c.id, v)}
                    readClassName="font-mono text-sm"
                    maxLength={10}
                    placeholder="9 или 10 цифри"
                  />
                </TD>
              )}
              {visible.address && (
                <TD muted className="text-sm">
                  <InlineTextCell
                    value={c.address}
                    onSave={(v) => setContactAddress(c.id, v)}
                    maxLength={500}
                  />
                </TD>
              )}
              {visible.birthDate && (
                <TD>
                  <InlineDateCell
                    value={c.birthDate}
                    onSave={(iso) => setContactBirthDate(c.id, iso)}
                  />
                </TD>
              )}
              {visible.age && (
                <TD muted numeric>
                  {c.age !== null ? (
                    <span>{c.age}</span>
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                  <ReadOnlyBadge reason="Изчислено автоматично от рождената дата." />
                </TD>
              )}
              {visible.birthdayThisYear && (
                <TD muted numeric>
                  {c.birthdayThisYear ? (
                    <span className="tabular-nums">{c.birthdayThisYear}</span>
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                  <ReadOnlyBadge reason="Изчислено автоматично от рождената дата." />
                </TD>
              )}
              {visible.properties && (
                <TD muted className={cn("text-sm", "max-w-xs truncate")}>
                  <InlineTextCell
                    value={c.properties}
                    onSave={(v) => setContactProperties(c.id, v)}
                    maxLength={1000}
                  />
                </TD>
              )}
              {visible.notes && (
                <TD muted className={cn("text-sm", "max-w-xs")}>
                  <InlineMultilineCell
                    value={c.notes}
                    onSave={(v) => setContactNotes(c.id, v)}
                  />
                </TD>
              )}
              {canDelete && (
                <TD align="right">
                  <DeleteRowButton
                    label={`контакта „${c.fullName}"`}
                    onDelete={() => {
                      const fd = new FormData();
                      fd.set("contactId", c.id);
                      return deleteContact(fd);
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
