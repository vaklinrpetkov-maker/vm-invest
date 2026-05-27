import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { MeetingForm } from "@/app/(app)/meetings/meeting-form";
import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { updateMeeting } from "../actions";

export const dynamic = "force-dynamic";

// Convert a UTC Date to a YYYY-MM-DDTHH:MM wall-clock in Europe/Sofia for the
// datetime-local input. Mirror of lib/meetings/parse.ts logic.
function toSofiaInputValue(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const hour = map.hour === "24" ? "00" : map.hour;
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}`;
}

export default async function EditMeetingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireProfile();
  const { id } = await params;

  const [meeting, profiles] = await Promise.all([
    prisma.meeting.findUnique({
      where: { id },
      include: {
        lead: {
          select: {
            id: true,
            status: true,
            properties: true,
            contact: { select: { fullName: true } },
          },
        },
        assignees: { select: { profileId: true } },
      },
    }),
    prisma.profile.findMany({
      where: { active: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
  ]);

  if (!meeting) notFound();

  const assigneeIds = meeting.assignees.map((a) => a.profileId);
  const canEdit =
    me.role === "admin" ||
    me.role === "manager" ||
    assigneeIds.includes(me.id);

  if (!canEdit || meeting.status === "cancelled") notFound();

  const boundUpdate = updateMeeting.bind(null, meeting.id);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-1">
        <Link
          href={`/meetings/${meeting.id}` as Route}
          className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors duration-120"
        >
          ← Обратно към срещата
        </Link>
        <h1 className="text-xl text-neutral-900">Редакция на среща</h1>
      </div>
      <MeetingForm
        action={boundUpdate}
        submitLabel="Запази промените"
        pendingLabel="Запис…"
        profiles={profiles}
        initial={{
          lead: {
            id: meeting.lead.id,
            contactName: meeting.lead.contact.fullName,
            status: meeting.lead.status,
            firstProperty: meeting.lead.properties[0] ?? null,
          },
          startsAt: toSofiaInputValue(meeting.startsAt),
          durationMinutes: meeting.durationMinutes,
          type: meeting.type,
          location: meeting.location ?? "",
          notes: meeting.notes ?? "",
          assigneeIds,
        }}
        fixLead
      />
    </div>
  );
}
