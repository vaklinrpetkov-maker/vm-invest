"use server";

// Inline-edit server actions for the Properties table — one function per field.
// Mirrors the layout used in `app/(app)/contacts/field-actions.ts`,
// `app/(app)/tasks/field-actions.ts`, and `app/(app)/leads/source-actions.ts`
// shipped during the inline-edit foundation round. Each returns a
// discriminated `{ ok }` / `{ ok, error }` so the foundation cells can
// surface rejection in their rollback toast.
//
// Permission gates: per `lib/properties/permissions.ts` (`canEditField`).
// Plain `user`s cannot write `sellers` or any price column; the `description`
// and `type` fields are open team-wide. Owner / contract-locked fields are
// not exposed here — they're managed by Contracts (or the legacy
// `inline-owner-cell.tsx` for the Phase-1 fallback).
//
// `setPropertyStatus` lives in `status-actions.ts` (separate file because it
// also writes to PropertyStatusHistory in the same transaction).

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireProfile } from "@/lib/auth/session";
import {
  isValidPropertyType,
  type PropertyType,
} from "@/lib/properties/constants";
import { canEditField, isLockedField } from "@/lib/properties/permissions";
import { parseSellerInput } from "@/lib/properties/sellers-normalize";
import { prisma } from "@/lib/prisma";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SetFieldResult = { ok: true } | { ok: false; error: string };

// Row shape returned by `loadAndGate`. Typed loosely (Record<string, unknown>
// for the value columns) so each per-field caller can narrow to the column
// it cares about without a generic dance — narrow casts go through `unknown`.
type PropertyRow = {
  id: string;
  ownerId: string | null;
  contractId: string | null;
  deletedAt: Date | null;
} & Record<string, unknown>;

type LoadGateResult =
  | { ok: true; existing: PropertyRow }
  | { ok: false; error: string };

// Shared field-permission gate. Returns the existing property when allowed,
// or a typed error result. Centralised so every per-field action speaks the
// same language and the audit-log call site stays uniform.
async function loadAndGate(
  propertyId: string,
  fieldName: string,
  actorRole: Awaited<ReturnType<typeof requireProfile>>["role"],
): Promise<LoadGateResult> {
  if (!UUID_RE.test(propertyId)) {
    return { ok: false, error: "Невалиден имот." };
  }
  const existing = await prisma.property.findUnique({
    where: { id: propertyId },
  });
  if (!existing || existing.deletedAt) {
    return { ok: false, error: "Имотът не е намерен." };
  }
  if (
    !canEditField(actorRole, fieldName, {
      ownerId: existing.ownerId,
      contractId: existing.contractId,
    })
  ) {
    return {
      ok: false,
      error: isLockedField(fieldName, {
        ownerId: existing.ownerId,
        contractId: existing.contractId,
      })
        ? "Това поле се попълва от модул Договори."
        : "Нямаш права да променяш това поле.",
    };
  }
  return { ok: true, existing: existing as unknown as PropertyRow };
}

// Coerce a Prisma Decimal / Date / boolean / number / string / null / array
// into something JSON-safe for the audit log. Same shape used in actions.ts.
function toJsonSafe(v: unknown): Prisma.InputJsonValue | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.map((x) => toJsonSafe(x)) as Prisma.InputJsonValue;
  if (v instanceof Date) return v.toISOString();
  if (typeof (v as { toString?: unknown }).toString === "function") {
    return (v as { toString: () => string }).toString();
  }
  return null;
}

async function logFieldChange(
  actorId: string,
  propertyId: string,
  field: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  const hdrs = await headers();
  await recordAuditEvent({
    actorId,
    action: "property.updated",
    targetType: "property",
    targetId: propertyId,
    before: { [field]: toJsonSafe(before) } as Prisma.InputJsonValue,
    after: { [field]: toJsonSafe(after) } as Prisma.InputJsonValue,
    payload: { field },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });
}

export async function setPropertyType(
  propertyId: string,
  newType: PropertyType,
): Promise<SetFieldResult> {
  const me = await requireProfile();
  const gate = await loadAndGate(propertyId, "type", me.role);
  if (!gate.ok) return gate;
  const existing = gate.existing as unknown as { type: string };

  if (!isValidPropertyType(newType)) {
    return { ok: false, error: "Невалиден тип." };
  }
  if (existing.type === newType) return { ok: true };

  await prisma.property.update({
    where: { id: propertyId },
    data: { type: newType, updatedById: me.id },
  });

  await logFieldChange(me.id, propertyId, "type", existing.type, newType);

  revalidatePath("/properties");
  revalidatePath(`/properties/${propertyId}`);
  return { ok: true };
}

export async function setPropertyDescription(
  propertyId: string,
  newValue: string | null,
): Promise<SetFieldResult> {
  const me = await requireProfile();
  const gate = await loadAndGate(propertyId, "description", me.role);
  if (!gate.ok) return gate;
  const existing = gate.existing as unknown as { description: string | null };

  const trimmed = (newValue ?? "").trim();
  const next = trimmed.length === 0 ? null : trimmed;
  if (existing.description === next) return { ok: true };

  await prisma.property.update({
    where: { id: propertyId },
    data: { description: next, updatedById: me.id },
  });

  await logFieldChange(me.id, propertyId, "description", existing.description, next);

  revalidatePath("/properties");
  revalidatePath(`/properties/${propertyId}`);
  return { ok: true };
}

// Sellers field accepts a single string and runs `parseSellerInput` to split
// on commas + normalise each piece (rule-based canonicalisation per
// `lib/properties/sellers-normalize.ts`). Empty string clears the array.
export async function setPropertySellers(
  propertyId: string,
  rawInput: string | null,
): Promise<SetFieldResult> {
  const me = await requireProfile();
  const gate = await loadAndGate(propertyId, "sellers", me.role);
  if (!gate.ok) return gate;
  const existing = gate.existing as unknown as { sellers: string[] };

  const nextArr = parseSellerInput(rawInput ?? "");
  // Compare arrays for no-op detection. Same length + same order is enough
  // because parseSellerInput preserves first-occurrence order.
  const sameLength = existing.sellers.length === nextArr.length;
  const sameContent =
    sameLength && existing.sellers.every((s, i) => s === nextArr[i]);
  if (sameContent) return { ok: true };

  await prisma.property.update({
    where: { id: propertyId },
    data: { sellers: nextArr, updatedById: me.id },
  });

  await logFieldChange(me.id, propertyId, "sellers", existing.sellers, nextArr);

  revalidatePath("/properties");
  revalidatePath(`/properties/${propertyId}`);
  return { ok: true };
}

// Generic Decimal-field setter. Used by price fields below — they all share
// the same shape (non-negative, optional, audited as plain string for diff).
async function setDecimalField(
  propertyId: string,
  fieldName: "priceEur" | "expectedPriceEur",
  newValue: number | null,
  actorRoleAndId: { id: string; role: Awaited<ReturnType<typeof requireProfile>>["role"] },
): Promise<SetFieldResult> {
  const gate = await loadAndGate(propertyId, fieldName, actorRoleAndId.role);
  if (!gate.ok) return gate;
  const existing = gate.existing as Record<string, unknown>;

  if (newValue !== null && (!Number.isFinite(newValue) || newValue < 0)) {
    return { ok: false, error: "Невалидна стойност." };
  }

  const beforeRaw = existing[fieldName];
  const beforeStr = beforeRaw == null ? null : String(beforeRaw);
  const nextStr = newValue === null ? null : String(newValue);
  if (beforeStr === nextStr) return { ok: true };

  await prisma.property.update({
    where: { id: propertyId },
    data: {
      [fieldName]: newValue === null ? null : new Prisma.Decimal(newValue),
      updatedById: actorRoleAndId.id,
    },
  });

  await logFieldChange(actorRoleAndId.id, propertyId, fieldName, beforeStr, nextStr);

  revalidatePath("/properties");
  revalidatePath(`/properties/${propertyId}`);
  return { ok: true };
}

export async function setPropertyPriceEur(
  propertyId: string,
  newValue: number | null,
): Promise<SetFieldResult> {
  const me = await requireProfile();
  return setDecimalField(propertyId, "priceEur", newValue, { id: me.id, role: me.role });
}

export async function setPropertyExpectedPriceEur(
  propertyId: string,
  newValue: number | null,
): Promise<SetFieldResult> {
  const me = await requireProfile();
  return setDecimalField(propertyId, "expectedPriceEur", newValue, { id: me.id, role: me.role });
}
