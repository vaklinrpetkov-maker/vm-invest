"use client";

import Link from "next/link";
import type { Route } from "next";
import { ColumnPicker, useColumnVisibility, type ColumnDef } from "@/components/ui/column-picker";
import { FileCell } from "@/components/ui/file-cell";
import { InlineBooleanCell } from "@/components/ui/inline-boolean-cell";
import {
  InlineStatusCell,
  type StatusOption,
} from "@/components/ui/inline-status-cell";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TBody, THead, TH, TR, TD, TableEmpty } from "@/components/ui/table";
import {
  CONTRACT_STATUSES,
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_TONES,
  CONTRACT_TYPE_LABELS,
  CONTRACT_TYPE_TONES,
  type ContractStatus,
  type ContractType,
} from "@/lib/contracts/constants";
import type { AttachedFile } from "@/lib/files/types";
import { DeleteRowButton } from "@/components/ui/delete-row-button";
import {
  deleteContractAttachment,
  uploadContractAttachment,
} from "./attachment-actions";
import { deleteContract } from "./actions";
import { setContractStatus, setContractUsesCredit } from "./status-actions";

const CONTRACT_STATUS_OPTIONS: ReadonlyArray<StatusOption<ContractStatus>> =
  CONTRACT_STATUSES.map((value) => ({
    value,
    label: CONTRACT_STATUS_LABELS[value],
    tone: CONTRACT_STATUS_TONES[value],
  }));

export type ContractRow = {
  id: string;
  title: string;
  buyerFullName: string;
  contactId: string | null;
  contactName: string | null;
  // Resolved salesperson name to display: prefer the FK profile's fullName
  // (new contracts), fall back to the legacy free-text column (imported CSV
  // rows). Set to null when neither is populated.
  salesperson: string | null;
  salespersonActive: boolean | null;
  building: string | null;
  contractType: string;
  compositionStatus: string | null;
  preOrPost: string | null;
  usesCredit: boolean;
  totalDueEur: string;
  totalPaidEur: string;
  totalRemainingEur: string;
  status: string;
  signedAtFormatted: string | null;
  reminderDateFormatted: string | null;
  propertyCount: number;
  propertyPreview: string;
  files: AttachedFile[];
};

type ColumnKey =
  | "title"
  | "files"
  | "buyer"
  | "salesperson"
  | "building"
  | "contractType"
  | "composition"
  | "preOrPost"
  | "totalDue"
  | "totalPaid"
  | "totalRemaining"
  | "usesCredit"
  | "status"
  | "signedAt"
  | "reminderDate"
  | "propertyCount";

const COLUMNS: ReadonlyArray<ColumnDef<ColumnKey>> = [
  { key: "title", label: "Договор", defaultVisible: true },
  { key: "files", label: "Файлове", defaultVisible: true },
  { key: "buyer", label: "Купувач", defaultVisible: true },
  { key: "building", label: "Сграда", defaultVisible: true },
  { key: "contractType", label: "Тип договор", defaultVisible: true },
  { key: "totalDue", label: "Обща сума", defaultVisible: true },
  { key: "totalPaid", label: "Платено", defaultVisible: true },
  { key: "totalRemaining", label: "Остава", defaultVisible: true },
  { key: "usesCredit", label: "Кредит", defaultVisible: true },
  { key: "status", label: "Статус", defaultVisible: true },
  { key: "signedAt", label: "Подписан", defaultVisible: true },
  { key: "salesperson", label: "Консултант", defaultVisible: false },
  { key: "composition", label: "Апартамент / състав", defaultVisible: false },
  { key: "preOrPost", label: "Преди / След", defaultVisible: false },
  { key: "reminderDate", label: "Дата напомняне", defaultVisible: false },
  { key: "propertyCount", label: "Брой имоти", defaultVisible: false },
];

const STORAGE_KEY = "contracts:visible-columns";

function fmtMoney(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString("bg-BG", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function ContractsTable({
  rows,
  canEditStatus,
  canDeleteAttachments,
  canDelete,
}: {
  rows: ContractRow[];
  canEditStatus: boolean;
  canDeleteAttachments: boolean;
  // Admin-only: when true, each row gets a trailing × button that
  // soft-deletes the contract. Server action also enforces the gate.
  canDelete: boolean;
}) {
  const { state: visible, toggle } = useColumnVisibility(STORAGE_KEY, COLUMNS);
  const visibleCount = Object.values(visible).filter(Boolean).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <ColumnPicker columns={COLUMNS} visible={visible} onToggle={toggle} />
      </div>

      <Table>
        <THead>
          <TR hover={false}>
            {visible.title && <TH>Договор</TH>}
            {visible.files && <TH>Файлове</TH>}
            {visible.buyer && <TH>Купувач</TH>}
            {visible.salesperson && <TH>Консултант</TH>}
            {visible.building && <TH>Сграда</TH>}
            {visible.contractType && <TH>Тип</TH>}
            {visible.composition && <TH>Състав</TH>}
            {visible.preOrPost && <TH>Преди / След</TH>}
            {visible.totalDue && <TH align="right">Обща сума</TH>}
            {visible.totalPaid && <TH align="right">Платено</TH>}
            {visible.totalRemaining && <TH align="right">Остава</TH>}
            {visible.usesCredit && <TH>Кредит</TH>}
            {visible.status && <TH>Статус</TH>}
            {visible.signedAt && <TH>Подписан</TH>}
            {visible.reminderDate && <TH>Напомняне</TH>}
            {visible.propertyCount && <TH align="right">Имоти</TH>}
            {canDelete && <TH align="right" className="w-10" />}
          </TR>
        </THead>
        <TBody>
          {rows.length === 0 && (
            <TableEmpty colSpan={visibleCount}>Няма намерени договори.</TableEmpty>
          )}
          {rows.map((r) => (
            <TR key={r.id}>
              {visible.title && (
                <TD>
                  <Link
                    href={`/contracts/${r.id}` as Route}
                    className="text-neutral-900 hover:text-accent-700 transition-colors duration-120"
                    title={r.propertyPreview || undefined}
                  >
                    {r.title}
                  </Link>
                </TD>
              )}
              {visible.files && (
                <TD>
                  <FileCell
                    module="contracts"
                    files={r.files}
                    onUpload={async (file) => {
                      const fd = new FormData();
                      fd.append("contractId", r.id);
                      fd.append("file", file);
                      return uploadContractAttachment(fd);
                    }}
                    onDelete={
                      canDeleteAttachments
                        ? (file) => deleteContractAttachment(file.id)
                        : undefined
                    }
                  />
                </TD>
              )}
              {visible.buyer && (
                <TD muted>
                  {r.contactId ? (
                    <Link
                      href={`/contacts/${r.contactId}` as Route}
                      className="hover:text-accent-700 transition-colors"
                    >
                      {r.contactName ?? r.buyerFullName}
                    </Link>
                  ) : (
                    <span>{r.buyerFullName}</span>
                  )}
                </TD>
              )}
              {visible.salesperson && (
                <TD muted>
                  {r.salesperson === null ? (
                    <span className="text-neutral-400">—</span>
                  ) : r.salespersonActive === false ? (
                    <span className="italic opacity-70" title="Този потребител е деактивиран.">
                      {r.salesperson}
                    </span>
                  ) : (
                    r.salesperson
                  )}
                </TD>
              )}
              {visible.building && (
                <TD muted>{r.building ?? <span className="text-neutral-400">—</span>}</TD>
              )}
              {visible.contractType && (
                <TD>
                  <StatusBadge tone={CONTRACT_TYPE_TONES[r.contractType as ContractType] ?? "neutral"}>
                    {CONTRACT_TYPE_LABELS[r.contractType as ContractType] ?? r.contractType}
                  </StatusBadge>
                </TD>
              )}
              {visible.composition && (
                <TD muted>
                  {r.compositionStatus ?? <span className="text-neutral-400">—</span>}
                </TD>
              )}
              {visible.preOrPost && (
                <TD muted>{r.preOrPost ?? <span className="text-neutral-400">—</span>}</TD>
              )}
              {visible.totalDue && (
                <TD numeric className="font-medium">{fmtMoney(r.totalDueEur)}</TD>
              )}
              {visible.totalPaid && (
                <TD numeric muted>{fmtMoney(r.totalPaidEur)}</TD>
              )}
              {visible.totalRemaining && (
                <TD
                  numeric
                  className={
                    Number(r.totalRemainingEur) > 0.01
                      ? "text-warning-800"
                      : "text-success-700"
                  }
                >
                  {fmtMoney(r.totalRemainingEur)}
                </TD>
              )}
              {visible.usesCredit && (
                <TD>
                  <InlineBooleanCell
                    value={r.usesCredit}
                    onSave={(v) => setContractUsesCredit(r.id, v)}
                    disabled={!canEditStatus}
                  />
                </TD>
              )}
              {visible.status && (
                <TD>
                  <InlineStatusCell
                    value={r.status as ContractStatus}
                    options={CONTRACT_STATUS_OPTIONS}
                    onSave={(next) => setContractStatus(r.id, next)}
                    disabled={!canEditStatus}
                  />
                </TD>
              )}
              {visible.signedAt && (
                <TD muted numeric className="text-sm">
                  {r.signedAtFormatted ?? <span className="text-neutral-400">—</span>}
                </TD>
              )}
              {visible.reminderDate && (
                <TD muted numeric className="text-sm">
                  {r.reminderDateFormatted ?? <span className="text-neutral-400">—</span>}
                </TD>
              )}
              {visible.propertyCount && (
                <TD muted numeric>{r.propertyCount}</TD>
              )}
              {canDelete && (
                <TD align="right">
                  <DeleteRowButton
                    label={`договор „${r.title}"`}
                    onDelete={() => deleteContract(r.id)}
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
