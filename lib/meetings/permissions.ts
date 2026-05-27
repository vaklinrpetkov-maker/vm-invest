import type { Role } from "@prisma/client";

// Meeting edit-permission helper. Source of truth for both the server actions
// (which enforce on every mutation) and the page-side computation that
// disables inline-edit cells for users who can't edit.
//
// Rules per specs/meetings.md §4.1:
//   - Admin and manager can edit any meeting.
//   - Other roles can edit only meetings they're assigned to.
//   - Cancelled meetings are read-only for everyone via the edit paths
//     (use the dedicated `restoreMeeting` flow to bring back).
//
// This file previously held the helper as a private function inside
// `app/(app)/meetings/[id]/actions.ts`; promoted so the inline-edit
// `field-actions.ts` and the list page can share one source.

export function canEditMeeting(
  role: Role,
  assigneeIds: readonly string[],
  meId: string,
): boolean {
  if (role === "admin" || role === "manager") return true;
  return assigneeIds.includes(meId);
}
