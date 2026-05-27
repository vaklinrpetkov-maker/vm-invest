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
  LEAD_SOURCE_LABELS,
  LEAD_SOURCE_TONES,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_TONES,
} from "@/lib/leads/constants";
import {
  MEETING_STATUS_LABELS,
  MEETING_STATUS_TONES,
  MEETING_TYPE_LABELS,
  MEETING_TYPE_TONES,
} from "@/lib/meetings/constants";
import { elapsedTone, formatElapsed } from "@/lib/leads/timer";
import { prisma } from "@/lib/prisma";
import { DeleteLeadButton } from "./delete-button";
import { StopTimerButton } from "./stop-timer-button";

export const dynamic = "force-dynamic";

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

export default async function LeadProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireProfile();
  const { id } = await params;

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      contact: {
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          type: true,
        },
      },
      owner: { select: { fullName: true } },
      createdBy: { select: { fullName: true } },
      meetings: {
        where: { status: { not: "cancelled" } },
        orderBy: { startsAt: "asc" },
        include: {
          assignees: {
            select: { profile: { select: { fullName: true } } },
          },
        },
      },
    },
  });
  if (!lead || lead.deletedAt) notFound();

  // Edit permission: admin/manager always, user only if owner.
  const canEdit =
    me.role === "admin" || me.role === "manager" || lead.ownerId === me.id;
  // Delete permission: all roles per deliberate deviation.
  const canDelete = true;

  const isConverted = lead.status === "converted";

  // Response-timer state — only email leads carry a live timer.
  const timerRunning =
    lead.timerStartedAt !== null && lead.timerStoppedAt === null;
  const timerElapsed = timerRunning
    ? Date.now() - lead.timerStartedAt!.getTime()
    : null;
  const timerToneClass = timerElapsed === null
    ? ""
    : elapsedTone(timerElapsed) === "danger"
      ? "bg-danger-50 text-danger-700"
      : elapsedTone(timerElapsed) === "warning"
        ? "bg-warning-50 text-warning-800"
        : "bg-success-50 text-success-700";

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <Link
          href="/leads"
          className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors duration-120"
        >
          ← Лийдове
        </Link>
      </div>

      <header className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl text-neutral-900">
              <Link
                href={`/contacts/${lead.contact.id}` as Route}
                className="hover:text-accent-700 transition-colors duration-120"
              >
                {lead.contact.fullName}
              </Link>
            </h1>
            <span className="text-sm text-neutral-500">{lead.contact.type}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge tone={LEAD_STATUS_TONES[lead.status]}>
              {LEAD_STATUS_LABELS[lead.status]}
            </StatusBadge>
            <StatusBadge tone={LEAD_SOURCE_TONES[lead.source]}>
              {LEAD_SOURCE_LABELS[lead.source]}
            </StatusBadge>
            {lead.owner ? (
              <span className="text-sm text-neutral-600">
                Отговорник:{" "}
                <span className="text-neutral-900">{lead.owner.fullName}</span>
              </span>
            ) : (
              <StatusBadge tone="warning">Без отговорник</StatusBadge>
            )}
            {timerRunning && timerElapsed !== null && (
              <span
                className={cn(
                  "inline-block px-2 py-0.5 rounded-sm text-xs font-medium tabular-nums font-mono",
                  timerToneClass,
                )}
                title={`Таймер стартиран ${lead.timerStartedAt?.toISOString() ?? ""}`}
              >
                Таймер {formatElapsed(timerElapsed)}
              </span>
            )}
            {lead.timerStoppedAt && (
              <StatusBadge tone="success">Таймер спрян</StatusBadge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {timerRunning && <StopTimerButton leadId={lead.id} />}
          {lead.contact.phone && (
            <a href={`tel:${lead.contact.phone}`}>
              <Button variant="secondary" size="sm">
                Обади се
              </Button>
            </a>
          )}
          {lead.contact.email && (
            <a href={`mailto:${lead.contact.email}`}>
              <Button variant="secondary" size="sm">
                Изпрати имейл
              </Button>
            </a>
          )}
          {canEdit && !isConverted && (
            <Link href={`/leads/${lead.id}/edit` as Route}>
              <Button size="sm">Редактирай</Button>
            </Link>
          )}
          {canDelete && <DeleteLeadButton leadId={lead.id} />}
        </div>
      </header>

      {isConverted && (
        <div className="rounded-lg bg-success-50 text-success-700 px-4 py-2 text-sm">
          Този лийд е преобразуван в договор. Редакцията е заключена.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="bg-neutral-0 rounded-lg p-6 space-y-4">
          <h2 className="text-md font-medium text-neutral-900">Детайли</h2>
          <div className="space-y-3">
            <DetailRow label="Телефон">
              {lead.contact.phone ? (
                <a
                  href={`tel:${lead.contact.phone}`}
                  className="text-neutral-900 hover:text-accent-700 transition-colors duration-120 tabular-nums"
                >
                  {lead.contact.phone}
                </a>
              ) : (
                <span className="text-neutral-400">—</span>
              )}
            </DetailRow>
            <DetailRow label="Имейл">
              {lead.contact.email ? (
                <a
                  href={`mailto:${lead.contact.email}`}
                  className="text-neutral-900 hover:text-accent-700 transition-colors duration-120"
                >
                  {lead.contact.email}
                </a>
              ) : (
                <span className="text-neutral-400">—</span>
              )}
            </DetailRow>
            <DetailRow label="Имоти">
              {lead.properties.length === 0 ? (
                <span className="text-neutral-400">—</span>
              ) : (
                <ul className="space-y-0.5">
                  {lead.properties.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              )}
            </DetailRow>
            <DetailRow label="Създаден">
              <span className="tabular-nums">{formatDateTime(lead.createdAt)}</span>
              {lead.createdBy && (
                <span className="text-sm text-neutral-500 ml-2">
                  от {lead.createdBy.fullName}
                </span>
              )}
            </DetailRow>
            <DetailRow label="Последна промяна">
              <span className="tabular-nums">{formatDateTime(lead.updatedAt)}</span>
            </DetailRow>
            {lead.emailReceivedAt && (
              <DetailRow label="Получен имейл">
                <span className="tabular-nums">
                  {formatDateTime(lead.emailReceivedAt)}
                </span>
              </DetailRow>
            )}
            {lead.matchConfidence && (
              <DetailRow label="Съвпадение на контакт">
                <StatusBadge
                  tone={
                    lead.matchConfidence === "high"
                      ? "success"
                      : lead.matchConfidence === "medium"
                        ? "info"
                        : "warning"
                  }
                >
                  {lead.matchConfidence}
                </StatusBadge>
              </DetailRow>
            )}
          </div>
        </section>

        <section className="bg-neutral-0 rounded-lg p-6 space-y-4 lg:col-span-2">
          <h2 className="text-md font-medium text-neutral-900">Съобщение</h2>
          {lead.message ? (
            <p className="whitespace-pre-wrap text-base text-neutral-800">{lead.message}</p>
          ) : (
            <p className="text-sm text-neutral-500">Няма съобщение.</p>
          )}

          {lead.parseError && (
            <div className="rounded-lg bg-warning-50 text-warning-800 px-3 py-2 text-sm">
              Грешка при парсване: <span className="font-mono">{lead.parseError}</span>
            </div>
          )}

          {lead.rawEmailBody && (
            <details className="text-sm">
              <summary className="cursor-pointer text-neutral-600 hover:text-neutral-900 transition-colors duration-120">
                Покажи суровия имейл
              </summary>
              <pre className="mt-2 p-3 rounded-md bg-neutral-50 text-neutral-700 whitespace-pre-wrap text-xs font-mono">
                {lead.rawEmailBody}
              </pre>
            </details>
          )}
        </section>
      </div>

      <section className="bg-neutral-0 rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-md font-medium text-neutral-900">
            Срещи{" "}
            <span className="text-sm text-neutral-500 font-normal">
              ({lead.meetings.length})
            </span>
          </h2>
          {!isConverted && (
            <Link href={`/meetings/new?leadId=${lead.id}` as Route}>
              <Button size="sm">+ Нова среща</Button>
            </Link>
          )}
        </div>
        {lead.meetings.length === 0 ? (
          <p className="text-sm text-neutral-500">Няма срещи по този лийд.</p>
        ) : (
          <ul className="divide-y divide-neutral-150">
            {lead.meetings.map((m) => (
              <li key={m.id} className="py-2.5 flex items-center gap-3">
                <StatusBadge tone={MEETING_TYPE_TONES[m.type]}>
                  {MEETING_TYPE_LABELS[m.type]}
                </StatusBadge>
                <Link
                  href={`/meetings/${m.id}` as Route}
                  className="text-base tabular-nums font-mono text-neutral-900 hover:text-accent-700 transition-colors duration-120"
                >
                  {formatDateTime(m.startsAt)}
                </Link>
                <span className="text-sm text-neutral-500">
                  {m.durationMinutes} мин
                </span>
                <StatusBadge tone={MEETING_STATUS_TONES[m.status]}>
                  {MEETING_STATUS_LABELS[m.status]}
                </StatusBadge>
                <span className="text-sm text-neutral-500 truncate ml-auto">
                  {m.assignees.map((a) => a.profile.fullName).join(", ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ActivityFeed
        targetType="lead"
        targetId={lead.id}
        viewerId={me.id}
        viewerRole={me.role}
      />

      <p className="text-sm text-neutral-500">
        ID: <span className="font-mono">{lead.id}</span> · Добавен{" "}
        {formatDate(lead.createdAt)}
      </p>
    </div>
  );
}
