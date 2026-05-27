"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { InvoiceStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { deleteInvoice, setInvoiceStatus } from "../actions";

// Top-right action cluster for the invoice detail page. Three buttons:
//
//   - Status toggle  → flips pending ↔ paid via the existing setInvoiceStatus
//                      action. Same permissions as the inline cell in the list.
//   - Download PDF   → fetches a fresh signed URL with intent=download (which
//                      asks Supabase for a Content-Disposition: attachment
//                      response). One-click flow; no separate "view" path
//                      here because the iframe in PreviewTab already shows
//                      the PDF inline.
//   - Delete         → two-step destructive confirm. Visible only when
//                      `canDelete` is true (uploader-while-pending OR admin).

type Props = {
  invoiceId: string;
  status: InvoiceStatus;
  canEditStatus: boolean;
  canDelete: boolean;
};

export function HeaderActions({ invoiceId, status, canEditStatus, canDelete }: Props) {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [downloading, setDownloading] = useState(false);

  function flipStatus() {
    const next: InvoiceStatus = status === "pending" ? "paid" : "pending";
    startTransition(async () => {
      const res = await setInvoiceStatus(invoiceId, next);
      if (!res.ok) {
        toastError(res.error);
        return;
      }
      success(next === "paid" ? "Маркирана като платена." : "Върната на чакаща.");
      router.refresh();
    });
  }

  async function downloadPdf() {
    setDownloading(true);
    try {
      const res = await fetch("/api/files/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module: "invoices",
          attachmentId: invoiceId,
          intent: "download",
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toastError(body.error ?? "Грешка при сваляне.");
        return;
      }
      const data = (await res.json()) as { url: string };
      // Open in a new tab. Supabase responds with Content-Disposition:
      // attachment so the browser triggers a download rather than a navigate.
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toastError((err as Error).message ?? "Грешка при сваляне.");
    } finally {
      setDownloading(false);
    }
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteInvoice(invoiceId);
      if (!res.ok) {
        toastError(res.error);
        return;
      }
      success("Фактурата е изтрита.");
      router.push("/invoices");
    });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button type="button" variant="ghost" onClick={downloadPdf} disabled={downloading}>
        {downloading ? "Сваляне…" : "Изтегли PDF"}
      </Button>
      {canEditStatus && (
        <Button type="button" onClick={flipStatus} disabled={pending}>
          {status === "pending" ? "Маркирай като платена" : "Върни на чакаща"}
        </Button>
      )}
      {canDelete && (
        confirmDelete ? (
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmDelete(false)}
              disabled={pending}
            >
              Отказ
            </Button>
            <Button type="button" onClick={handleDelete} disabled={pending}>
              {pending ? "Изтриване…" : "Изтрий завинаги"}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setConfirmDelete(true)}
            disabled={pending}
          >
            Изтрий
          </Button>
        )
      )}
    </div>
  );
}
