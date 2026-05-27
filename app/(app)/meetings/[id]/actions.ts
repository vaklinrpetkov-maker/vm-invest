"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { MeetingFormState } from "@/app/(app)/meetings/meeting-form";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireProfile } from "@/lib/auth/session";
import { RESTORE_WINDOW_DAYS } from "@/lib/meetings/constants";
import { parseMeetingFormData } from "@/lib/meetings/parse";
import { canEditMeeting } from "@/lib/meetings/permissions";
import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateMeeting(
  meetingId: string,
  _prev: MeetingFormState,
  formData: FormData,
): Promise<MeetingFormState> {
  const actor = await requireProfile();

  const existing = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { assignees: { select: { profileId: true } } },
  });
  if (!existing) return { errors: { form: "Срещата не съществува." } };
  if (existing.status === "cancelled") {
    return { errors: { form: "Отменените срещи не могат да се редактират директно." } };
  }
  const assigneeIds = existing.assignees.map((a) => a.profileId);
  if (!canEditMeeting(actor.role, assigneeIds, actor.id)) {
    return { errors: { form: "Нямате право да редактирате тази среща." } };
  }

  const parsed = await parseMeetingFormData(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  // Phase 1: leadId is read-only after creation — use the existing value.
  const leadId = existing.leadId;

  // Diff assignees — add new, remove missing. Creator always stays assigned
  // unless they've removed themselves deliberately: we respect their choice
  // as long as at least one assignee remains (parser already enforced ≥1).
  const desired = new Set(parsed.data.assigneeIds);
  const current = new Set(assigneeIds);
  const toAdd = [...desired].filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !desired.has(id));

  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      startsAt: parsed.data.startsAt,
      durationMinutes: parsed.data.durationMinutes,
      type: parsed.data.type,
      location: parsed.data.location,
      notes: parsed.data.notes,
      assignees: {
        deleteMany: toRemove.length
          ? { profileId: { in: toRemove } }
          : undefined,
        create: toAdd.map((profileId) => ({ profileId })),
      },
    },
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    action: "meetings.update",
    targetType: "meeting",
    targetId: meetingId,
    before: {
      startsAt: existing.startsAt.toISOString(),
      durationMinutes: existing.durationMinutes,
      type: existing.type,
      location: existing.location,
      notes: existing.notes,
      assigneeIds,
    },
    after: {
      startsAt: parsed.data.startsAt.toISOString(),
      durationMinutes: parsed.data.durationMinutes,
      type: parsed.data.type,
      location: parsed.data.location,
      notes: parsed.data.notes,
      assigneeIds: parsed.data.assigneeIds,
    },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  // Silence lint
  void leadId;

  revalidatePath(`/meetings/${meetingId}`);
  revalidatePath("/meetings");
  redirect(`/meetings/${meetingId}`);
}

// Soft delete (cancel). Same permissions as edit. Optional reason.
export async function cancelMeeting(formData: FormData): Promise<void> {
  const actor = await requireProfile();
  const meetingId = String(formData.get("meetingId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!meetingId) throw new Error("Невалидна заявка.");

  const existing = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { assignees: { select: { profileId: true } } },
  });
  if (!existing) throw new Error("Срещата не съществува.");
  if (existing.status === "cancelled") redirect("/meetings");

  const assigneeIds = existing.assignees.map((a) => a.profileId);
  if (!canEditMeeting(actor.role, assigneeIds, actor.id)) {
    throw new Error("Нямате право да отменяте тази среща.");
  }

  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      status: "cancelled",
      cancelledAt: new Date(),
      cancelledById: actor.id,
      cancelReason: reason,
    },
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    action: "meetings.cancel",
    targetType: "meeting",
    targetId: meetingId,
    payload: { reason },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/meetings");
  redirect(`/meetings/${meetingId}`);
}

// Restore cancelled meeting. Assignees/managers within 30 days; admin anytime.
export async function restoreMeeting(formData: FormData): Promise<void> {
  const actor = await requireProfile();
  const meetingId = String(formData.get("meetingId") ?? "");
  if (!meetingId) throw new Error("Невалидна заявка.");

  const existing = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { assignees: { select: { profileId: true } } },
  });
  if (!existing) throw new Error("Срещата не съществува.");
  if (existing.status !== "cancelled") {
    redirect(`/meetings/${meetingId}`);
  }

  const assigneeIds = existing.assignees.map((a) => a.profileId);
  const isAssigneeOrManager = canEditMeeting(actor.role, assigneeIds, actor.id);
  const cancelledAt = existing.cancelledAt ?? new Date();
  const withinWindow =
    Date.now() - cancelledAt.getTime() <= RESTORE_WINDOW_DAYS * DAY_MS;

  if (actor.role !== "admin" && (!isAssigneeOrManager || !withinWindow)) {
    throw new Error(
      !isAssigneeOrManager
        ? "Нямате право да възстановявате тази среща."
        : `30-дневният прозорец за възстановяване е изтекъл.`,
    );
  }

  // Restore: back to upcoming; any past-dated red-border display is re-applied
  // automatically from startsAt — see Meetings.md §8 edge case.
  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      status: "upcoming",
      cancelledAt: null,
      cancelledById: null,
      cancelReason: null,
    },
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    action: "meetings.restore",
    targetType: "meeting",
    targetId: meetingId,
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/meetings");
  redirect(`/meetings/${meetingId}`);
}

// Mark a meeting as "happened" (manual per spec §4.3). Assignees only (admin
// and manager also allowed per canEditMeeting). Optional outcome notes.
export async function markMeetingHappened(formData: FormData): Promise<void> {
  const actor = await requireProfile();
  const meetingId = String(formData.get("meetingId") ?? "");
  const outcome = String(formData.get("outcome") ?? "").trim() || null;
  if (!meetingId) throw new Error("Невалидна заявка.");

  const existing = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { assignees: { select: { profileId: true } } },
  });
  if (!existing) throw new Error("Срещата не съществува.");
  if (existing.status !== "upcoming") {
    throw new Error("Само предстоящите срещи могат да се маркират като състояли се.");
  }

  const assigneeIds = existing.assignees.map((a) => a.profileId);
  if (!canEditMeeting(actor.role, assigneeIds, actor.id)) {
    throw new Error("Нямате право да маркирате тази среща.");
  }

  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      status: "happened",
      happenedAt: new Date(),
      happenedById: actor.id,
      happenedOutcome: outcome,
    },
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    action: "meetings.happened",
    targetType: "meeting",
    targetId: meetingId,
    payload: { outcome },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/meetings");
  redirect(`/meetings/${meetingId}`);
}
