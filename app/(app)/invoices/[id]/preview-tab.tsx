"use client";

// Преглед tab — split-screen layout. PDF iframe on the left, parsed-data
// editor on the right.
//
// Per specs/invoices.md §8: header fields are inline-editable while the
// invoice is `pending` (any manager) or always (admin). Once `paid`,
// managers see read-only fields with a 🔒 lock indicator and admins keep
// editing. The `canEditFields` prop carries the decision from the server.
//
// Line items render as a read-only table in Round 3. Inline-editing the
// line items is on the roadmap; for now corrections to the line items
// require deleting + re-uploading while pending (which is rare since the
// preview modal at upload time is the primary edit surface).

import { InlineDateCell } from "@/components/ui/inline-date-cell";
import { InlineMultilineCell } from "@/components/ui/inline-multiline-cell";
import { InlineNumberCell } from "@/components/ui/inline-number-cell";
import { InlineTextCell } from "@/components/ui/inline-text-cell";
import { ReadOnlyBadge } from "@/components/ui/read-only-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import type { InvoiceStatus } from "@prisma/client";
import { formatDateTime } from "@/lib/format";
import { LineItemsEditor } from "./line-items-editor";
import {
  setDueDate,
  setInvoiceDate,
  setInvoiceNotes,
  setInvoiceNumber,
  setSubtotal,
  setTotal,
  setVatAmount,
  setVendorName,
  setVendorVatNumber,
} from "./field-actions";

type InvoiceProps = {
  id: string;
  vendorName: string;
  vendorVatNumber: string | null;
  invoiceNumber: string;
  invoiceDateIso: string;
  dueDateIso: string | null;
  subtotal: number;
  vatAmount: number;
  total: number;
  notes: string;
  parseConfidence: number | null;
  parseReviewNeeded: boolean;
  paidAt: string | null;
  paidByName: string | null;
  status: InvoiceStatus;
};

type LineItemProps = {
  id: string;
  rowNumber: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  vatRate: number;
  priceAnomalyPct: number | null;
};

type Props = {
  invoice: InvoiceProps;
  lineItems: LineItemProps[];
  pdfSignedUrl: string | null;
  canEditFields: boolean;
};

export function PreviewTab({ invoice, lineItems, pdfSignedUrl, canEditFields }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* PDF side */}
      <div className="bg-neutral-0 rounded-lg overflow-hidden border border-neutral-150 min-h-[600px] flex">
        {pdfSignedUrl ? (
          <iframe
            src={pdfSignedUrl}
            title={`PDF за фактура ${invoice.invoiceNumber}`}
            className="w-full h-full min-h-[600px]"
          />
        ) : (
          <div className="m-auto text-center text-sm text-neutral-500 p-6">
            PDF-ът не може да бъде показан. Опитай{" "}
            <a
              href={`/api/files/sign`}
              className="underline hover:text-neutral-700"
            >
              да го свалиш
            </a>{" "}
            или обнови страницата.
          </div>
        )}
      </div>

      {/* Data side */}
      <div className="space-y-4">
        {/* Confidence banner — visible only when the parser was uncertain. */}
        {invoice.parseReviewNeeded && (
          <div className="bg-warning-50 text-warning-800 text-sm rounded-lg px-3 py-2">
            Автоматичното разпознаване беше с ниска увереност (
            {invoice.parseConfidence ?? "—"}%). Провери внимателно срещу PDF-а.
          </div>
        )}

        <section className="bg-neutral-0 rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
            Основни данни
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <Field label="Доставчик">
              <InlineTextCell
                value={invoice.vendorName}
                onSave={(next) => setVendorName(invoice.id, next)}
                disabled={!canEditFields}
                placeholder="—"
              />
            </Field>
            <Field label="ДДС / ЕИК">
              <InlineTextCell
                value={invoice.vendorVatNumber}
                onSave={(next) => setVendorVatNumber(invoice.id, next)}
                disabled={!canEditFields}
                emptyLabel="—"
              />
            </Field>
            <Field label="Номер на фактура">
              <InlineTextCell
                value={invoice.invoiceNumber}
                onSave={(next) => setInvoiceNumber(invoice.id, next)}
                disabled={!canEditFields}
              />
            </Field>
            <Field label="Дата на фактурата">
              <InlineDateCell
                value={invoice.invoiceDateIso}
                onSave={(next) => setInvoiceDate(invoice.id, next)}
                disabled={!canEditFields}
              />
            </Field>
            <Field label="Срок на плащане">
              <InlineDateCell
                value={invoice.dueDateIso}
                onSave={(next) => setDueDate(invoice.id, next)}
                disabled={!canEditFields}
                emptyLabel="—"
              />
            </Field>
            <Field label="Качена">
              <ReadOnlyBadge reason="Системно поле, попълва се автоматично." />
            </Field>
          </div>
        </section>

        <section className="bg-neutral-0 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
              Суми (EUR)
            </h2>
            {invoice.status === "paid" && (
              <StatusBadge tone="success">Платена</StatusBadge>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Основа">
              <InlineNumberCell
                value={invoice.subtotal}
                onSave={(next) => setSubtotal(invoice.id, next === null ? null : String(next))}
                disabled={!canEditFields}
                format="currency-eur"
                min={0}
              />
            </Field>
            <Field label="ДДС">
              <InlineNumberCell
                value={invoice.vatAmount}
                onSave={(next) => setVatAmount(invoice.id, next === null ? null : String(next))}
                disabled={!canEditFields}
                format="currency-eur"
                min={0}
              />
            </Field>
            <Field label="Общо">
              <InlineNumberCell
                value={invoice.total}
                onSave={(next) => setTotal(invoice.id, next === null ? null : String(next))}
                disabled={!canEditFields}
                format="currency-eur"
                min={0}
              />
            </Field>
          </div>
          {invoice.paidAt && invoice.paidByName && (
            <p className="text-sm text-neutral-500 pt-1">
              Платена на {formatDateTime(invoice.paidAt)} от {invoice.paidByName}.
            </p>
          )}
        </section>

        <section className="bg-neutral-0 rounded-lg p-4 space-y-3">
          <LineItemsEditor
            invoiceId={invoice.id}
            lineItems={lineItems}
            canEdit={canEditFields}
          />
        </section>

        <section className="bg-neutral-0 rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
            Бележки
          </h2>
          <InlineMultilineCell
            value={invoice.notes.length > 0 ? invoice.notes : null}
            onSave={(next) => setInvoiceNotes(invoice.id, next)}
            disabled={!canEditFields}
            emptyLabel="Добави бележка…"
          />
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-neutral-500">{label}</span>
      {children}
    </div>
  );
}

