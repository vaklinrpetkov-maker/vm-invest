import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Append-only audit log helper. Failures here must NEVER block the business
// action that triggered them — we log to console and move on.
//
// Action taxonomy (auth-related; broader list will live in specs/_foundations/audit-log.md):
//   auth.invite.sent       auth.invite.redeemed     auth.invite.expired
//   auth.invite.cancelled  auth.invite.resent
//   auth.login.success     auth.login.failed
//   auth.password.reset_requested  auth.password.reset_completed
//   auth.logout            auth.role.changed         auth.account.deactivated
//   auth.bootstrap.first_admin

export type AuditAction =
  // auth.*
  | "auth.invite.sent"
  | "auth.invite.redeemed"
  | "auth.invite.expired"
  | "auth.invite.cancelled"
  | "auth.invite.resent"
  | "auth.login.success"
  | "auth.login.failed"
  | "auth.password.reset_requested"
  | "auth.password.reset_completed"
  | "auth.logout"
  | "auth.role.changed"
  | "auth.account.deactivated"
  | "auth.bootstrap.first_admin"
  // leads.*
  | "leads.create"
  | "leads.update"
  | "leads.delete"
  | "leads.restore"
  | "leads.owner.changed"
  | "leads.status.changed"
  | "leads.source.changed"
  | "leads.converted"
  | "leads.timer.stopped"
  | "leads.timer.escalated"
  | "leads.email.received"
  | "leads.email.parse_failed"
  // meetings.*
  | "meetings.create"
  | "meetings.update"
  | "meetings.cancel"
  | "meetings.restore"
  | "meetings.happened"
  // Granular per-field audit emitted by inline-edit cells. Payload carries
  // `{ field, before, after }` — same shape as `contact.field.updated` /
  // `tasks.field.updated`.
  | "meetings.field.updated"
  // absence.*
  | "absence.request.submit"
  | "absence.request.approve"
  | "absence.request.reject"
  | "absence.request.cancel"
  | "absence.request.cancel_requested"
  | "absence.request.cancel_approved"
  | "absence.request.cancel_rejected"
  | "absence.request.admin_override"
  | "absence.balance.set"
  | "absence.calendar.edit"
  | "absence.calendar.note.update"
  | "absence.calendar.note.delete"
  // properties.*
  | "property.created"
  | "property.updated"
  | "property.deleted"
  | "property.status_changed"
  | "property.seed_flagged"
  | "property.imported"
  | "property.seller_normalized"
  // contracts.*
  | "contract.created"
  | "contract.updated"
  | "contract.deleted"
  | "contract.imported"
  // buildings.*
  | "building.created"
  | "building.updated"
  | "building.deactivated"
  | "building.deleted"
  // contacts.* (additions)
  | "contact.building_migrated"
  | "contact.owner.changed"
  // Generic field update (used by inline-edit cells). The `payload` field
  // carries `{ field, before, after }`; one entry per field change.
  | "contact.field.updated"
  // file attachments — see specs/_foundations/ui-patterns-files.md.
  // The viewer/sign route logs which files were opened and downloaded;
  // the upload/delete actions log mutations.
  | "contracts.attachment.viewed"
  | "contracts.attachment.downloaded"
  | "contracts.attachment.uploaded"
  | "contracts.attachment.deleted"
  | "invoices.attachment.viewed"
  | "invoices.attachment.downloaded"
  | "invoices.uploaded"
  | "invoices.parsed"
  | "invoices.metadata.edited"
  | "invoices.status.changed"
  | "invoices.deleted"
  | "invoices.section.created"
  | "invoices.section.updated"
  | "invoices.section.deactivated"
  // tasks.*
  | "tasks.create"
  | "tasks.update"
  | "tasks.status_changed"
  | "tasks.owner_changed"
  // Granular per-field audit emitted by inline-edit cells. Payload carries
  // `{ field, before, after }` — same shape as `contact.field.updated`.
  | "tasks.field.updated"
  | "tasks.deleted"
  // Activity feed — write events emitted by the shared note actions. The
  // feed renders these in `/admin/audit` like any other action; per-record
  // feed surfaces synthesise them back into their parent record's stream.
  // Payload carries `{ targetType, targetId, hasParent?, mentionsAdded?,
  // mentionsRemoved?, by? }` depending on the variant. Body diffs go in
  // `before/after` for `activity.note.edited` per audit-log.md §4.1.
  | "activity.note.created"
  | "activity.note.edited"
  | "activity.note.deleted"
  // renovation.* — see specs/renovations.md §8
  | "renovation.created"
  | "renovation.updated"
  | "renovation.deleted"
  // Granular per-field audit emitted by inline-edit cells (added in
  // a later round once tasks become inline-editable). Payload carries
  // `{ field, before, after }` — same shape as `contact.field.updated`.
  | "renovation.field.updated"
  | "renovation.status_changed"
  | "renovation.task.created"
  | "renovation.task.updated"
  | "renovation.task.status_changed"
  | "renovation.task.deleted"
  // RenovationActivity events — replace RenovationTask events in the
  // template-driven model (`specs/renovations.md` §3.4 + §10). Payloads:
  // `created` carries `{ templateId, sortOrder }`; `reordered` carries
  // `{ before: [...ids], after: [...ids] }`; `rechained` carries
  // `{ count, fromDate, toDate }`. Per-field updates go through
  // `renovation.activity.updated` with `{ field, before, after }`.
  | "renovation.activity.created"
  | "renovation.activity.updated"
  | "renovation.activity.status_changed"
  | "renovation.activity.deleted"
  | "renovation.activity.reordered"
  | "renovation.activity.rechained"
  // Renovations catalog (admin-only) — `specs/renovations.md` §9 + §10.
  | "team.created"
  | "team.updated"
  | "team.deleted"
  | "activity_template.created"
  | "activity_template.updated"
  | "activity_template.deleted"
  | "activity_template.reordered";

type LogInput = {
  actorId?: string | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  payload?: Prisma.InputJsonValue;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
};

export async function recordAuditEvent(input: LogInput): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        payload: input.payload ?? undefined,
        before: input.before ?? undefined,
        after: input.after ?? undefined,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] failed to record event", { action: input.action, err });
  }
}
