import type { Role } from "@prisma/client";

// Field-level write permissions for Property. Source of truth for both the
// server action (which enforces) and the client table (which renders read-only
// cells when it knows a field is off-limits). See specs/properties.md §5.2.

// Fields that plain `user`s cannot write. Admin and manager can write
// everything that isn't locked.
const USER_RESTRICTED_FIELDS = new Set<string>([
  // Both spellings during the seller→sellers migration so older callers and
  // newer ones share the same restriction.
  "seller",
  "sellers",
  "expectedPriceEur",
  "priceEur",
  "yardTerracePriceEur",
  "priceBgnOriginal",
  "expectedPriceBgnOriginal",
  "yardTerracePriceBgnOriginal",
]);

type LockContext = {
  ownerId: string | null;
  contractId: string | null;
};

// Fields that are populated by the Contracts module in Phase 2 and therefore
// not editable from the Properties module once a contract exists.
//
// `owner` is a special case: the spec (specs/properties.md §3.1 + §5.2)
// originally locked it unconditionally, reserving it for Contracts. But until
// Contracts ships there's no other way to connect a contact to a property,
// which leaves the system unable to express ownership at all. So we relax
// the lock: the owner is editable when there's no linked contract yet, and
// re-locks automatically the moment a contract is tied. That way the Phase-2
// Contracts module still owns the field without us having to back it out.
//
// `contract` stays locked unconditionally — there's no Contracts table to
// point at yet, so there's nothing to set.
//
// `buyerLabel` and `contractLabel` are legacy free-text from the CSV. They
// only lock once a "real" link exists (owner / contract), matching the spec.
export function isLockedField(fieldName: string, ctx: LockContext): boolean {
  if (fieldName === "owner" || fieldName === "ownerId") {
    return ctx.contractId !== null;
  }
  if (fieldName === "contract" || fieldName === "contractId") return true;
  if (fieldName === "buyerLabel" && ctx.ownerId !== null) return true;
  if (fieldName === "contractLabel" && ctx.contractId !== null) return true;
  return false;
}

// True = the current user can edit this field on this specific property.
export function canEditField(role: Role, fieldName: string, ctx: LockContext): boolean {
  if (isLockedField(fieldName, ctx)) return false;
  if (role === "admin" || role === "manager") return true;
  return !USER_RESTRICTED_FIELDS.has(fieldName);
}

// Convenience flags for the list table, resolved server-side and passed to
// the client component as plain booleans (avoids sending per-row role logic).
export type PropertyFieldPermissions = {
  canWritePrices: boolean;
  canWriteSeller: boolean;
};

export function resolveFieldPermissions(role: Role): PropertyFieldPermissions {
  return {
    canWritePrices: role === "admin" || role === "manager",
    canWriteSeller: role === "admin" || role === "manager",
  };
}

export function canDeleteProperty(role: Role): boolean {
  return role === "admin";
}
