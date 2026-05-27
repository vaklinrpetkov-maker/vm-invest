"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

// Admin-only CRUD for invoice upload sections. Mirrors the shape of
// /admin/buildings — discriminated-union results, audit-logged, paths
// revalidated. See specs/invoices.md §5.

export type SectionActionResult = { ok: true } | { ok: false; error: string };

// Slug rules:
//  - lowercase ASCII letters / digits / hyphens / underscores only
//  - 2-32 chars
//  - immutable after creation (used in storage paths — renaming would orphan
//    every file uploaded under the old slug)
const SLUG_RE = /^[a-z0-9_-]{2,32}$/;

function validateLabel(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "Името е задължително.";
  if (trimmed.length > 60) return "Името е твърде дълго (макс. 60 символа).";
  return null;
}

function validateSlug(raw: string): string | null {
  if (!SLUG_RE.test(raw)) {
    return "Системното име трябва да съдържа само малки латински букви, цифри, тире и долна черта (2–32 символа).";
  }
  return null;
}

export async function createSectionAction(formData: FormData): Promise<SectionActionResult> {
  const actor = await requireRole("admin");
  const labelBg = String(formData.get("labelBg") ?? "");
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const sortOrderRaw = String(formData.get("sortOrder") ?? "0");

  const labelErr = validateLabel(labelBg);
  if (labelErr) return { ok: false, error: labelErr };
  const slugErr = validateSlug(slug);
  if (slugErr) return { ok: false, error: slugErr };

  const sortOrder = Number.parseInt(sortOrderRaw, 10);
  if (!Number.isFinite(sortOrder)) {
    return { ok: false, error: "Подредбата трябва да е цяло число." };
  }

  const existing = await prisma.invoiceSection.findUnique({ where: { slug } });
  if (existing) {
    return { ok: false, error: "Системното име вече съществува." };
  }

  const created = await prisma.invoiceSection.create({
    data: { labelBg: labelBg.trim(), slug, sortOrder, active: true },
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    action: "invoices.section.created",
    targetType: "invoice_section",
    targetId: created.id,
    after: { labelBg: created.labelBg, slug: created.slug, sortOrder: created.sortOrder, active: created.active },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/admin/invoice-sections");
  revalidatePath("/invoices");
  return { ok: true };
}

export async function updateSectionAction(
  id: string,
  patch: { labelBg?: string; sortOrder?: number; active?: boolean },
): Promise<SectionActionResult> {
  const actor = await requireRole("admin");

  const before = await prisma.invoiceSection.findUnique({ where: { id } });
  if (!before) return { ok: false, error: "Секцията не съществува." };

  const update: { labelBg?: string; sortOrder?: number; active?: boolean } = {};
  if (patch.labelBg !== undefined) {
    const err = validateLabel(patch.labelBg);
    if (err) return { ok: false, error: err };
    update.labelBg = patch.labelBg.trim();
  }
  if (patch.sortOrder !== undefined) {
    if (!Number.isFinite(patch.sortOrder)) {
      return { ok: false, error: "Подредбата трябва да е цяло число." };
    }
    update.sortOrder = patch.sortOrder;
  }
  if (patch.active !== undefined) {
    update.active = patch.active;
  }
  if (Object.keys(update).length === 0) return { ok: true };

  const updated = await prisma.invoiceSection.update({ where: { id }, data: update });

  const hdrs = await headers();
  // Distinguish "deactivation" (toggling `active` to false) from a regular
  // update so the audit viewer can highlight it differently. Other fields
  // changing → `invoices.section.updated`.
  const isDeactivation = patch.active === false && before.active === true;
  await recordAuditEvent({
    actorId: actor.id,
    action: isDeactivation ? "invoices.section.deactivated" : "invoices.section.updated",
    targetType: "invoice_section",
    targetId: updated.id,
    before: { labelBg: before.labelBg, sortOrder: before.sortOrder, active: before.active },
    after: { labelBg: updated.labelBg, sortOrder: updated.sortOrder, active: updated.active },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/admin/invoice-sections");
  revalidatePath("/invoices");
  return { ok: true };
}

export async function deleteSectionAction(id: string): Promise<SectionActionResult> {
  const actor = await requireRole("admin");

  const before = await prisma.invoiceSection.findUnique({
    where: { id },
    include: { _count: { select: { invoices: true } } },
  });
  if (!before) return { ok: false, error: "Секцията не съществува." };

  // Hard-block deletion if any invoice references this section. Per spec §5.2:
  // admin should deactivate instead, which is reversible.
  if (before._count.invoices > 0) {
    return {
      ok: false,
      error: `Секцията не може да бъде изтрита — има ${before._count.invoices} свързани фактури. Деактивирай я вместо това.`,
    };
  }

  await prisma.invoiceSection.delete({ where: { id } });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    // Reuse the deactivated label — deletion of an empty section is rare and
    // not semantically distinct enough to warrant a separate audit action.
    action: "invoices.section.deactivated",
    targetType: "invoice_section",
    targetId: id,
    before: { labelBg: before.labelBg, slug: before.slug, sortOrder: before.sortOrder, active: before.active },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/admin/invoice-sections");
  revalidatePath("/invoices");
  return { ok: true };
}
