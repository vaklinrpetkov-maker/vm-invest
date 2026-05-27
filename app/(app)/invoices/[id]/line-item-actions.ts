"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { detectAnomaliesSafe } from "@/lib/invoices/anomaly";
import { normalizeForMatching } from "@/lib/invoices/normalize";

// Per-line-item inline edit actions for the invoice detail page. Each
// function takes a `lineItemId` and a `next` value, looks up the parent
// invoice for the permission gate, and writes the change.
//
// Permissions match the header field rules in field-actions.ts:
//   - status=pending: any manager + admin can edit
//   - status=paid:    admin-only (managers see locked cells)
//
// Two field edits trigger a re-run of the price-anomaly detector:
//   - unitPrice (the value the detector compares)
//   - description (the field that decides which prior line items are
//     comparable, via descriptionNormalized)
// The detector runs after the patch via detectAnomaliesSafe — informational,
// won't block on failure.

type Result = { ok: true } | { ok: false; error: string };

async function assertCanEditViaLineItem(
  lineItemId: string,
): Promise<
  { ok: true; actorId: string; invoiceId: string } | { ok: false; error: string }
> {
  const actor = await requireProfile();
  if (actor.role !== "admin" && actor.role !== "manager") {
    return { ok: false, error: "Нямате достъп до фактурите." };
  }
  const li = await prisma.invoiceLineItem.findUnique({
    where: { id: lineItemId },
    select: { invoiceId: true, invoice: { select: { status: true } } },
  });
  if (!li) return { ok: false, error: "Позицията не съществува." };
  if (li.invoice.status === "paid" && actor.role !== "admin") {
    return {
      ok: false,
      error:
        "Фактурата е платена — само администратор може да редактира позиции.",
    };
  }
  return { ok: true, actorId: actor.id, invoiceId: li.invoiceId };
}

async function patchLineItem(
  lineItemId: string,
  patch: Record<string, unknown>,
  fieldName: string,
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  const gate = await assertCanEditViaLineItem(lineItemId);
  if (!gate.ok) return gate;

  const before = await prisma.invoiceLineItem.findUnique({
    where: { id: lineItemId },
  });
  if (!before) return { ok: false, error: "Позицията не съществува." };

  await prisma.invoiceLineItem.update({
    where: { id: lineItemId },
    data: patch,
  });

  const hdrs = await headers();
  const beforeRecord = before as unknown as Record<string, unknown>;
  await recordAuditEvent({
    actorId: gate.actorId,
    action: "invoices.metadata.edited",
    targetType: "invoice_line_item",
    targetId: lineItemId,
    payload: { field: fieldName, invoiceId: gate.invoiceId },
    before: Object.fromEntries(
      Object.keys(patch).map((k) => [
        k,
        beforeRecord[k] as string | number | boolean | null,
      ]),
    ),
    after: Object.fromEntries(
      Object.entries(patch).map(([k, v]) => [
        k,
        v as string | number | boolean | null,
      ]),
    ),
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath(`/invoices/${gate.invoiceId}`);
  revalidatePath("/invoices");
  return { ok: true, invoiceId: gate.invoiceId };
}

export async function setLineItemDescription(
  lineItemId: string,
  next: string | null,
): Promise<Result> {
  const trimmed = (next ?? "").trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Описанието е задължително." };
  }
  const res = await patchLineItem(
    lineItemId,
    {
      description: trimmed,
      descriptionNormalized: normalizeForMatching(trimmed),
    },
    "description",
  );
  if (!res.ok) return res;
  // Description change affects which priors match — re-run detector.
  await detectAnomaliesSafe(res.invoiceId);
  return { ok: true };
}

export async function setLineItemQuantity(
  lineItemId: string,
  next: number | null,
): Promise<Result> {
  if (next === null || !Number.isFinite(next) || next < 0) {
    return { ok: false, error: "Количеството трябва да е неотрицателно число." };
  }
  const res = await patchLineItem(lineItemId, { quantity: next }, "quantity");
  if (!res.ok) return res;
  return { ok: true };
}

export async function setLineItemUnit(
  lineItemId: string,
  next: string | null,
): Promise<Result> {
  const trimmed = (next ?? "").trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Мярката е задължителна." };
  }
  const res = await patchLineItem(lineItemId, { unit: trimmed }, "unit");
  if (!res.ok) return res;
  return { ok: true };
}

export async function setLineItemUnitPrice(
  lineItemId: string,
  next: number | null,
): Promise<Result> {
  if (next === null || !Number.isFinite(next) || next < 0) {
    return { ok: false, error: "Цената трябва да е неотрицателно число." };
  }
  const res = await patchLineItem(lineItemId, { unitPrice: next }, "unitPrice");
  if (!res.ok) return res;
  // Price change is the canonical anomaly-detector trigger.
  await detectAnomaliesSafe(res.invoiceId);
  return { ok: true };
}

export async function setLineItemLineTotal(
  lineItemId: string,
  next: number | null,
): Promise<Result> {
  if (next === null || !Number.isFinite(next) || next < 0) {
    return { ok: false, error: "Сумата трябва да е неотрицателно число." };
  }
  const res = await patchLineItem(lineItemId, { lineTotal: next }, "lineTotal");
  if (!res.ok) return res;
  return { ok: true };
}

export async function setLineItemVatRate(
  lineItemId: string,
  next: number | null,
): Promise<Result> {
  if (next === null || !Number.isFinite(next) || next < 0 || next > 100) {
    return { ok: false, error: "ДДС трябва да е между 0 и 100." };
  }
  const res = await patchLineItem(lineItemId, { vatRate: next }, "vatRate");
  if (!res.ok) return res;
  return { ok: true };
}

// Row management.

export async function addLineItem(invoiceId: string): Promise<Result> {
  const actor = await requireProfile();
  if (actor.role !== "admin" && actor.role !== "manager") {
    return { ok: false, error: "Нямате достъп до фактурите." };
  }
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { status: true, lineItems: { select: { rowNumber: true } } },
  });
  if (!invoice) return { ok: false, error: "Фактурата не съществува." };
  if (invoice.status === "paid" && actor.role !== "admin") {
    return {
      ok: false,
      error: "Фактурата е платена — само администратор може да добавя позиции.",
    };
  }
  const nextRow =
    invoice.lineItems.length === 0
      ? 1
      : Math.max(...invoice.lineItems.map((li) => li.rowNumber)) + 1;

  await prisma.invoiceLineItem.create({
    data: {
      invoiceId,
      rowNumber: nextRow,
      description: "Нова позиция",
      descriptionNormalized: normalizeForMatching("Нова позиция"),
      quantity: 1,
      unit: "бр.",
      unitPrice: 0,
      lineTotal: 0,
      vatRate: 20,
    },
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    action: "invoices.metadata.edited",
    targetType: "invoice",
    targetId: invoiceId,
    payload: { field: "lineItem.added" },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true };
}

export async function deleteLineItem(lineItemId: string): Promise<Result> {
  const gate = await assertCanEditViaLineItem(lineItemId);
  if (!gate.ok) return gate;

  const before = await prisma.invoiceLineItem.findUnique({
    where: { id: lineItemId },
    select: { description: true, unitPrice: true, lineTotal: true },
  });
  if (!before) return { ok: false, error: "Позицията не съществува." };

  await prisma.invoiceLineItem.delete({ where: { id: lineItemId } });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: gate.actorId,
    action: "invoices.metadata.edited",
    targetType: "invoice_line_item",
    targetId: lineItemId,
    payload: { field: "lineItem.removed", invoiceId: gate.invoiceId },
    before: {
      description: before.description,
      unitPrice: before.unitPrice.toString(),
      lineTotal: before.lineTotal.toString(),
    },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  // Deletion can change anomaly state for OTHER invoices that referenced
  // this row as their baseline — but those refs are stored as raw UUIDs
  // without a FK constraint, so they don't break. They'll re-resolve on
  // the next edit/upload that triggers the detector. Not worth re-running
  // for every downstream invoice here.
  revalidatePath(`/invoices/${gate.invoiceId}`);
  revalidatePath("/invoices");
  return { ok: true };
}

