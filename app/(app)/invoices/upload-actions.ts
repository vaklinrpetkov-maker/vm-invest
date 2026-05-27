"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { detectAnomaliesSafe } from "@/lib/invoices/anomaly";
import { normalizeForMatching } from "@/lib/invoices/normalize";
import { parseInvoicePdf, type ParsedInvoice } from "@/lib/invoices/parser";
import {
  deleteFile,
  ensureBucketExists,
  uploadFile,
} from "@/lib/supabase/storage";

// Three-step upload flow per specs/invoices.md §4:
//
//   1. parseAndStageInvoice  → manager picks a section + PDF. Server uploads
//                              the file to Storage, calls the parser, returns
//                              the parsed metadata + duplicate warning to the
//                              client. The Invoice row is NOT created yet —
//                              the file lives in Storage as a "staged" upload.
//   2. confirmInvoice        → manager (after reviewing/editing in the modal)
//                              clicks Запази. Server inserts Invoice +
//                              InvoiceLineItem rows, audits, revalidates.
//   3. discardStagedInvoice  → manager closes the modal without saving.
//                              Server deletes the staged Storage object.
//
// Splitting parse from confirm lets the user correct extraction errors before
// any data lands in the ledger. The cost is a stale Storage object if the
// browser crashes between (1) and (3) — TODO: a sweep job in Round 4 will
// clean up orphans older than 24h. Volume is tiny so it's not urgent.

const BUCKET = "invoices";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per spec §12
const MAX_PDF_MIME = ["application/pdf"];

export type StageInvoiceResult =
  | {
      ok: true;
      // The Storage key (full path including bucket) for the just-uploaded
      // PDF. Round-trips through the client so confirmInvoice can re-attach
      // it without re-uploading.
      storagePath: string;
      fileName: string;
      fileSize: number;
      sectionId: string;
      parsed: ParsedInvoice;
      // Soft duplicate warning if (vendor, number, date) collides with an
      // existing non-deleted invoice. Never blocks; the modal renders a
      // banner and lets the user save anyway.
      duplicateOf: {
        id: string;
        vendorName: string;
        invoiceNumber: string;
        invoiceDateIso: string;
        uploaderName: string;
      } | null;
    }
  | { ok: false; error: string };

export async function parseAndStageInvoice(
  formData: FormData,
): Promise<StageInvoiceResult> {
  const actor = await requireProfile();
  if (actor.role !== "admin" && actor.role !== "manager") {
    return { ok: false, error: "Нямате достъп до фактурите." };
  }

  const sectionId = String(formData.get("sectionId") ?? "");
  const file = formData.get("file");

  if (!sectionId) {
    return { ok: false, error: "Не е избрана секция." };
  }
  if (!(file instanceof File)) {
    return { ok: false, error: "Не е избран файл." };
  }
  if (!MAX_PDF_MIME.includes(file.type)) {
    return { ok: false, error: "Файлът трябва да е PDF." };
  }
  if (file.size > MAX_FILE_SIZE) {
    return {
      ok: false,
      error: `Файлът е твърде голям (макс. ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB).`,
    };
  }

  const section = await prisma.invoiceSection.findUnique({
    where: { id: sectionId },
    select: { id: true, slug: true, active: true },
  });
  if (!section || !section.active) {
    return { ok: false, error: "Невалидна или неактивна секция." };
  }

  // Bucket is created lazily on first upload. ensureBucketExists is a no-op
  // after the first call so this is cheap on the hot path.
  const bucketReady = await ensureBucketExists(BUCKET);
  if (!bucketReady) {
    return { ok: false, error: "Грешка при инициализиране на хранилището." };
  }

  // Storage path: invoices/<section-slug>/<yyyy-mm>/<uuid>.pdf per spec §4.
  // The yyyy-mm shard keeps any one folder from getting unmanageable; the
  // UUID prevents collisions on identical filenames.
  const now = new Date();
  const yyyyMm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const objectKey = `${BUCKET}/${section.slug}/${yyyyMm}/${randomUUID()}.pdf`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const uploadRes = await uploadFile(objectKey, buffer, {
    contentType: "application/pdf",
  });
  if (!uploadRes.ok) {
    return { ok: false, error: `Грешка при качване: ${uploadRes.error}` };
  }

  // Parse. If this fails we delete the Storage object so we don't litter the
  // bucket with un-parseable files that have no DB anchor.
  const parseRes = await parseInvoicePdf(buffer);
  if (!parseRes.ok) {
    await deleteFile(objectKey);
    return { ok: false, error: parseRes.error };
  }

  // Soft duplicate check on (vendor_normalized, invoiceNumber, invoiceDate).
  // Per spec §4.1 the check runs AFTER parsing — we need the parsed values.
  const vendorNorm = normalizeForMatching(parseRes.data.vendorName);
  const invoiceDate = new Date(`${parseRes.data.invoiceDate}T00:00:00Z`);
  const dupe = await prisma.invoice.findFirst({
    where: {
      vendorNameNormalized: vendorNorm,
      invoiceNumber: parseRes.data.invoiceNumber,
      invoiceDate,
    },
    select: {
      id: true,
      vendorName: true,
      invoiceNumber: true,
      invoiceDate: true,
      uploadedBy: { select: { fullName: true } },
    },
  });

  return {
    ok: true,
    storagePath: objectKey,
    fileName: file.name,
    fileSize: file.size,
    sectionId,
    parsed: parseRes.data,
    duplicateOf: dupe
      ? {
          id: dupe.id,
          vendorName: dupe.vendorName,
          invoiceNumber: dupe.invoiceNumber,
          invoiceDateIso: dupe.invoiceDate.toISOString().slice(0, 10),
          uploaderName: dupe.uploadedBy.fullName,
        }
      : null,
  };
}

// Manager-edited payload from the preview modal. Numbers come as strings to
// keep the form-data wire format simple; we parse them server-side.
export type ConfirmInvoiceInput = {
  sectionId: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  parseConfidence: number;
  vendorName: string;
  vendorVatNumber: string | null;
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  dueDate: string | null;
  subtotal: number;
  vatAmount: number;
  total: number;
  notes: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    lineTotal: number;
    vatRate: number;
  }>;
};

export type ConfirmInvoiceResult =
  | { ok: true; invoiceId: string }
  | { ok: false; error: string };

export async function confirmInvoice(
  input: ConfirmInvoiceInput,
): Promise<ConfirmInvoiceResult> {
  const actor = await requireProfile();
  if (actor.role !== "admin" && actor.role !== "manager") {
    return { ok: false, error: "Нямате достъп до фактурите." };
  }

  // Validation per spec §12. Errors here mean the manager bypassed the
  // client-side checks somehow; surface the message inline in the modal.
  const v = validatePayload(input);
  if (!v.ok) return v;

  // Section sanity check — guards against a manager keeping a stale modal
  // open while an admin deactivates the section in another tab.
  const section = await prisma.invoiceSection.findUnique({
    where: { id: input.sectionId },
    select: { id: true, active: true },
  });
  if (!section || !section.active) {
    return { ok: false, error: "Секцията вече не е активна." };
  }

  // One transaction so a partial write can't leave us with an Invoice row
  // and no line items, or vice versa.
  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        sectionId: input.sectionId,
        uploadedById: actor.id,
        storagePath: input.storagePath,
        fileName: input.fileName,
        fileSize: input.fileSize,
        parseConfidence: input.parseConfidence,
        parseReviewNeeded: input.parseConfidence < 80,
        vendorName: input.vendorName.trim(),
        vendorNameNormalized: normalizeForMatching(input.vendorName),
        vendorVatNumber: input.vendorVatNumber?.trim() || null,
        invoiceNumber: input.invoiceNumber.trim(),
        invoiceDate: new Date(`${input.invoiceDate}T00:00:00Z`),
        dueDate: input.dueDate
          ? new Date(`${input.dueDate}T00:00:00Z`)
          : null,
        subtotal: input.subtotal,
        vatAmount: input.vatAmount,
        total: input.total,
        notes: input.notes.trim() || null,
        // Default `pending` is fine; status flows through the inline cell.
      },
    });

    if (input.lineItems.length > 0) {
      await tx.invoiceLineItem.createMany({
        data: input.lineItems.map((li, idx) => ({
          invoiceId: created.id,
          rowNumber: idx + 1,
          description: li.description.trim(),
          descriptionNormalized: normalizeForMatching(li.description),
          quantity: li.quantity,
          unit: li.unit.trim() || "бр.",
          unitPrice: li.unitPrice,
          lineTotal: li.lineTotal,
          vatRate: li.vatRate,
          // priceAnomalyPct stays null in Round 2 — the detector ships in
          // Round 4 and runs as a separate pass after this transaction.
        })),
      });
    }

    return created;
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    action: "invoices.uploaded",
    targetType: "invoice",
    targetId: invoice.id,
    after: {
      vendorName: invoice.vendorName,
      invoiceNumber: invoice.invoiceNumber,
      total: invoice.total.toString(),
      lineItemCount: input.lineItems.length,
      parseConfidence: input.parseConfidence,
    },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  // Run the price-anomaly detector after the transaction commits so the new
  // line items are queryable as candidates for future invoices' detection
  // runs, and so this invoice's own line items get flagged if any are
  // already >5% above a prior price for the same vendor/product.
  // Best-effort — if it fails, the upload still succeeds; the next edit
  // re-runs it.
  await detectAnomaliesSafe(invoice.id);

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoice.id}`);
  return { ok: true, invoiceId: invoice.id };
}

export async function discardStagedInvoice(
  storagePath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireProfile();
  if (actor.role !== "admin" && actor.role !== "manager") {
    return { ok: false, error: "Нямате достъп." };
  }
  // Guard: only delete inside the invoices bucket. Belt-and-braces against
  // a malformed path being passed back from the client.
  if (!storagePath.startsWith(`${BUCKET}/`)) {
    return { ok: false, error: "Невалиден път." };
  }
  const removed = await deleteFile(storagePath);
  // Don't block on storage cleanup — best-effort. A 24h sweep job will catch
  // anything that lingers.
  if (!removed) {
    console.warn("[invoices.upload] discard cleanup failed", { storagePath });
  }
  return { ok: true };
}

// Validation per spec §12.
function validatePayload(
  input: ConfirmInvoiceInput,
): ConfirmInvoiceResult & { ok: false } | { ok: true } {
  if (input.vendorName.trim().length === 0) {
    return { ok: false, error: "Доставчикът е задължителен." };
  }
  if (input.invoiceNumber.trim().length === 0) {
    return { ok: false, error: "Номерът на фактурата е задължителен." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.invoiceDate)) {
    return { ok: false, error: "Дата на фактурата: невалиден формат." };
  }
  if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
    return { ok: false, error: "Срок на плащане: невалиден формат." };
  }
  if (input.dueDate && input.dueDate < input.invoiceDate) {
    return { ok: false, error: "Срокът не може да е преди датата на фактурата." };
  }
  if (input.subtotal < 0 || input.vatAmount < 0 || input.total < 0) {
    return { ok: false, error: "Сумите не могат да са отрицателни." };
  }
  // total ≈ subtotal + vat within 0.02 EUR tolerance. Per spec §12 this is
  // blocking — the modal won't submit on mismatch. Repeat the check server-
  // side defensively.
  const expectedTotal = input.subtotal + input.vatAmount;
  if (Math.abs(input.total - expectedTotal) > 0.02) {
    return {
      ok: false,
      error: `Общата сума (${input.total.toFixed(2)}) не съвпада със сборa на основа + ДДС (${expectedTotal.toFixed(2)}).`,
    };
  }
  for (const li of input.lineItems) {
    if (li.quantity < 0 || li.unitPrice < 0 || li.lineTotal < 0) {
      return { ok: false, error: "Стойностите по редовете не могат да са отрицателни." };
    }
  }
  return { ok: true };
}
