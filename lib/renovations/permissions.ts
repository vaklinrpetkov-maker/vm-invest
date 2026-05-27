import type { Role } from "@prisma/client";

// Field-level + record-level permissions for Renovations. Source of truth
// for both the server actions (which enforce) and the UI (which hides /
// disables affordances). Per `specs/renovations.md` §7.

// Open creation across all roles — matches the open-creation stance of every
// other module. Signature takes the role so future tightening doesn't break
// callers; right now all branches return true.
export function canCreateRenovation(role: Role): boolean {
  return role === "admin" || role === "manager" || role === "user";
}

// Admin + manager edit any renovation. User edits only when assigned as
// the responsible manager. Same shape as `canEditField` on Properties.
export function canEditRenovation(
  role: Role,
  managerId: string | null,
  viewerProfileId: string,
): boolean {
  if (role === "admin" || role === "manager") return true;
  // `user` only when they're the responsible manager.
  return managerId !== null && managerId === viewerProfileId;
}

// Admin-only delete (soft). Manager+ never deletes — that's deliberate; a
// renovation soft-delete is a permanent operational decision and we want it
// behind the admin role even if managers can do everything else.
export function canDeleteRenovation(role: Role): boolean {
  return role === "admin";
}

// Catalog admin pages (`/admin/renovations/teams` + `/admin/renovations/
// activities`). Admin-only — see `specs/renovations.md` §7 + §9.
export function canManageRenovationCatalog(role: Role): boolean {
  return role === "admin";
}

// `canEditRenovationTask` removed 20.05.2026 (Round 5) — `RenovationTask`
// is gone. Activity-level edits go through `canEditRenovation` since
// `RenovationActivity` has no per-row assignee (locked spec §7).
