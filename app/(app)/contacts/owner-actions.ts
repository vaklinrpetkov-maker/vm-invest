"use server";

// Inline-edit server action for assigning a Contact's owner. Called by the
// `<InlinePersonCell>` on the contacts table. Returns a discriminated result
// rather than throwing, because the cell uses the error message in its
// rollback toast (see `components/ui/inline-person-cell.tsx`).
//
// Permission model: per specs/contacts.md §5.2 + roles.md §3.1, "edit a
// contact" applies to all three roles, so any signed-in profile can reassign.
// The role check is still enforced server-side (never trust the UI alone).

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SetContactOwnerResult = { ok: true } | { ok: false; error: string };

export async function setContactOwner(
  contactId: string,
  ownerId: string | null,
): Promise<SetContactOwnerResult> {
  const actor = await requireProfile();

  if (typeof contactId !== "string" || !UUID_RE.test(contactId)) {
    return { ok: false, error: "Невалиден контакт." };
  }
  if (ownerId !== null && (typeof ownerId !== "string" || !UUID_RE.test(ownerId))) {
    return { ok: false, error: "Невалиден отговорник." };
  }

  const before = await prisma.contact.findUnique({
    where: { id: contactId },
    select: {
      ownerId: true,
      owner: { select: { fullName: true } },
    },
  });
  if (!before) {
    return { ok: false, error: "Контактът не съществува." };
  }

  // Validate the new owner exists and is active. We don't allow assigning to
  // a deactivated profile — see UI spec note in `inline-person-cell.tsx`.
  let afterName: string | null = null;
  if (ownerId !== null) {
    const profile = await prisma.profile.findUnique({
      where: { id: ownerId },
      select: { id: true, active: true, fullName: true },
    });
    if (!profile) {
      return { ok: false, error: "Отговорникът не съществува." };
    }
    if (!profile.active) {
      return { ok: false, error: "Отговорникът е деактивиран." };
    }
    afterName = profile.fullName;
  }

  // No-op short-circuit: returning ok without writing keeps the audit log
  // free of noise from idempotent saves (e.g. picking the same option).
  if (before.ownerId === ownerId) {
    return { ok: true };
  }

  await prisma.contact.update({
    where: { id: contactId },
    data: { ownerId },
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    action: "contact.owner.changed",
    targetType: "contact",
    targetId: contactId,
    before: {
      ownerId: before.ownerId,
      ownerName: before.owner?.fullName ?? null,
    },
    after: {
      ownerId,
      ownerName: afterName,
    },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);

  return { ok: true };
}
