"use client";

// Upload modal for /invoices. Three-phase flow:
//
//   pick → parsing → preview → (saved | discarded)
//
// "pick" shows a file picker. On selection we POST to parseAndStageInvoice,
// which uploads the PDF to Storage and runs Claude over it. We then transition
// to "preview" with all extracted fields editable inline. The user reviews,
// edits whatever the parser got wrong, and clicks Запази → confirmInvoice
// writes the rows.
//
// Closing the modal (Esc / outside-click / ✕) before saving calls
// discardStagedInvoice so the Storage object doesn't litter.
//
// Mounted via createPortal so the layered z-index works regardless of where
// the trigger sits in the page tree.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatEUR } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { ParsedInvoice, ParsedInvoiceLineItem } from "@/lib/invoices/parser";
import {
  confirmInvoice,
  discardStagedInvoice,
  parseAndStageInvoice,
  type ConfirmInvoiceInput,
} from "./upload-actions";

type Phase =
  | { kind: "pick" }
  | { kind: "parsing"; fileName: string }
  | {
      kind: "preview";
      sectionId: string;
      storagePath: string;
      fileName: string;
      fileSize: number;
      parseConfidence: number;
      duplicateOf: {
        id: string;
        vendorName: string;
        invoiceNumber: string;
        invoiceDateIso: string;
        uploaderName: string;
      } | null;
      // Editable working copy. The original parsed data is held in
      // `_originalParsed` for diffing/reset if we ever need it (unused today,
      // tiny prop — keep for future).
      header: HeaderState;
      lineItems: LineItemState[];
    };

type HeaderState = {
  vendorName: string;
  vendorVatNumber: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  subtotal: string;
  vatAmount: string;
  total: string;
  notes: string;
};

type LineItemState = {
  // Stable client-side id so React keys stay sticky across edits/reorder.
  key: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  lineTotal: string;
  vatRate: string;
};

type Props = {
  open: boolean;
  sectionId: string;
  sectionLabel: string;
  onClose: () => void;
};

export function UploadInvoiceModal({ open, sectionId, sectionLabel, onClose }: Props) {
  const router = useRouter();
  const { success } = useToast();
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });
  const [busy, startTransition] = useTransition();
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state every time the modal opens fresh.
  useEffect(() => {
    if (open) {
      setPhase({ kind: "pick" });
      setErrorBanner(null);
    }
  }, [open]);

  // Escape closes, with discard if a staged file exists.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy, phase]);

  function requestClose() {
    if (phase.kind === "preview") {
      // Discard the staged Storage object in the background — best effort.
      void discardStagedInvoice(phase.storagePath);
    }
    onClose();
  }

  function handleFileChosen(file: File) {
    setErrorBanner(null);
    setPhase({ kind: "parsing", fileName: file.name });

    const formData = new FormData();
    formData.append("sectionId", sectionId);
    formData.append("file", file);

    startTransition(async () => {
      const res = await parseAndStageInvoice(formData);
      if (!res.ok) {
        setErrorBanner(res.error);
        setPhase({ kind: "pick" });
        return;
      }
      setPhase({
        kind: "preview",
        sectionId,
        storagePath: res.storagePath,
        fileName: res.fileName,
        fileSize: res.fileSize,
        parseConfidence: res.parsed.confidence,
        duplicateOf: res.duplicateOf,
        header: headerFromParsed(res.parsed),
        lineItems: res.parsed.lineItems.map(lineItemFromParsed),
      });
    });
  }

  function updateHeader(patch: Partial<HeaderState>) {
    setPhase((p) => (p.kind === "preview" ? { ...p, header: { ...p.header, ...patch } } : p));
  }

  function updateLineItem(key: string, patch: Partial<LineItemState>) {
    setPhase((p) =>
      p.kind === "preview"
        ? {
            ...p,
            lineItems: p.lineItems.map((li) => (li.key === key ? { ...li, ...patch } : li)),
          }
        : p,
    );
  }

  function addLineItem() {
    setPhase((p) =>
      p.kind === "preview"
        ? {
            ...p,
            lineItems: [
              ...p.lineItems,
              {
                key: `new-${Date.now()}-${Math.random()}`,
                description: "",
                quantity: "1",
                unit: "бр.",
                unitPrice: "0",
                lineTotal: "0",
                vatRate: "20",
              },
            ],
          }
        : p,
    );
  }

  function removeLineItem(key: string) {
    setPhase((p) =>
      p.kind === "preview"
        ? { ...p, lineItems: p.lineItems.filter((li) => li.key !== key) }
        : p,
    );
  }

  function handleSave() {
    if (phase.kind !== "preview") return;
    setErrorBanner(null);

    const validation = validateForSave(phase.header, phase.lineItems);
    if (!validation.ok) {
      setErrorBanner(validation.error);
      return;
    }

    const payload: ConfirmInvoiceInput = {
      sectionId: phase.sectionId,
      storagePath: phase.storagePath,
      fileName: phase.fileName,
      fileSize: phase.fileSize,
      parseConfidence: phase.parseConfidence,
      vendorName: phase.header.vendorName,
      vendorVatNumber: phase.header.vendorVatNumber.trim() || null,
      invoiceNumber: phase.header.invoiceNumber,
      invoiceDate: phase.header.invoiceDate,
      dueDate: phase.header.dueDate || null,
      subtotal: Number.parseFloat(phase.header.subtotal),
      vatAmount: Number.parseFloat(phase.header.vatAmount),
      total: Number.parseFloat(phase.header.total),
      notes: phase.header.notes,
      lineItems: phase.lineItems.map((li) => ({
        description: li.description,
        quantity: Number.parseFloat(li.quantity) || 0,
        unit: li.unit,
        unitPrice: Number.parseFloat(li.unitPrice) || 0,
        lineTotal: Number.parseFloat(li.lineTotal) || 0,
        vatRate: Number.parseFloat(li.vatRate) || 0,
      })),
    };

    startTransition(async () => {
      const res = await confirmInvoice(payload);
      if (!res.ok) {
        setErrorBanner(res.error);
        return;
      }
      success("Фактурата е запазена.");
      onClose();
      router.refresh();
    });
  }

  if (!open) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
      className="fixed inset-0 z-modal flex items-start justify-center pt-12 px-4 bg-neutral-900/40"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) requestClose();
      }}
    >
      <div className="bg-neutral-0 rounded-xl shadow-popover w-full max-w-4xl max-h-[calc(100vh-6rem)] flex flex-col">
        <header className="px-6 py-4 border-b border-neutral-150 flex items-center justify-between">
          <div>
            <h2 id="upload-modal-title" className="text-md font-medium text-neutral-900">
              Качи фактура — {sectionLabel}
            </h2>
            {phase.kind === "preview" && (
              <p className="text-sm text-neutral-500 mt-0.5">
                Прегледай разпознатите данни, коригирай при нужда и натисни Запази.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={busy}
            className="text-neutral-500 hover:text-neutral-900 transition-colors duration-120 disabled:opacity-50"
            aria-label="Затвори"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {errorBanner && (
            <div className="bg-danger-50 text-danger-700 text-sm rounded-lg px-3 py-2">
              {errorBanner}
            </div>
          )}

          {phase.kind === "pick" && (
            <PickPhase fileInputRef={fileInputRef} onFile={handleFileChosen} />
          )}

          {phase.kind === "parsing" && <ParsingPhase fileName={phase.fileName} />}

          {phase.kind === "preview" && (
            <PreviewPhase
              phase={phase}
              onHeaderChange={updateHeader}
              onLineItemChange={updateLineItem}
              onAddLineItem={addLineItem}
              onRemoveLineItem={removeLineItem}
            />
          )}
        </div>

        <footer className="px-6 py-3 border-t border-neutral-150 flex items-center justify-end gap-2">
          {phase.kind === "preview" && (
            <>
              <Button type="button" variant="ghost" onClick={requestClose} disabled={busy}>
                Отказ
              </Button>
              <Button type="button" onClick={handleSave} disabled={busy}>
                {busy ? "Запазване…" : "Запази"}
              </Button>
            </>
          )}
          {phase.kind !== "preview" && (
            <Button type="button" variant="ghost" onClick={requestClose} disabled={busy}>
              Затвори
            </Button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

// ─── Phase 1: file picker ─────────────────────────────────────────────────

function PickPhase({
  fileInputRef,
  onFile,
}: {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (f: File) => void;
}) {
  return (
    <div className="py-8 flex flex-col items-center gap-4">
      <p className="text-base text-neutral-700 text-center">
        Изберете PDF файл с фактурата (макс. 10 MB).
        <br />
        <span className="text-sm text-neutral-500">
          Системата автоматично разпознава доставчик, номер, суми и позиции.
        </span>
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="block text-sm text-neutral-700 file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-neutral-100 file:text-sm file:font-medium hover:file:bg-neutral-150 file:cursor-pointer"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </div>
  );
}

// ─── Phase 2: parsing spinner ─────────────────────────────────────────────

function ParsingPhase({ fileName }: { fileName: string }) {
  return (
    <div className="py-12 flex flex-col items-center gap-3 text-center">
      <div className="w-8 h-8 rounded-full border-2 border-neutral-200 border-t-accent-500 animate-spin" />
      <div>
        <p className="text-base text-neutral-900">Обработваме фактурата…</p>
        <p className="text-sm text-neutral-500 mt-0.5">
          {fileName} • 5–15 секунди
        </p>
      </div>
    </div>
  );
}

// ─── Phase 3: preview + edit ──────────────────────────────────────────────

function PreviewPhase({
  phase,
  onHeaderChange,
  onLineItemChange,
  onAddLineItem,
  onRemoveLineItem,
}: {
  phase: Extract<Phase, { kind: "preview" }>;
  onHeaderChange: (patch: Partial<HeaderState>) => void;
  onLineItemChange: (key: string, patch: Partial<LineItemState>) => void;
  onAddLineItem: () => void;
  onRemoveLineItem: (key: string) => void;
}) {
  const subtotalN = Number.parseFloat(phase.header.subtotal) || 0;
  const vatN = Number.parseFloat(phase.header.vatAmount) || 0;
  const totalN = Number.parseFloat(phase.header.total) || 0;
  const expectedTotal = Math.round((subtotalN + vatN) * 100) / 100;
  const totalMismatch = Math.abs(totalN - expectedTotal) > 0.02;

  return (
    <div className="space-y-4">
      {/* Banners — parse-confidence warning and/or duplicate hint. */}
      {phase.parseConfidence < 80 && (
        <div className="bg-warning-50 text-warning-800 text-sm rounded-lg px-3 py-2">
          Автоматичното разпознаване е с ниска увереност ({phase.parseConfidence}%). Провери внимателно.
        </div>
      )}
      {phase.duplicateOf && (
        <div className="bg-warning-50 text-warning-800 text-sm rounded-lg px-3 py-2">
          Възможно дублиране: фактура{" "}
          <strong>{phase.duplicateOf.invoiceNumber}</strong> от{" "}
          <strong>{phase.duplicateOf.vendorName}</strong> на{" "}
          <strong>{phase.duplicateOf.invoiceDateIso}</strong>, качена от{" "}
          {phase.duplicateOf.uploaderName}, вече съществува. Прегледай преди да продължиш.
        </div>
      )}

      {/* Header fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Доставчик *">
          <Input
            value={phase.header.vendorName}
            onChange={(e) => onHeaderChange({ vendorName: e.target.value })}
            placeholder="напр. Уницем ЕООД"
          />
        </Field>
        <Field label="ДДС / ЕИК">
          <Input
            value={phase.header.vendorVatNumber}
            onChange={(e) => onHeaderChange({ vendorVatNumber: e.target.value })}
            placeholder="BG123456789"
          />
        </Field>
        <Field label="Номер на фактура *">
          <Input
            value={phase.header.invoiceNumber}
            onChange={(e) => onHeaderChange({ invoiceNumber: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Дата *">
            <Input
              type="date"
              value={phase.header.invoiceDate}
              onChange={(e) => onHeaderChange({ invoiceDate: e.target.value })}
            />
          </Field>
          <Field label="Срок на плащане">
            <Input
              type="date"
              value={phase.header.dueDate}
              onChange={(e) => onHeaderChange({ dueDate: e.target.value })}
            />
          </Field>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Основа (€)">
          <Input
            type="number"
            step="0.01"
            value={phase.header.subtotal}
            onChange={(e) => onHeaderChange({ subtotal: e.target.value })}
            className="text-right tabular-nums"
          />
        </Field>
        <Field label="ДДС (€)">
          <Input
            type="number"
            step="0.01"
            value={phase.header.vatAmount}
            onChange={(e) => onHeaderChange({ vatAmount: e.target.value })}
            className="text-right tabular-nums"
          />
        </Field>
        <Field label="Общо (€)">
          <Input
            type="number"
            step="0.01"
            value={phase.header.total}
            onChange={(e) => onHeaderChange({ total: e.target.value })}
            className={cn(
              "text-right tabular-nums",
              totalMismatch && "ring-2 ring-danger-500",
            )}
          />
          {totalMismatch && (
            <p className="text-xs text-danger-700 mt-1">
              Сборът основа + ДДС е {formatEUR(expectedTotal)}.
            </p>
          )}
        </Field>
      </div>

      {/* Line items */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
            Позиции ({phase.lineItems.length})
          </h3>
          <Button type="button" variant="ghost" size="sm" onClick={onAddLineItem}>
            + Добави ред
          </Button>
        </div>
        {phase.lineItems.length === 0 ? (
          <div className="text-sm text-neutral-500 italic px-3 py-2 bg-neutral-50 rounded-lg">
            Няма позиции. Добавете ред, ако фактурата съдържа продукти/услуги.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500 border-b border-neutral-150">
                  <th className="py-1.5 pr-2 font-medium">Описание</th>
                  <th className="py-1.5 px-2 font-medium text-right">Кол.</th>
                  <th className="py-1.5 px-2 font-medium">Мярка</th>
                  <th className="py-1.5 px-2 font-medium text-right">Ед. цена (€)</th>
                  <th className="py-1.5 px-2 font-medium text-right">Сума (€)</th>
                  <th className="py-1.5 px-2 font-medium text-right">ДДС %</th>
                  <th className="py-1.5 pl-2"></th>
                </tr>
              </thead>
              <tbody>
                {phase.lineItems.map((li) => (
                  <tr key={li.key} className="border-b border-neutral-100">
                    <td className="py-1.5 pr-2">
                      <Input
                        value={li.description}
                        onChange={(e) =>
                          onLineItemChange(li.key, { description: e.target.value })
                        }
                        className="text-sm"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <Input
                        type="number"
                        step="0.001"
                        value={li.quantity}
                        onChange={(e) =>
                          onLineItemChange(li.key, { quantity: e.target.value })
                        }
                        className="w-20 text-right text-sm tabular-nums"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <Input
                        value={li.unit}
                        onChange={(e) =>
                          onLineItemChange(li.key, { unit: e.target.value })
                        }
                        className="w-16 text-sm"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <Input
                        type="number"
                        step="0.0001"
                        value={li.unitPrice}
                        onChange={(e) =>
                          onLineItemChange(li.key, { unitPrice: e.target.value })
                        }
                        className="w-24 text-right text-sm tabular-nums"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={li.lineTotal}
                        onChange={(e) =>
                          onLineItemChange(li.key, { lineTotal: e.target.value })
                        }
                        className="w-24 text-right text-sm tabular-nums"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={li.vatRate}
                        onChange={(e) =>
                          onLineItemChange(li.key, { vatRate: e.target.value })
                        }
                        className="w-16 text-right text-sm tabular-nums"
                      />
                    </td>
                    <td className="py-1.5 pl-2 text-right">
                      <button
                        type="button"
                        onClick={() => onRemoveLineItem(li.key)}
                        className="text-neutral-400 hover:text-danger-700 transition-colors duration-120"
                        aria-label="Премахни ред"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Field label="Бележки">
        <textarea
          rows={2}
          value={phase.header.notes}
          onChange={(e) => onHeaderChange({ notes: e.target.value })}
          placeholder="Незадължително"
          className="block w-full px-3 py-2 rounded-lg bg-neutral-100 text-base text-neutral-900 placeholder:text-neutral-400 tracking-tight hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120 resize-y"
        />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-neutral-700">{label}</label>
      {children}
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────

function headerFromParsed(p: ParsedInvoice): HeaderState {
  return {
    vendorName: p.vendorName,
    vendorVatNumber: p.vendorVatNumber ?? "",
    invoiceNumber: p.invoiceNumber,
    invoiceDate: p.invoiceDate,
    dueDate: p.dueDate ?? "",
    subtotal: p.subtotal.toFixed(2),
    vatAmount: p.vatAmount.toFixed(2),
    total: p.total.toFixed(2),
    notes: "",
  };
}

function lineItemFromParsed(li: ParsedInvoiceLineItem, idx: number): LineItemState {
  return {
    key: `parsed-${idx}`,
    description: li.description,
    quantity: String(li.quantity),
    unit: li.unit,
    unitPrice: li.unitPrice.toFixed(4),
    lineTotal: li.lineTotal.toFixed(2),
    vatRate: li.vatRate.toFixed(2),
  };
}

// Client-side gate before we hit the server. Server repeats the checks
// defensively; this just gives the user faster feedback.
function validateForSave(
  header: HeaderState,
  lineItems: LineItemState[],
): { ok: true } | { ok: false; error: string } {
  if (header.vendorName.trim().length === 0) {
    return { ok: false, error: "Доставчикът е задължителен." };
  }
  if (header.invoiceNumber.trim().length === 0) {
    return { ok: false, error: "Номерът на фактурата е задължителен." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(header.invoiceDate)) {
    return { ok: false, error: "Невалидна дата на фактура." };
  }
  if (header.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(header.dueDate)) {
    return { ok: false, error: "Невалиден срок на плащане." };
  }
  if (header.dueDate && header.dueDate < header.invoiceDate) {
    return { ok: false, error: "Срокът не може да е преди датата на фактурата." };
  }
  const sub = Number.parseFloat(header.subtotal);
  const vat = Number.parseFloat(header.vatAmount);
  const total = Number.parseFloat(header.total);
  if (![sub, vat, total].every((n) => Number.isFinite(n) && n >= 0)) {
    return { ok: false, error: "Сумите трябва да са неотрицателни числа." };
  }
  if (Math.abs(total - (sub + vat)) > 0.02) {
    return {
      ok: false,
      error: "Общата сума не съвпада със сборa основа + ДДС.",
    };
  }
  for (const li of lineItems) {
    if (li.description.trim().length === 0) {
      return { ok: false, error: "Всеки ред трябва да има описание." };
    }
  }
  return { ok: true };
}
