"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { detectAnomaliesSafe } from "@/lib/invoices/anomaly";
import { normalizeForMatching } from "@/lib/invoices/normalize";

// Per-field inline-edit actions for the invoice detail page. Each function
// matches the {ok}|{ok:false,error} contract that the inline cell primitives
// (InlineTextCell, InlineDateCell, etc.) expect.
//
// Permissions per specs/invoices.md §11 + §8:
//   - status=pending: any manager + admin can edit
//   - status=paid:    admin-only (managers see a 🔒 cell read-only)
//
// The gate lives in `assertCanEdit` so it's enforced exactly once and every
// action stays a thin wrapper around it.

type Result = { ok: true } | { ok: false; error: string };

async function assertCanEdit(
  invoiceId: string,
): Promise<{ ok: true; actorId: string } | { ok: false; error: string }> {
  const actor = await requireProfile();
  if (actor.role !== "admin" && actor.role !== "manager") {
    return { ok: false, error: "Нямате достъп до фактурите." };
  }
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { status: true },
  });
  if (!inv) return { ok: false, error: "Фактурата не съществува." };
  if (inv.status === "paid" && actor.role !== "admin") {
    return {
      ok: false,
      error:
        "Фактурата е платена — само администратор може да я редактира. Прехвърли я обратно на „Чакаща“ при нужда.",
    };
  }
  return { ok: true, actorId: actor.id };
}

// Generic helper: patch one or more fields, audit, revalidate.
async function patchInvoice(
  invoiceId: string,
  patch: Record<string, unknown>,
  fieldName: string,
): Promise<Result> {
  const gate = await assertCanEdit(invoiceId);
  if (!gate.ok) return gate;

  const before = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!before) return { ok: false, error: "Фактурата не съществува." };

  await prisma.invoice.update({ where: { id: invoiceId }, data: patch });

  const hdrs = await headers();
  // Audit captures only the changed field's before/after so the activity feed
  // stays readable. Wider patches get serialised as a JSON map.
  const beforeRecord = before as unknown as Record<string, unknown>;
  await recordAuditEvent({
    actorId: gate.actorId,
    action: "invoices.metadata.edited",
    targetType: "invoice",
    targetId: invoiceId,
    payload: { field: fieldName },
    before: Object.fromEntries(
      Object.keys(patch).map((k) => {
        const v = beforeRecord[k];
        return [k, v instanceof Date ? v.toISOString() : (v as string | number | boolean | null)];
      }),
    ),
    after: Object.fromEntries(
      Object.entries(patch).map(([k, v]) => [
        k,
        v instanceof Date ? v.toISOString() : (v as string | number | boolean | null),
      ]),
    ),
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { ok: true };
}

// Vendor name: server keeps `vendorNameNormalized` in sync since
// price-history joins depend on it. Changing the vendor changes the set of
// comparable prior invoices for the detector, so we re-run it after the
// patch lands. Best-effort — anomaly state is informational and won't
// block the edit if the detector fails.
export async function setVendorName(
  invoiceId: string,
  next: string | null,
): Promise<Result> {
  const trimmed = (next ?? "").trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Доставчикът е задължителен." };
  }
  const res = await patchInvoice(
    invoiceId,
    {
      vendorName: trimmed,
      vendorNameNormalized: normalizeForMatching(trimmed),
    },
    "vendorName",
  );
  if (res.ok) await detectAnomaliesSafe(invoiceId);
  return res;
}

export async function setVendorVatNumber(
  invoiceId: string,
  next: string | null,
): Promise<Result> {
  const trimmed = (next ?? "").trim();
  return patchInvoice(
    invoiceId,
    { vendorVatNumber: trimmed === "" ? null : trimmed },
    "vendorVatNumber",
  );
}

export async function setInvoiceNumber(
  invoiceId: string,
  next: string | null,
): Promise<Result> {
  const trimmed = (next ?? "").trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Номерът е задължителен." };
  }
  return patchInvoice(invoiceId, { invoiceNumber: trimmed }, "invoiceNumber");
}

export async function setInvoiceDate(
  invoiceId: string,
  next: string | null,
): Promise<Result> {
  if (!next || !/^\d{4}-\d{2}-\d{2}$/.test(next)) {
    return { ok: false, error: "Невалидна дата." };
  }
  const res = await patchInvoice(
    invoiceId,
    { invoiceDate: new Date(`${next}T00:00:00Z`) },
    "invoiceDate",
  );
  // The detector's 30-day window is anchored on `invoiceDate`, so shifting
  // the date can bring different priors into scope. Re-run.
  if (res.ok) await detectAnomaliesSafe(invoiceId);
  return res;
}

export async function setDueDate(
  invoiceId: string,
  next: string | null,
): Promise<Result> {
  if (next && !/^\d{4}-\d{2}-\d{2}$/.test(next)) {
    return { ok: false, error: "Невалидна дата." };
  }
  // Cross-field validation: dueDate must be ≥ invoiceDate when set.
  if (next) {
    const inv = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { invoiceDate: true },
    });
    if (inv) {
      const invIso = inv.invoiceDate.toISOString().slice(0, 10);
      if (next < invIso) {
        return {
          ok: false,
          error: "Срокът не може да е преди датата на фактурата.",
        };
      }
    }
  }
  return patchInvoice(
    invoiceId,
    { dueDate: next ? new Date(`${next}T00:00:00Z`) : null },
    "dueDate",
  );
}

// Money fields share validation: non-negative, finite. Total-coherence
// (total ≈ subtotal + vat ± 0.02) is enforced once the user has edited
// whichever field; if they edit just `subtotal`, the check uses the stored
// `vatAmount` and `total` from the DB. If the new combo is inconsistent we
// reject and ask them to update both halves.
async function setMoneyField(
  invoiceId: string,
  field: "subtotal" | "vatAmount" | "total",
  next: string | null,
): Promise<Result> {
  if (next === null || next.trim() === "") {
    return { ok: false, error: "Сумата е задължителна." };
  }
  const n = Number.parseFloat(next);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: "Сумата трябва да е неотрицателно число." };
  }

  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { subtotal: true, vatAmount: true, total: true },
  });
  if (!inv) return { ok: false, error: "Фактурата не съществува." };

  const after = {
    subtotal: field === "subtotal" ? n : Number(inv.subtotal),
    vatAmount: field === "vatAmount" ? n : Number(inv.vatAmount),
    total: field === "total" ? n : Number(inv.total),
  };
  if (Math.abs(after.total - (after.subtotal + after.vatAmount)) > 0.02) {
    return {
      ok: false,
      error:
        "Несъответствие: общата сума трябва да е равна на основа + ДДС. Коригирай и трите полета.",
    };
  }

  return patchInvoice(invoiceId, { [field]: n }, field);
}

export async function setSubtotal(invoiceId: string, next: string | null): Promise<Result> {
  return setMoneyField(invoiceId, "subtotal", next);
}
export async function setVatAmount(invoiceId: string, next: string | null): Promise<Result> {
  return setMoneyField(invoiceId, "vatAmount", next);
}
export async function setTotal(invoiceId: string, next: string | null): Promise<Result> {
  return setMoneyField(invoiceId, "total", next);
}

export async function setInvoiceNotes(
  invoiceId: string,
  next: string | null,
): Promise<Result> {
  const trimmed = (next ?? "").trim();
  return patchInvoice(
    invoiceId,
    { notes: trimmed === "" ? null : trimmed },
    "notes",
  );
}
