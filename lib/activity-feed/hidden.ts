// Audit actions that should NOT surface in per-record activity feeds.
//
// Per `specs/_foundations/activity-feed.md` §6.2: some audit events are
// useful in `/admin/audit` (forensic) but would be noise inside the
// per-record feed surface where the team narrates a record's story.
//
// The set is global — keeping it per-module override-able adds complexity
// without much win at current scale. Re-evaluate when a module argues for
// surfacing one of these.

import type { AuditAction } from "@/lib/auth/audit";

export const HIDDEN_ACTIONS: ReadonlySet<AuditAction> = new Set<AuditAction>([
  // File-view events: opening a PDF is a read action, not a narrative beat.
  // The team doesn't need a feed entry every time someone clicks View.
  "contracts.attachment.viewed",
  "invoices.attachment.viewed",
  // Import-batch events: bulk operations, not per-record interesting.
  "property.imported",
  "contract.imported",
  "invoices.parsed",
  // Timer ticks: better surfaced in the lead inbox + the timer column
  // than as feed entries (otherwise every escalated lead gets a noisy row).
  "leads.timer.escalated",
  // Activity-feed self-emissions: posting a note IS the feed entry; the
  // matching `activity.note.created` audit event would be a duplicate.
  // Same for edited / deleted — the note's own `editedAt` / soft-delete
  // state is the user-facing signal.
  "activity.note.created",
  "activity.note.edited",
  "activity.note.deleted",
]);

export function isHiddenAction(action: string): boolean {
  return HIDDEN_ACTIONS.has(action as AuditAction);
}
