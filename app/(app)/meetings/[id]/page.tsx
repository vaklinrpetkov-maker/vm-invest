import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ActivityFeed } from "@/components/ui/activity-feed/activity-feed";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime } from "@/lib/format";
import { requireProfile } from "@/lib/auth/session";
import {
  MEETING_STATUS_LABELS,
  MEETING_STATUS_TONES,
  MEETING_TYPE_LABELS,
  MEETING_TYPE_TONES,
  RESTORE_WINDOW_DAYS,
} from "@/lib/meetings/constants";
import { prisma } from "@/lib/prisma";
import { restoreMeeting } from "./actions";
import { CancelMeetingButton } from "./cancel-button";
import { MarkHappenedButton } from "./happened-button";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

function DetailRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <span className="text-sm text-neutral-500">{label}</span>
      <span className="text-base text-neutral-900">{children}</span>
    </div>
  );
}

export default async function MeetingProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireProfile();
  const { id } = await params;

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      lead: {
        select: {
          id: true,
          contact: { select: { id: true, fullName: true } },
          status: true,
        },
      },
      assignees: {
        include: { profile: { select: { id: true, fullName: true } } },
      },
      createdBy: { select: { fullName: true } },
      happenedBy: { select: { fullName: true } },
      cancelledBy: { select: { fullName: true } },
    },
  });
  if (!meeting) notFound();

  const assigneeIds = meeting.assignees.map((a) => a.profile.id);
  const isAssignee = assigneeIds.includes(me.id);
  const canEdit = me.role === "admin" || me.role === "manager" || isAssignee;

  const now = Date.now();
  const end = meeting.startsAt.getTime() + meeting.durationMinutes * 60_000;
  const isPastStart = meeting.startsAt.getTime() < now;
  const isPastEnd = end < now;
  // Red border when upcoming but start is already in the past.
  const pastDateFlag =
    meeting.status === "upcoming" && isPastEnd;
  const fadedPastStart =
    meeting.status === "upcoming" && isPastStart && !isPastEnd;

  const cancelledAt = meeting.cancelledAt;
  const withinRestore =
    meeting.status === "cancelled" &&
    cancelledAt != null &&
    now - cancelledAt.getTime() <= RESTORE_WINDOW_DAYS * DAY_MS;
  const canRestore =
    meeting.status === "cancelled" &&
    (me.role === "admin" || (canEdit && withinRestore));

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <Link
          href="/meetings"
          className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors duration-120"
        >
          ← Срещи
        </Link>
      </div>

      <header
        className={cn(
          "flex items-start justify-between gap-4 p-4 rounded-lg",
          pastDateFlag && "border-l-2 border-danger-500",
          fadedPastStart && "opacity-70",
          meeting.status === "happened" && "bg-success-50/50",
          meeting.status === "cancelled" && "bg-neutral-50",
        )}
      >
        <div className="flex-1 space-y-2">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl text-neutral-900 tabular-nums font-mono">
              {formatDateTime(meeting.startsAt)}
            </h1>
            <span className="text-sm text-neutral-500">
              {meeting.durationMinutes} мин
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge tone={MEETING_TYPE_TONES[meeting.type]}>
              {MEETING_TYPE_LABELS[meeting.type]}
            </StatusBadge>
            <StatusBadge tone={MEETING_STATUS_TONES[meeting.status]}>
              {MEETING_STATUS_LABELS[meeting.status]}
            </StatusBadge>
            {pastDateFlag && <StatusBadge tone="danger">Минала дата</StatusBadge>}
          </div>
          <div className="text-base text-neutral-600">
            Клиент:{" "}
            <Link
              href={`/contacts/${meeting.lead.contact.id}` as Route}
              className="text-neutral-900 hover:text-accent-700 transition-colors duration-120"
            >
              {meeting.lead.contact.fullName}
            </Link>
            <span className="text-neutral-400 mx-2">·</span>
            <Link
              href={`/leads/${meeting.lead.id}` as Route}
              className="text-neutral-700 hover:text-accent-700 transition-colors duration-120"
            >
              Отвори лийд
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {meeting.status === "upcoming" && canEdit && (
            <MarkHappenedButton meetingId={meeting.id} />
          )}
          {meeting.status !== "cancelled" && canEdit && (
            <Link href={`/meetings/${meeting.id}/edit` as Route}>
              <Button variant="secondary" size="sm">
                Редактирай
              </Button>
            </Link>
          )}
          {meeting.status !== "cancelled" && canEdit && (
            <CancelMeetingButton meetingId={meeting.id} />
          )}
          {canRestore && (
            <form action={restoreMeeting}>
              <input type="hidden" name="meetingId" value={meeting.id} />
              <Button type="submit" size="sm">
                Възстанови
              </Button>
            </form>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="bg-neutral-0 rounded-lg p-6 space-y-4">
          <h2 className="text-md font-medium text-neutral-900">Детайли</h2>
          <div className="space-y-3">
            <DetailRow label="Локация">
              {meeting.location ? (
                <span className="whitespace-pre-wrap">{meeting.location}</span>
              ) : (
                <span className="text-neutral-400">—</span>
              )}
            </DetailRow>
            <DetailRow label="Участници">
              {meeting.assignees.length === 0 ? (
                <span className="text-neutral-400">—</span>
              ) : (
                <ul className="space-y-0.5">
                  {meeting.assignees.map((a) => (
                    <li key={a.profile.id}>{a.profile.fullName}</li>
                  ))}
                </ul>
              )}
            </DetailRow>
            <DetailRow label="Създадена">
              <span className="tabular-nums">{formatDateTime(meeting.createdAt)}</span>
              {meeting.createdBy && (
                <span className="text-sm text-neutral-500 ml-2">
                  от {meeting.createdBy.fullName}
                </span>
              )}
            </DetailRow>
            {meeting.status === "happened" && meeting.happenedAt && (
              <DetailRow label="Състояла се">
                <span className="tabular-nums">{formatDateTime(meeting.happenedAt)}</span>
                {meeting.happenedBy && (
                  <span className="text-sm text-neutral-500 ml-2">
                    отбелязано от {meeting.happenedBy.fullName}
                  </span>
                )}
              </DetailRow>
            )}
            {meeting.status === "cancelled" && meeting.cancelledAt && (
              <DetailRow label="Отменена">
                <span className="tabular-nums">{formatDate(meeting.cancelledAt)}</span>
                {meeting.cancelledBy && (
                  <span className="text-sm text-neutral-500 ml-2">
                    от {meeting.cancelledBy.fullName}
                  </span>
                )}
                {!withinRestore && (
                  <span className="text-xs text-neutral-500 ml-2">
                    (30-дневен прозорец изтекъл)
                  </span>
                )}
              </DetailRow>
            )}
          </div>
        </section>

        <section className="bg-neutral-0 rounded-lg p-6 space-y-4 lg:col-span-2">
          <h2 className="text-md font-medium text-neutral-900">Бележки</h2>
          {meeting.notes ? (
            <p className="whitespace-pre-wrap text-base text-neutral-800">
              {meeting.notes}
            </p>
          ) : (
            <p className="text-sm text-neutral-500">Няма бележки.</p>
          )}

          {meeting.happenedOutcome && (
            <div className="mt-4 pt-4 border-t border-neutral-150 space-y-2">
              <h3 className="text-sm font-medium text-neutral-700">Резултат</h3>
              <p className="whitespace-pre-wrap text-base text-neutral-800">
                {meeting.happenedOutcome}
              </p>
            </div>
          )}

          {meeting.cancelReason && (
            <div className="mt-4 pt-4 border-t border-neutral-150 space-y-2">
              <h3 className="text-sm font-medium text-neutral-700">Причина за отмяна</h3>
              <p className="whitespace-pre-wrap text-base text-neutral-800">
                {meeting.cancelReason}
              </p>
            </div>
          )}
        </section>
      </div>

      <ActivityFeed
        targetType="meeting"
        targetId={meeting.id}
        viewerId={me.id}
        viewerRole={me.role}
      />

      <p className="text-sm text-neutral-500">
        ID: <span className="font-mono">{meeting.id}</span>
      </p>
    </div>
  );
}
