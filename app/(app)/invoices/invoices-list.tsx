"use client";

import Link from "next/link";
import type { Route } from "next";
import type { InvoiceStatus } from "@prisma/client";
import { FileCell } from "@/components/ui/file-cell";
import { InlineStatusCell, type StatusOption } from "@/components/ui/inline-status-cell";
import { StatusBadge } from "@/components/ui/status-badge";
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
import type { AttachedFile } from "@/lib/files/types";
import { DeleteRowButton } from "@/components/ui/delete-row-button";
import { deleteInvoice, setInvoiceStatus } from "./actions";

export type InvoiceRow = {
  id: string;
  sectionLabelBg: string;
  vendorName: string;
  invoiceNumber: string;
  invoiceDateFormatted: string;
  dueDateFormatted: string | null;
  totalFormatted: string;
  status: InvoiceStatus;
  uploaderId: string;
  uploaderName: string;
  uploaderActive: boolean;
  anomalyCount: number; // number of line items flagged
  // Carried as an AttachedFile so the file column drops into <FileCell />
  // without additional plumbing. Per spec §6.2 the file is treated as a
  // single-element array even though invoices always have exactly one PDF —
  // the cross-module FileCell expects an array.
  file: AttachedFile;
};

const STATUS_OPTIONS: ReadonlyArray<StatusOption<InvoiceStatus>> = [
  { value: "pending", label: "Чакаща", tone: "info" },
  { value: "paid", label: "Платена", tone: "success" },
];

// `editableStatus` controls whether the row's status cell offers the popover
// or renders as a read-only badge. Per specs/invoices.md §11:
//   - admin: always editable
//   - manager: always editable (status flips are deliberately not gated by
//              the field-permissions rule that locks `paid` invoices —
//              flipping back to pending is the recovery path)
//   - user:   never (they can't even see this page; defensive)
type Props = {
  rows: InvoiceRow[];
  canEditStatus: boolean;
  canDelete: boolean;
};

export function InvoicesList({ rows, canEditStatus, canDelete }: Props) {
  return (
    <Table>
      <THead>
        <TR hover={false}>
          <TH>Секция</TH>
          <TH>Доставчик</TH>
          <TH>Номер</TH>
          <TH>Дата</TH>
          <TH>Срок</TH>
          <TH align="right">Сума</TH>
          <TH>Статус</TH>
          <TH>Качена от</TH>
          <TH>Файл</TH>
          {canDelete && <TH align="right" className="w-10" />}
        </TR>
      </THead>
      <TBody>
        {rows.length === 0 && (
          <TableEmpty colSpan={canDelete ? 10 : 9}>
            Все още няма качени фактури. Използвайте бутоните по-горе, за да
            качите първата.
          </TableEmpty>
        )}
        {rows.map((r) => (
          <TR key={r.id}>
            <TD>
              <StatusBadge tone="neutral">{r.sectionLabelBg}</StatusBadge>
            </TD>
            <TD>
              <Link
                href={`/invoices/${r.id}` as Route}
                className={cn(
                  "text-neutral-900 hover:underline",
                  r.anomalyCount > 0 && "font-medium",
                )}
              >
                {r.vendorName}
              </Link>
              {r.anomalyCount > 0 && (
                <span
                  className="ml-1.5 text-warning-700"
                  title={`${r.anomalyCount} ${r.anomalyCount === 1 ? "позиция" : "позиции"} с цена >5% над предишната за този доставчик за последния месец.`}
                  aria-label="Ценови сигнал"
                >
                  ⚠
                </span>
              )}
            </TD>
            <TD muted>{r.invoiceNumber}</TD>
            <TD numeric muted>
              {r.invoiceDateFormatted}
            </TD>
            <TD numeric muted>
              {r.dueDateFormatted ?? "—"}
            </TD>
            <TD numeric>{r.totalFormatted}</TD>
            <TD>
              {canEditStatus ? (
                <InlineStatusCell<InvoiceStatus>
                  value={r.status}
                  options={STATUS_OPTIONS}
                  onSave={async (next) => setInvoiceStatus(r.id, next)}
                />
              ) : (
                <StatusBadge
                  tone={r.status === "paid" ? "success" : "info"}
                >
                  {r.status === "paid" ? "Платена" : "Чакаща"}
                </StatusBadge>
              )}
            </TD>
            <TD
              muted
              className={!r.uploaderActive ? "italic opacity-70" : undefined}
            >
              {r.uploaderName}
            </TD>
            <TD>
              <FileCell module="invoices" files={[r.file]} />
            </TD>
            {canDelete && (
              <TD align="right">
                <DeleteRowButton
                  label={`фактура „${r.vendorName} № ${r.invoiceNumber}"`}
                  onDelete={() => deleteInvoice(r.id)}
                />
              </TD>
            )}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
