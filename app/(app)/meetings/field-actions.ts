"use server";

// Per-field inline-edit server actions for the Meetings table.
//
// Scope choice: we deliberately do **not** include a `setMeetingStatus`
// action here, even though status is an enum and would fit the pattern.
// Reason: status transitions go through `markMeetingHappened` and
// `cancelMeeting` (in `app/(app)/meetings/[id]/actions.ts`), which capture
// metadata (`happened_outcome`, `cancel_reason`, who marked, when). A naive
// inline status flip would skip those — better to keep status changes in
// the dedicated flows.
//
// Permissions (per specs/meetings.md): any signed-in profile can edit a
// meeting they can see. Soft-deleted (cancelled) meetings are read-only via
// these actions — the inline cell renders, but the field-actions guard the
// write.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { MeetingType } from "@prisma/client";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireProfile } from "@/lib/auth/session";
import { sofiaWallClockToUtc } from "@/lib/meetings/parse";
import { canEditMeeting } from "@/lib/meetings/permissions";
import { prisma } from "@/lib/prisma";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATETIME_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const VALID_TYPES: ReadonlySet<MeetingType> = new Set([
  "office_presentation",
  "onsite_presentation",
  "contract_signing",
  "follow_up",
  "other",
]);

export type SetFieldResult = { ok: true } | { ok: false; error: string };

async function loadAndAuthorize(
  meetingId: string,
  actorId: string,
  actorRole: "admin" | "manager" | "user",
): Promise<
  | {
      ok: true;
      before: {
        startsAt: Date;
        type: MeetingType;
        location: string | null;
        status: string;
      };
    }
  | { ok: false; error: string }
> {
  if (!UUID_RE.test(meetingId)) {
    return { ok: false, error: "Невалидна среща." };
  }
  const row = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      startsAt: true,
      type: true,
      location: true,
      status: true,
      assignees: { select: { profileId: true } },
    },
  });
  if (!row) return { ok: false, error: "Срещата не съществува." };
  // Spec §4.2: cancelled meetings can't be directly edited. Restore first.
  if (row.status === "cancelled") {
    return {
      ok: false,
      error: "Отменените срещи не могат да се редактират директно.",
    };
  }
  const assigneeIds = row.assignees.map((a) => a.profileId);
  if (!canEditMeeting(actorRole, assigneeIds, actorId)) {
    return { ok: false, error: "Нямате право да редактирате тази среща." };
  }
  return {
    ok: true,
    before: {
      startsAt: row.startsAt,
      type: row.type,
      location: row.location,
      status: row.status,
    },
  };
}

async function logFieldChange(
  actorId: string,
  meetingId: string,
  field: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  const hdrs = await headers();
  await recordAuditEvent({
    actorId,
    action: "meetings.field.updated",
    targetType: "meeting",
    targetId: meetingId,
    payload: { field },
    before: { [field]: before as never } as never,
    after: { [field]: after as never } as never,
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });
}

function revalidateMeetings(meetingId: string): void {
  revalidatePath("/meetings");
  revalidatePath("/meetings/calendar");
  revalidatePath(`/meetings/${meetingId}`);
}

export async function setMeetingStartsAt(
  meetingId: string,
  newIso: string | null,
): Promise<SetFieldResult> {
  const me = await requireProfile();
  const loaded = await loadAndAuthorize(meetingId, me.id, me.role);
  if (!loaded.ok) return loaded;

  // startsAt is required for a meeting — clearing it doesn't make sense.
  // Reject null inputs (the inline-datetime-cell allows clearing for
  // optional fields, but this field is not optional).
  if (newIso === null || newIso.length === 0) {
    return { ok: false, error: "Час и дата на срещата са задължителни." };
  }
  if (!ISO_DATETIME_LOCAL_RE.test(newIso)) {
    return { ok: false, error: "Невалиден формат на датата/часа." };
  }
  // The user picks the wall-clock in Europe/Sofia (per CLAUDE.md locale).
  // `sofiaWallClockToUtc` converts that to the right UTC instant regardless
  // of the server's own timezone. Same helper the create/edit form uses.
  const next = sofiaWallClockToUtc(newIso);
  if (!next) {
    return { ok: false, error: "Невалидна дата/час." };
  }

  if (loaded.before.startsAt.getTime() === next.getTime()) return { ok: true };

  await prisma.meeting.update({
    where: { id: meetingId },
    data: { startsAt: next },
  });
  await logFieldChange(
    me.id,
    meetingId,
    "startsAt",
    loaded.before.startsAt.toISOString(),
    next.toISOString(),
  );
  revalidateMeetings(meetingId);
  return { ok: true };
}

export async function setMeetingType(
  meetingId: string,
  newType: MeetingType,
): Promise<SetFieldResult> {
  const me = await requireProfile();
  const loaded = await loadAndAuthorize(meetingId, me.id, me.role);
  if (!loaded.ok) return loaded;

  if (!VALID_TYPES.has(newType)) {
    return { ok: false, error: "Невалиден тип." };
  }
  if (loaded.before.type === newType) return { ok: true };

  await prisma.meeting.update({
    where: { id: meetingId },
    data: { type: newType },
  });
  await logFieldChange(me.id, meetingId, "type", loaded.before.type, newType);
  revalidateMeetings(meetingId);
  return { ok: true };
}

export async function setMeetingLocation(
  meetingId: string,
  newValue: string | null,
): Promise<SetFieldResult> {
  const me = await requireProfile();
  const loaded = await loadAndAuthorize(meetingId, me.id, me.role);
  if (!loaded.ok) return loaded;

  const next = newValue && newValue.trim().length > 0 ? newValue.trim() : null;
  if (next && next.length > 500) {
    return { ok: false, error: "Локацията е твърде дълга." };
  }
  if (loaded.before.location === next) return { ok: true };

  await prisma.meeting.update({
    where: { id: meetingId },
    data: { location: next },
  });
  await logFieldChange(me.id, meetingId, "location", loaded.before.location, next);
  revalidateMeetings(meetingId);
  return { ok: true };
}

// Replace the meeting's full assignee set with `nextIds`. Mirrors the diff
// pattern in `updateMeeting`: compute add/remove against the current set
// and run as a single Prisma update with create/deleteMany clauses.
//
// Validation rules (mirror parseMeetingFormData):
//   - At least one assignee required.
//   - All provided profileIds must exist and be active.
//
// Permission: standard `canEditMeeting` gate. The user removing themselves
// is allowed (the form does the same — `updateMeeting`); we just enforce
// that ≥1 assignee remains.
export async function setMeetingAssignees(
  meetingId: string,
  nextIds: string[],
): Promise<SetFieldResult> {
  const me = await requireProfile();

  if (!Array.isArray(nextIds) || nextIds.length === 0) {
    return { ok: false, error: "Минимум 1 участник е задължителен." };
  }
  if (nextIds.some((id) => !UUID_RE.test(id))) {
    return { ok: false, error: "Невалиден участник." };
  }
  const desired = new Set(nextIds);

  const loaded = await loadAndAuthorize(meetingId, me.id, me.role);
  if (!loaded.ok) return loaded;

  // Verify every id is a real, active profile.
  const profiles = await prisma.profile.findMany({
    where: { id: { in: [...desired] } },
    select: { id: true, active: true },
  });
  if (profiles.length !== desired.size) {
    return { ok: false, error: "Един или повече участници не съществуват." };
  }
  if (profiles.some((p) => !p.active)) {
    return { ok: false, error: "Не може да добавите деактивиран участник." };
  }

  const currentRows = await prisma.meetingAssignee.findMany({
    where: { meetingId },
    select: { profileId: true },
  });
  const current = new Set(currentRows.map((r) => r.profileId));
  const toAdd = [...desired].filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !desired.has(id));

  if (toAdd.length === 0 && toRemove.length === 0) return { ok: true };

  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      assignees: {
        deleteMany: toRemove.length ? { profileId: { in: toRemove } } : undefined,
        create: toAdd.map((profileId) => ({ profileId })),
      },
    },
  });

  await logFieldChange(
    me.id,
    meetingId,
    "assigneeIds",
    [...current],
    [...desired],
  );
  revalidateMeetings(meetingId);
  return { ok: true };
}

// Duration in whole minutes. Same bounds as parseMeetingFormData (0–720 min,
// i.e. up to 12 hours). The inline cell rejects null (clearing) — we keep
// duration required, mirroring the form behavior.
export async function setMeetingDuration(
  meetingId: string,
  newMinutes: number | null,
): Promise<SetFieldResult> {
  const me = await requireProfile();

  if (newMinutes === null) {
    return { ok: false, error: "Продължителността е задължителна." };
  }
  if (!Number.isFinite(newMinutes) || !Number.isInteger(newMinutes)) {
    return { ok: false, error: "Продължителността трябва да е цяло число." };
  }
  if (newMinutes < 0 || newMinutes > 720) {
    return { ok: false, error: "Продължителността трябва да е между 0 и 720 минути." };
  }

  // Authorize after the cheap validations so we don't waste a DB lookup on
  // bad input.
  const loaded = await loadAndAuthorize(meetingId, me.id, me.role);
  if (!loaded.ok) return loaded;

  // Re-load duration field for diff (loadAndAuthorize doesn't carry it).
  const current = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { durationMinutes: true },
  });
  if (!current) return { ok: false, error: "Срещата не съществува." };
  if (current.durationMinutes === newMinutes) return { ok: true };

  await prisma.meeting.update({
    where: { id: meetingId },
    data: { durationMinutes: newMinutes },
  });
  await logFieldChange(
    me.id,
    meetingId,
    "durationMinutes",
    current.durationMinutes,
    newMinutes,
  );
  revalidateMeetings(meetingId);
  return { ok: true };
}
