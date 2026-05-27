"use server";

// Per-field inline-edit server actions for the Contacts table. Each action
// validates its single field, writes, audit-logs, and revalidates. Pattern
// mirrors `setContactOwner` in `./owner-actions.ts`.
//
// Permissions: per specs/contacts.md §5.2 + roles.md §3.1, "edit a contact"
// applies to all three roles. The actions enforce `requireProfile()` only.
//
// Validation: returns `{ ok: false, error }` for the inline cell to surface
// in its rollback toast. The cell flips back to the previous value on the
// client; nothing partial sticks.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireProfile } from "@/lib/auth/session";
import { checkBgId } from "@/lib/bg-id";
import { CONTACT_TYPES } from "@/lib/contacts/constants";
import { prisma } from "@/lib/prisma";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_TYPES: ReadonlySet<string> = new Set(CONTACT_TYPES);

export type SetFieldResult = { ok: true } | { ok: false; error: string };

// ─── Shared helpers ────────────────────────────────────────────────────────

async function loadOrError(
  contactId: string,
): Promise<
  | { ok: true; before: Record<string, unknown> }
  | { ok: false; error: string }
> {
  if (!UUID_RE.test(contactId)) {
    return { ok: false, error: "Невалиден контакт." };
  }
  const before = await prisma.contact.findUnique({
    where: { id: contactId },
    select: {
      fullName: true,
      type: true,
      phone: true,
      email: true,
      egn: true,
      address: true,
      birthDate: true,
      properties: true,
      notes: true,
      buildingId: true,
    },
  });
  if (!before) return { ok: false, error: "Контактът не съществува." };
  return { ok: true, before: before as Record<string, unknown> };
}

async function logFieldChange(
  actorId: string,
  contactId: string,
  field: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  const hdrs = await headers();
  await recordAuditEvent({
    actorId,
    action: "contact.field.updated",
    targetType: "contact",
    targetId: contactId,
    payload: { field },
    before: { [field]: before as never } as never,
    after: { [field]: after as never } as never,
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });
}

function revalidateContacts(contactId: string): void {
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
}

// ─── Actions ───────────────────────────────────────────────────────────────

export async function setContactName(
  contactId: string,
  newValue: string | null,
): Promise<SetFieldResult> {
  const me = await requireProfile();
  const loaded = await loadOrError(contactId);
  if (!loaded.ok) return loaded;

  // fullName is required.
  const trimmed = (newValue ?? "").trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Името е задължително." };
  }
  if (trimmed.length > 200) {
    return { ok: false, error: "Името е твърде дълго (макс. 200 символа)." };
  }

  if (loaded.before.fullName === trimmed) return { ok: true };

  await prisma.contact.update({
    where: { id: contactId },
    data: { fullName: trimmed },
  });
  await logFieldChange(me.id, contactId, "fullName", loaded.before.fullName, trimmed);
  revalidateContacts(contactId);
  return { ok: true };
}

export async function setContactType(
  contactId: string,
  newValue: string,
): Promise<SetFieldResult> {
  const me = await requireProfile();
  const loaded = await loadOrError(contactId);
  if (!loaded.ok) return loaded;

  if (!VALID_TYPES.has(newValue)) {
    return { ok: false, error: "Невалиден тип." };
  }
  if (loaded.before.type === newValue) return { ok: true };

  await prisma.contact.update({
    where: { id: contactId },
    data: { type: newValue },
  });
  await logFieldChange(me.id, contactId, "type", loaded.before.type, newValue);
  revalidateContacts(contactId);
  return { ok: true };
}

export async function setContactPhone(
  contactId: string,
  newValue: string | null,
): Promise<SetFieldResult> {
  const me = await requireProfile();
  const loaded = await loadOrError(contactId);
  if (!loaded.ok) return loaded;

  // Phone is free-text. Don't validate format — Bulgarian phone formatting
  // varies (with/without country code, dashes, spaces) and the team writes
  // them however they're written down.
  const next = newValue && newValue.trim().length > 0 ? newValue.trim() : null;
  if (next && next.length > 50) {
    return { ok: false, error: "Телефонът е твърде дълъг." };
  }
  if (loaded.before.phone === next) return { ok: true };

  await prisma.contact.update({
    where: { id: contactId },
    data: { phone: next },
  });
  await logFieldChange(me.id, contactId, "phone", loaded.before.phone, next);
  revalidateContacts(contactId);
  return { ok: true };
}

export async function setContactEmail(
  contactId: string,
  newValue: string | null,
): Promise<SetFieldResult> {
  const me = await requireProfile();
  const loaded = await loadOrError(contactId);
  if (!loaded.ok) return loaded;

  const next = newValue && newValue.trim().length > 0 ? newValue.trim() : null;
  if (next !== null) {
    if (next.length > 200) {
      return { ok: false, error: "Имейлът е твърде дълъг." };
    }
    if (!EMAIL_RE.test(next)) {
      return { ok: false, error: "Невалиден имейл." };
    }
  }
  if (loaded.before.email === next) return { ok: true };

  await prisma.contact.update({
    where: { id: contactId },
    data: { email: next },
  });
  await logFieldChange(me.id, contactId, "email", loaded.before.email, next);
  revalidateContacts(contactId);
  return { ok: true };
}

export async function setContactEgn(
  contactId: string,
  newValue: string | null,
): Promise<SetFieldResult> {
  const me = await requireProfile();
  const loaded = await loadOrError(contactId);
  if (!loaded.ok) return loaded;

  const next = newValue && newValue.trim().length > 0 ? newValue.trim() : null;
  if (next !== null) {
    const check = checkBgId(next);
    if (!check.ok) {
      // Per specs/contacts.md §6, ЕГН checksum failure is a non-blocking
      // warning — we still let it through, but other format/length errors
      // are real validation failures.
      if (check.reason !== "checksum") {
        return {
          ok: false,
          error:
            check.reason === "format"
              ? "ЕГН/ЕИК трябва да съдържа само цифри."
              : "ЕГН/ЕИК трябва да е 9 или 10 цифри.",
        };
      }
    }
  }
  if (loaded.before.egn === next) return { ok: true };

  await prisma.contact.update({
    where: { id: contactId },
    data: { egn: next },
  });
  await logFieldChange(me.id, contactId, "egn", loaded.before.egn, next);
  revalidateContacts(contactId);
  return { ok: true };
}

export async function setContactAddress(
  contactId: string,
  newValue: string | null,
): Promise<SetFieldResult> {
  const me = await requireProfile();
  const loaded = await loadOrError(contactId);
  if (!loaded.ok) return loaded;

  const next = newValue && newValue.trim().length > 0 ? newValue.trim() : null;
  if (next && next.length > 500) {
    return { ok: false, error: "Адресът е твърде дълъг." };
  }
  if (loaded.before.address === next) return { ok: true };

  await prisma.contact.update({
    where: { id: contactId },
    data: { address: next },
  });
  await logFieldChange(me.id, contactId, "address", loaded.before.address, next);
  revalidateContacts(contactId);
  return { ok: true };
}

export async function setContactProperties(
  contactId: string,
  newValue: string | null,
): Promise<SetFieldResult> {
  const me = await requireProfile();
  const loaded = await loadOrError(contactId);
  if (!loaded.ok) return loaded;

  const next = newValue && newValue.trim().length > 0 ? newValue.trim() : null;
  if (next && next.length > 1000) {
    return { ok: false, error: "Текстът е твърде дълъг." };
  }
  if (loaded.before.properties === next) return { ok: true };

  await prisma.contact.update({
    where: { id: contactId },
    data: { properties: next },
  });
  await logFieldChange(
    me.id,
    contactId,
    "properties",
    loaded.before.properties,
    next,
  );
  revalidateContacts(contactId);
  return { ok: true };
}

export async function setContactNotes(
  contactId: string,
  newValue: string | null,
): Promise<SetFieldResult> {
  const me = await requireProfile();
  const loaded = await loadOrError(contactId);
  if (!loaded.ok) return loaded;

  const next = newValue && newValue.trim().length > 0 ? newValue : null;
  if (next && next.length > 5000) {
    return { ok: false, error: "Бележките са твърде дълги." };
  }
  if (loaded.before.notes === next) return { ok: true };

  await prisma.contact.update({
    where: { id: contactId },
    data: { notes: next },
  });
  await logFieldChange(me.id, contactId, "notes", loaded.before.notes, next);
  revalidateContacts(contactId);
  return { ok: true };
}

export async function setContactBirthDate(
  contactId: string,
  newIso: string | null,
): Promise<SetFieldResult> {
  const me = await requireProfile();
  const loaded = await loadOrError(contactId);
  if (!loaded.ok) return loaded;

  let next: Date | null = null;
  if (newIso !== null && newIso.length > 0) {
    if (!ISO_DATE_RE.test(newIso)) {
      return { ok: false, error: "Невалидна дата." };
    }
    next = new Date(`${newIso}T00:00:00Z`);
    if (Number.isNaN(next.getTime())) {
      return { ok: false, error: "Невалидна дата." };
    }
    // Sanity: birth date in the future is almost certainly a typo.
    if (next.getTime() > Date.now()) {
      return { ok: false, error: "Рождената дата не може да е в бъдещето." };
    }
  }

  const beforeIso =
    loaded.before.birthDate instanceof Date
      ? (loaded.before.birthDate as Date).toISOString().slice(0, 10)
      : null;
  const nextIso = next ? next.toISOString().slice(0, 10) : null;
  if (beforeIso === nextIso) return { ok: true };

  await prisma.contact.update({
    where: { id: contactId },
    data: { birthDate: next },
  });
  await logFieldChange(me.id, contactId, "birthDate", beforeIso, nextIso);
  revalidateContacts(contactId);
  return { ok: true };
}

export async function setContactBuilding(
  contactId: string,
  buildingId: string | null,
): Promise<SetFieldResult> {
  const me = await requireProfile();
  const loaded = await loadOrError(contactId);
  if (!loaded.ok) return loaded;

  if (buildingId !== null && !UUID_RE.test(buildingId)) {
    return { ok: false, error: "Невалидна сграда." };
  }
  if (buildingId !== null) {
    const building = await prisma.building.findUnique({
      where: { id: buildingId },
      select: { id: true, active: true },
    });
    if (!building || !building.active) {
      return { ok: false, error: "Сградата не е намерена или е деактивирана." };
    }
  }
  if (loaded.before.buildingId === buildingId) return { ok: true };

  await prisma.contact.update({
    where: { id: contactId },
    data: { buildingId },
  });
  await logFieldChange(
    me.id,
    contactId,
    "buildingId",
    loaded.before.buildingId,
    buildingId,
  );
  revalidateContacts(contactId);
  return { ok: true };
}
