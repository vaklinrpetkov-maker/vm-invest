"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireProfile, requireRole } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/auth/audit";
import { parsePropertyFormData, type PropertyFormState } from "@/lib/properties/parse";
import { canEditField, canDeleteProperty, isLockedField } from "@/lib/properties/permissions";
import { writeStatusChange } from "@/lib/properties/status-history";

// Server actions for /properties. Shared between the list page (create modal,
// inline edits) and the detail page (full-form edit, delete).

export async function createProperty(
  _prev: PropertyFormState,
  formData: FormData,
): Promise<PropertyFormState> {
  const me = await requireProfile();
  const parsed = await parsePropertyFormData(formData);
  if (!parsed.ok) return { errors: parsed.errors, warnings: parsed.warnings };

  const created = await prisma.property.create({
    data: {
      ...parsed.data,
      createdById: me.id,
      updatedById: me.id,
    },
  });

  // Initial status-history entry — the create is effectively null → [status].
  await writeStatusChange({
    propertyId: created.id,
    fromStatus: null,
    toStatus: created.status,
    authorId: me.id,
    note: "Създаване на имот",
  });

  await recordAuditEvent({
    actorId: me.id,
    action: "property.created",
    targetType: "property",
    targetId: created.id,
    payload: {
      buildingId: created.buildingId,
      name: created.name,
      status: created.status,
      type: created.type,
    },
  });

  revalidatePath("/properties");
  redirect(`/properties/${created.id}`);
}

export async function updateProperty(
  id: string,
  _prev: PropertyFormState,
  formData: FormData,
): Promise<PropertyFormState> {
  const me = await requireProfile();
  const existing = await prisma.property.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) {
    return { errors: { form: "Имотът не е намерен." } };
  }

  const parsed = await parsePropertyFormData(formData, { excludeId: id });
  if (!parsed.ok) return { errors: parsed.errors, warnings: parsed.warnings };

  // Role-gated write check — user can't push sellers / prices.
  if (me.role === "user") {
    const restricted: Array<keyof typeof parsed.data> = [
      "sellers",
      "expectedPriceEur",
      "priceEur",
      "yardTerracePriceEur",
    ];
    for (const k of restricted) {
      const v = parsed.data[k];
      // For `sellers` (array), "wasn't touched" means an empty array.
      const isTouched = Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined;
      if (isTouched) {
        // Quick sanity — if the user tried to change a restricted field vs
        // the existing value, silently drop the edit to the existing value.
        // (We don't error because the page should have rendered the field
        // read-only already; this is a server-side belt-and-braces check.)
        (parsed.data as Record<string, unknown>)[k] = (existing as unknown as Record<string, unknown>)[k];
      }
    }
  }

  // Locked-field passthrough — users cannot touch owner/contract via this
  // endpoint, period.
  const statusChanged = existing.status !== parsed.data.status;

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.property.update({
      where: { id },
      data: { ...parsed.data, updatedById: me.id },
    });
    if (statusChanged) {
      await writeStatusChange({
        propertyId: id,
        fromStatus: existing.status,
        toStatus: parsed.data.status,
        authorId: me.id,
        tx,
      });
    }
    return u;
  });

  await recordAuditEvent({
    actorId: me.id,
    action: "property.updated",
    targetType: "property",
    targetId: id,
    before: { status: existing.status, type: existing.type, name: existing.name },
    after: { status: updated.status, type: updated.type, name: updated.name },
  });

  if (statusChanged) {
    await recordAuditEvent({
      actorId: me.id,
      action: "property.status_changed",
      targetType: "property",
      targetId: id,
      payload: { from: existing.status, to: updated.status },
    });
  }

  revalidatePath("/properties");
  revalidatePath(`/properties/${id}`);
  redirect(`/properties/${id}`);
}

// Note: the legacy `updatePropertyField` switchboard was retired in favor of
// the per-field actions in `app/(app)/properties/field-actions.ts` and
// `status-actions.ts` (one function per field, matching the contacts / tasks /
// leads pattern). See specs/decisions.md 15.05.2026 for the migration entry.

export async function deleteProperty(formData: FormData): Promise<void> {
  const me = await requireRole("admin");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const existing = await prisma.property.findUnique({
    where: { id },
    include: { statusHistory: { take: 1 } },
  });
  if (!existing || existing.deletedAt) return;

  if (!canDeleteProperty(me.role)) return;

  // Hard-block guards per properties.md §5.3 + renovations.md §12. A
  // property with an active contract, owner, or renovation cannot be
  // deleted — those records would orphan with no recoverable UI home.
  if (existing.ownerId || existing.contractId) {
    throw new Error(
      "Имотът не може да бъде изтрит, защото има свързан договор/собственик. Ако наистина искаш да го премахнеш, първо изтрий свързаните записи.",
    );
  }
  const renovationCount = await prisma.renovation.count({
    where: { propertyId: id, deletedAt: null },
  });
  if (renovationCount > 0) {
    throw new Error(
      `Имотът не може да бъде изтрит, защото има ${renovationCount} активни ремонти. Първо изтрийте ремонтите.`,
    );
  }

  const reason = String(formData.get("reason") ?? "").trim() || null;

  await prisma.property.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      deletedById: me.id,
      deleteReason: reason,
      updatedById: me.id,
    },
  });

  await recordAuditEvent({
    actorId: me.id,
    action: "property.deleted",
    targetType: "property",
    targetId: id,
    payload: { reason, building: existing.buildingId, name: existing.name },
  });

  revalidatePath("/properties");
  redirect("/properties");
}

// Assign or clear the Property.owner (link to a Contact). Used by the
// property detail page's Връзки → Собственик row. Narrower than updateProperty
// because it only touches ownerId — no revalidation of the other fields.
//
// Phase-1 workaround: the Contracts module is meant to own this field, but
// since Contracts doesn't exist yet the lock in lib/properties/permissions.ts
// only fires once a contractId is present. Passing `ownerId = null` clears
// the link.
export async function updatePropertyOwner(
  id: string,
  ownerId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const me = await requireProfile();

  const existing = await prisma.property.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) {
    return { ok: false, error: "Имотът не е намерен." };
  }

  if (
    !canEditField(me.role, "ownerId", {
      ownerId: existing.ownerId,
      contractId: existing.contractId,
    })
  ) {
    return {
      ok: false,
      error: isLockedField("ownerId", {
        ownerId: existing.ownerId,
        contractId: existing.contractId,
      })
        ? "Това поле се попълва от модул Договори."
        : "Нямаш права да променяш това поле.",
    };
  }

  // Validate the contact exists (if one was chosen).
  if (ownerId !== null) {
    const contact = await prisma.contact.findUnique({
      where: { id: ownerId },
      select: { id: true },
    });
    if (!contact) {
      return { ok: false, error: "Контактът не е намерен." };
    }
  }

  if (existing.ownerId === ownerId) {
    return { ok: true }; // no-op
  }

  await prisma.property.update({
    where: { id },
    data: { ownerId, updatedById: me.id },
  });

  await recordAuditEvent({
    actorId: me.id,
    action: "property.updated",
    targetType: "property",
    targetId: id,
    before: { ownerId: existing.ownerId },
    after: { ownerId },
  });

  revalidatePath("/properties");
  revalidatePath(`/properties/${id}`);
  return { ok: true };
}

// Duplicate-check helper used by the create form's on-blur validator.
export async function findDuplicateProperty(
  buildingId: string,
  name: string,
  excludeId?: string,
): Promise<{ id: string } | null> {
  await requireProfile();
  const trimmed = name.trim();
  if (!buildingId || !trimmed) return null;
  const dup = await prisma.property.findFirst({
    where: {
      buildingId,
      name: trimmed,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  return dup;
}

