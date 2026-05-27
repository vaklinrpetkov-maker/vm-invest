"use server";

// Inline-edit server action for changing a Property's status. Mirrors the
// transaction pattern in `updateProperty` (actions.ts) so per-status-change
// invariants stay in one place: every status change writes one row to
// `PropertyStatusHistory` atomically with the property update.
//
// Permission model (per specs/properties.md §5.2 + lib/properties/permissions.ts):
// status is not in the USER_RESTRICTED_FIELDS set, so all signed-in roles can
// change it. The action does not need a role gate beyond requireProfile().

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  isValidPropertyStatus,
  type PropertyStatus,
} from "@/lib/properties/constants";
import { writeStatusChange } from "@/lib/properties/status-history";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SetPropertyStatusResult =
  | { ok: true }
  | { ok: false; error: string };

export async function setPropertyStatus(
  propertyId: string,
  newStatus: PropertyStatus,
): Promise<SetPropertyStatusResult> {
  const me = await requireProfile();

  if (!UUID_RE.test(propertyId)) {
    return { ok: false, error: "Невалиден имот." };
  }
  if (!isValidPropertyStatus(newStatus)) {
    return { ok: false, error: "Невалиден статус." };
  }

  const existing = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, status: true, deletedAt: true },
  });
  if (!existing || existing.deletedAt) {
    return { ok: false, error: "Имотът не е намерен." };
  }
  if (existing.status === newStatus) {
    return { ok: true };
  }

  await prisma.$transaction(async (tx) => {
    await tx.property.update({
      where: { id: propertyId },
      data: { status: newStatus, updatedById: me.id },
    });
    await writeStatusChange({
      propertyId,
      fromStatus: existing.status,
      toStatus: newStatus,
      authorId: me.id,
      tx,
    });
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: me.id,
    action: "property.status_changed",
    targetType: "property",
    targetId: propertyId,
    payload: { from: existing.status, to: newStatus },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/properties");
  revalidatePath(`/properties/${propertyId}`);

  return { ok: true };
}
