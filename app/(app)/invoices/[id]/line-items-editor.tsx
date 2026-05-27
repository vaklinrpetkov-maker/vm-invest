"use client";

// Inline-editable line items table for the invoice detail page.
//
// Mirrors the inline-cell shape used everywhere else in the codebase. Every
// cell wraps an existing primitive (`InlineTextCell`, `InlineNumberCell`)
// with the `disabled` prop tied to the permission gate. Editing is allowed
// when `canEdit` is true (pending+manager OR admin); when false, cells
// render their value in read-only mode.
//
// Adding a row creates an empty placeholder ("Нова позиция", quantity 1,
// price 0, VAT 20%) that the user fills in. Removing a row is one-click —
// no two-step confirm because rows are easy to re-add and the audit log
// captures every deletion.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { InlineNumberCell } from "@/components/ui/inline-number-cell";
import { InlineTextCell } from "@/components/ui/inline-text-cell";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  addLineItem,
  deleteLineItem,
  setLineItemDescription,
  setLineItemLineTotal,
  setLineItemQuantity,
  setLineItemUnit,
  setLineItemUnitPrice,
  setLineItemVatRate,
} from "./line-item-actions";

export type LineItemRow = {
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
  invoiceId: string;
  lineItems: LineItemRow[];
  canEdit: boolean;
};

export function LineItemsEditor({ invoiceId, lineItems, canEdit }: Props) {
  const router = useRouter();
  const { error: toastError, success } = useToast();
  const [pending, startTransition] = useTransition();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function handleAdd() {
    startTransition(async () => {
      const res = await addLineItem(invoiceId);
      if (!res.ok) {
        toastError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDelete(lineItemId: string) {
    startTransition(async () => {
      const res = await deleteLineItem(lineItemId);
      if (!res.ok) {
        toastError(res.error);
        return;
      }
      success("Позицията е премахната.");
      setConfirmDeleteId(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
          Позиции ({lineItems.length})
        </h2>
        {canEdit && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleAdd}
            disabled={pending}
          >
            + Добави ред
          </Button>
        )}
      </div>

      {lineItems.length === 0 ? (
        <p className="text-sm text-neutral-500 italic">
          Тази фактура няма позиции.
          {canEdit && " Добави с бутона горе."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-500 border-b border-neutral-150">
                <th className="py-1.5 pr-2 font-medium w-1/3">Описание</th>
                <th className="py-1.5 px-2 font-medium text-right">Кол.</th>
                <th className="py-1.5 px-2 font-medium">Мярка</th>
                <th className="py-1.5 px-2 font-medium text-right">Ед. цена</th>
                <th className="py-1.5 px-2 font-medium text-right">Сума</th>
                <th className="py-1.5 px-2 font-medium text-right">ДДС %</th>
                {canEdit && <th className="py-1.5 pl-2 w-8"></th>}
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li) => {
                const isConfirming = confirmDeleteId === li.id;
                return (
                  <tr
                    key={li.id}
                    className={cn(
                      "border-b border-neutral-100",
                      li.priceAnomalyPct !== null && "bg-warning-50/40",
                    )}
                  >
                    <td className="py-1.5 pr-2">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1">
                          <InlineTextCell
                            value={li.description}
                            onSave={(next) => setLineItemDescription(li.id, next)}
                            disabled={!canEdit}
                          />
                        </div>
                        {li.priceAnomalyPct !== null && (
                          <span
                            className="text-warning-700 shrink-0"
                            title={`Цената е +${li.priceAnomalyPct.toFixed(1)}% над предишната за този доставчик/продукт за последния месец.`}
                          >
                            ⚠
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      <InlineNumberCell
                        value={li.quantity}
                        onSave={(next) => setLineItemQuantity(li.id, next)}
                        disabled={!canEdit}
                        format="decimal"
                        min={0}
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <InlineTextCell
                        value={li.unit}
                        onSave={(next) => setLineItemUnit(li.id, next)}
                        disabled={!canEdit}
                        maxLength={16}
                      />
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      <InlineNumberCell
                        value={li.unitPrice}
                        onSave={(next) => setLineItemUnitPrice(li.id, next)}
                        disabled={!canEdit}
                        format="currency-eur"
                        min={0}
                      />
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      <InlineNumberCell
                        value={li.lineTotal}
                        onSave={(next) => setLineItemLineTotal(li.id, next)}
                        disabled={!canEdit}
                        format="currency-eur"
                        min={0}
                      />
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      <InlineNumberCell
                        value={li.vatRate}
                        onSave={(next) => setLineItemVatRate(li.id, next)}
                        disabled={!canEdit}
                        format="decimal"
                        min={0}
                        max={100}
                        suffix="%"
                      />
                    </td>
                    {canEdit && (
                      <td className="py-1.5 pl-2 text-right">
                        {isConfirming ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-xs text-neutral-500 hover:text-neutral-900 transition-colors duration-120"
                              disabled={pending}
                            >
                              Отказ
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(li.id)}
                              className="text-xs text-danger-700 hover:underline transition-colors duration-120"
                              disabled={pending}
                            >
                              {pending ? "…" : "Изтрий"}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(li.id)}
                            className="text-neutral-400 hover:text-danger-700 transition-colors duration-120"
                            aria-label={`Премахни ред ${li.rowNumber}`}
                            disabled={pending}
                          >
                            ×
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!canEdit && (
        <p className="text-xs text-neutral-500">
          Фактурата е платена — редактирането на позиции е достъпно само за администратор.
        </p>
      )}
    </div>
  );
}
