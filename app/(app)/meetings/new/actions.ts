"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { MeetingFormState } from "@/app/(app)/meetings/meeting-form";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireProfile } from "@/lib/auth/session";
import { parseMeetingFormData } from "@/lib/meetings/parse";
import { prisma } from "@/lib/prisma";

export async function createMeeting(
  _prev: MeetingFormState,
  formData: FormData,
): Promise<MeetingFormState> {
  const actor = await requireProfile();
  const parsed = await parseMeetingFormData(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  // Creator is always an assignee (spec §3 step 7). Merge & dedupe.
  const assigneeSet = new Set<string>([actor.id, ...parsed.data.assigneeIds]);

  const meeting = await prisma.meeting.create({
    data: {
      leadId: parsed.data.leadId,
      startsAt: parsed.data.startsAt,
      durationMinutes: parsed.data.durationMinutes,
      type: parsed.data.type,
      location: parsed.data.location,
      notes: parsed.data.notes,
      createdById: actor.id,
      assignees: {
        create: [...assigneeSet].map((profileId) => ({ profileId })),
      },
    },
    select: { id: true },
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    action: "meetings.create",
    targetType: "meeting",
    targetId: meeting.id,
    payload: {
      leadId: parsed.data.leadId,
      startsAt: parsed.data.startsAt.toISOString(),
      durationMinutes: parsed.data.durationMinutes,
      type: parsed.data.type,
      assigneeIds: [...assigneeSet],
    },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  redirect(`/meetings/${meeting.id}`);
}
