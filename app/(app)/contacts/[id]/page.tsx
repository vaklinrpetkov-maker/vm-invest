import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
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
import { prisma } from "@/lib/prisma";
import { ActivityFeed } from "@/components/ui/activity-feed/activity-feed";
import {
  RENOVATION_STATUS_LABELS,
  RENOVATION_STATUS_TONES,
} from "@/lib/renovations/constants";
import { listRenovationsByContact } from "@/lib/renovations/queries";
import { deleteContact } from "./actions";

export const dynamic = "force-dynamic";

function yearsBetween(birth: Date, today: Date): number {
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - birth.getUTCMonth();
  const dayDiff = today.getUTCDate() - birth.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
  return age;
}

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

export default async function ContactProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireProfile();
  const { id } = await params;

  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      owner: { select: { fullName: true } },
      createdBy: { select: { fullName: true } },
      building: { select: { id: true, displayName: true } },
      leads: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          source: true,
          status: true,
          createdAt: true,
          owner: { select: { fullName: true } },
        },
      },
    },
  });
  if (!contact) notFound();

  // Meetings across all (non-deleted) leads of this contact.
  const meetings = await prisma.meeting.findMany({
    where: {
      lead: { contactId: id, deletedAt: null },
      status: { not: "cancelled" },
    },
    orderBy: { startsAt: "asc" },
    include: {
      lead: { select: { id: true } },
      assignees: {
        select: { profile: { select: { fullName: true } } },
      },
    },
    take: 50,
  });

  // Renovations the contact requested (path A in `renovations.md` §2 —
  // post-handover, owner-requested). Listed even when empty so the user
  // sees the "+ Нов ремонт" affordance for first-time setup.
  const renovations = await listRenovationsByContact(id);

  const age =
    contact.birthDate != null ? yearsBetween(contact.birthDate, new Date()) : null;

  const canDelete = me.role === "admin" || me.role === "manager";

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <Link
          href="/contacts"
          className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors duration-120"
        >
          ← Контакти
        </Link>
      </div>

      <header className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <h1 className="text-2xl text-neutral-900">{contact.fullName}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge tone="neutral">{contact.type}</StatusBadge>
            {contact.owner && (
              <span className="text-sm text-neutral-600">
                Отговорник: <span className="text-neutral-900">{contact.owner.fullName}</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {contact.phone && (
            <a href={`tel:${contact.phone}`}>
              <Button variant="secondary" size="sm">Обади се</Button>
            </a>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`}>
              <Button variant="secondary" size="sm">Изпрати имейл</Button>
            </a>
          )}
          <Link href={`/contacts/${contact.id}/edit` as Route}>
            <Button size="sm">Редактирай</Button>
          </Link>
          {canDelete && (
            <form action={deleteContact}>
              <input type="hidden" name="contactId" value={contact.id} />
              <Button type="submit" variant="ghost" size="sm">
                Изтрий
              </Button>
            </form>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="bg-neutral-0 rounded-lg p-6 space-y-4">
          <h2 className="text-md font-medium text-neutral-900">Детайли</h2>
          <div className="space-y-3">
            <DetailRow label="Телефон">
              {contact.phone ? (
                <a
                  href={`tel:${contact.phone}`}
                  className="text-neutral-900 hover:text-accent-700 transition-colors duration-120 tabular-nums"
                >
                  {contact.phone}
                </a>
              ) : (
                <span className="text-neutral-400">—</span>
              )}
            </DetailRow>
            <DetailRow label="Имейл">
              {contact.email ? (
                <a
                  href={`mailto:${contact.email}`}
                  className="text-neutral-900 hover:text-accent-700 transition-colors duration-120"
                >
                  {contact.email}
                </a>
              ) : (
                <span className="text-neutral-400">—</span>
              )}
            </DetailRow>
            <DetailRow label="ЕГН / ЕИК">
              {contact.egn ?? <span className="text-neutral-400">—</span>}
            </DetailRow>
            <DetailRow label="Дата на раждане">
              {contact.birthDate ? (
                <>
                  <span className="tabular-nums">{formatDate(contact.birthDate)}</span>
                  {age !== null && (
                    <span className="text-sm text-neutral-500 ml-2">({age} г.)</span>
                  )}
                </>
              ) : (
                <span className="text-neutral-400">—</span>
              )}
            </DetailRow>
            <DetailRow label="Адрес">
              {contact.address ? (
                <span className="whitespace-pre-wrap">{contact.address}</span>
              ) : (
                <span className="text-neutral-400">—</span>
              )}
            </DetailRow>
            <DetailRow label="Сграда">
              {contact.building ? (
                <Link
                  href={`/properties?building=${contact.building.id}` as Route}
                  className="hover:text-accent-700 transition-colors"
                >
                  {contact.building.displayName}
                </Link>
              ) : (
                <span className="text-neutral-400">—</span>
              )}
            </DetailRow>
            <DetailRow label="Имоти">
              {contact.properties ? (
                <span className="whitespace-pre-wrap">{contact.properties}</span>
              ) : (
                <span className="text-neutral-400">—</span>
              )}
            </DetailRow>
            <DetailRow label="Договор (от CSV)">
              {contact.contractLabel ? (
                <span className="whitespace-pre-wrap text-sm">{contact.contractLabel}</span>
              ) : (
                <span className="text-neutral-400">—</span>
              )}
            </DetailRow>
            <DetailRow label="Допълнителни бележки">
              {contact.notes ? (
                <span className="whitespace-pre-wrap">{contact.notes}</span>
              ) : (
                <span className="text-neutral-400">—</span>
              )}
            </DetailRow>
            <DetailRow label="Добавен">
              <span className="tabular-nums">{formatDate(contact.createdAt)}</span>
              {contact.createdBy && (
                <span className="text-sm text-neutral-500 ml-2">
                  от {contact.createdBy.fullName}
                </span>
              )}
            </DetailRow>
          </div>
        </section>

        <div className="lg:col-span-2">
          <ActivityFeed
            targetType="contact"
            targetId={contact.id}
            viewerId={me.id}
            viewerRole={me.role}
          />
        </div>
      </div>

      <section className="bg-neutral-0 rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-md font-medium text-neutral-900">
            Лийдове{" "}
            <span className="text-sm text-neutral-500 font-normal">
              ({contact.leads.length})
            </span>
          </h2>
          <Link href={`/leads/new?contactId=${contact.id}` as Route}>
            <Button size="sm">+ Нов лийд</Button>
          </Link>
        </div>
        {contact.leads.length === 0 ? (
          <p className="text-sm text-neutral-500">Няма лийдове за този контакт.</p>
        ) : (
          <ul className="divide-y divide-neutral-150">
            {contact.leads.map((l) => (
              <li key={l.id} className="py-2.5 flex items-center gap-3 flex-wrap">
                <Link
                  href={`/leads/${l.id}` as Route}
                  className="text-base text-neutral-900 hover:text-accent-700 transition-colors duration-120 tabular-nums"
                >
                  {formatDate(l.createdAt)}
                </Link>
                <StatusBadge tone={LEAD_STATUS_TONES[l.status]}>
                  {LEAD_STATUS_LABELS[l.status]}
                </StatusBadge>
                <StatusBadge tone={LEAD_SOURCE_TONES[l.source]}>
                  {LEAD_SOURCE_LABELS[l.source]}
                </StatusBadge>
                <span className="text-sm text-neutral-500 ml-auto">
                  {l.owner?.fullName ?? "— Без отговорник"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-neutral-0 rounded-lg p-6 space-y-4">
        <h2 className="text-md font-medium text-neutral-900">
          Срещи{" "}
          <span className="text-sm text-neutral-500 font-normal">
            ({meetings.length})
          </span>
        </h2>
        {meetings.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Няма срещи за този контакт.
            {contact.leads.length === 0 && " Създайте първо лийд."}
          </p>
        ) : (
          <ul className="divide-y divide-neutral-150">
            {meetings.map((m) => (
              <li key={m.id} className="py-2.5 flex items-center gap-3 flex-wrap">
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
                <span className="text-sm text-neutral-500 ml-auto truncate">
                  {m.assignees.map((a) => a.profile.fullName).join(", ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-neutral-0 rounded-lg p-6 space-y-4">
        <h2 className="text-md font-medium text-neutral-900">
          Ремонти{" "}
          <span className="text-sm text-neutral-500 font-normal">
            ({renovations.length})
          </span>
        </h2>
        {renovations.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Този контакт не е заявявал ремонти. Свържете нов ремонт от
            страницата на имота.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-150">
            {renovations.map((r) => {
              const done = r.activities.filter((a) => a.status === "done").length;
              const total = r.activities.length;
              const label = `${r.property.building.displayName} · ${r.property.name}`;
              return (
                <li
                  key={r.id}
                  className="py-2.5 flex items-center gap-3 text-sm"
                >
                  <StatusBadge tone={RENOVATION_STATUS_TONES[r.status]}>
                    {RENOVATION_STATUS_LABELS[r.status]}
                  </StatusBadge>
                  <Link
                    href={`/renovations/${r.id}` as Route}
                    className="text-neutral-900 hover:text-accent-700 transition-colors duration-120 flex-1 truncate"
                  >
                    {label}
                  </Link>
                  {total > 0 && (
                    <span className="text-neutral-500 tabular-nums">
                      {done} / {total}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
