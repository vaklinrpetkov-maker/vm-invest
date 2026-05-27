"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { InvoiceStatus } from "@prisma/client";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { deleteFile } from "@/lib/supabase/storage";

// Server actions for the /invoices surface:
//   - setInvoiceStatus  → inline-edit pill in the list view (pending ↔ paid)
//   - deleteInvoice     → uploader-while-pending OR admin; also removes
//                          the underlying PDF from Storage
//
// Metadata edits + line-item edits live in `[id]/field-actions.ts` and
// `[id]/line-item-actions.ts`. Upload + parse live in `upload-actions.ts`.

export type InvoiceActionResult = { ok: true } | { ok: false; error: string };

export async function setInvoiceStatus(
  invoiceId: string,
  next: InvoiceStatus,
): Promise<InvoiceActionResult> {
  const actor = await requireProfile();
  if (actor.role === "user") {
    return { ok: false, error: "Нямате достъп до фактурите." };
  }

  if (next !== "pending" && next !== "paid") {
    return { ok: false, error: "Невалиден статус." };
  }

  const before = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, status: true, paidAt: true, paidById: true },
  });
  if (!before) return { ok: false, error: "Фактурата не съществува." };
  if (before.status === next) return { ok: true };

  // Status flip stamps / unstamps `paidAt` + `paidById`. We unstamp on
  // paid→pending so the audit history reflects "reverted to pending" as a
  // clean reset rather than a stale paid timestamp.
  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data:
      next === "paid"
        ? { status: "paid", paidAt: new Date(), paidById: actor.id }
        : { status: "pending", paidAt: null, paidById: null },
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    action: "invoices.status.changed",
    targetType: "invoice",
    targetId: invoiceId,
    before: { status: before.status, paidAt: before.paidAt, paidById: before.paidById },
    after: { status: updated.status, paidAt: updated.paidAt, paidById: updated.paidById },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true };
}

export async function deleteInvoice(invoiceId: string): Promise<InvoiceActionResult> {
  const actor = await requireProfile();
  if (actor.role === "user") {
    return { ok: false, error: "Нямате достъп до фактурите." };
  }

  const before = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      status: true,
      uploadedById: true,
      storagePath: true,
      vendorName: true,
      invoiceNumber: true,
    },
  });
  if (!before) return { ok: false, error: "Фактурата не съществува." };

  // Permission gate per specs/invoices.md §11:
  //   - admin: always
  //   - manager: only if they uploaded it AND it's still pending
  if (actor.role !== "admin") {
    if (before.uploadedById !== actor.id) {
      return { ok: false, error: "Само администратор може да изтрие чужда фактура." };
    }
    if (before.status !== "pending") {
      return { ok: false, error: "Платените фактури могат да бъдат изтрити само от администратор." };
    }
  }

  // Delete the DB row first (line items cascade); Storage cleanup runs after.
  // Reverse order would leave orphan rows pointing at a missing file when the
  // Storage delete succeeds but the DB delete fails.
  await prisma.invoice.delete({ where: { id: invoiceId } });

  // Storage cleanup — best-effort. `deleteFile` logs + returns false on
  // failure rather than throwing, so an orphan PDF in Storage doesn't
  // block the audit-log write below. Stray orphans get caught by the
  // admin sweep (future).
  await deleteFile(before.storagePath);

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    action: "invoices.deleted",
    targetType: "invoice",
    targetId: invoiceId,
    before: {
      vendorName: before.vendorName,
      invoiceNumber: before.invoiceNumber,
      status: before.status,
      storagePath: before.storagePath,
    },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/invoices");
  return { ok: true };
}
