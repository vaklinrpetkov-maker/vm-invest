import Link from "next/link";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { PageHelp } from "@/components/ui/page-help";
import { requireProfile } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import {
  MEETINGS_PAGE_SIZE,
  buildMeetingWhere,
  parseMeetingFilters,
  serializeMeetingFilters,
  type MeetingSearchParams,
  type ParsedMeetingFilters,
} from "@/lib/meetings/filters";
import { utcToSofiaWallClock } from "@/lib/meetings/parse";
import { canEditMeeting } from "@/lib/meetings/permissions";
import { prisma } from "@/lib/prisma";
import { MeetingFilters } from "./filters";
import { MeetingsTable, type MeetingRow } from "./meetings-table";

export const dynamic = "force-dynamic";

function pageHref(filters: ParsedMeetingFilters, page: number): Route {
  const f = { ...filters, page };
  const qs = serializeMeetingFilters(f).toString();
  return (qs ? `/meetings?${qs}` : "/meetings") as Route;
}

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<MeetingSearchParams>;
}) {
  const me = await requireProfile();
  const params = await searchParams;
  const filters = parseMeetingFilters(params);
  const where = buildMeetingWhere(filters);

  const [totalCount, list, profiles] = await Promise.all([
    prisma.meeting.count({ where }),
    prisma.meeting.findMany({
      where,
      orderBy: { startsAt: "asc" },
      skip: (filters.page - 1) * MEETINGS_PAGE_SIZE,
      take: MEETINGS_PAGE_SIZE,
      include: {
        lead: { select: { id: true, contact: { select: { fullName: true } } } },
        assignees: {
          select: { profile: { select: { id: true, fullName: true } } },
        },
      },
    }),
    prisma.profile.findMany({
      where: { active: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / MEETINGS_PAGE_SIZE));
  const rangeStart = totalCount === 0 ? 0 : (filters.page - 1) * MEETINGS_PAGE_SIZE + 1;
  const rangeEnd = Math.min(filters.page * MEETINGS_PAGE_SIZE, totalCount);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl text-neutral-900">Срещи</h1>
            <PageHelp
              content={
                <p>
                  Планираните и проведените срещи с клиенти. Кога, тип, локация
                  и участници са редактируеми директно в таблицата. След като
                  среща се проведе, отвори детайла и я маркирай като състояла се
                  (запомня се изходът). За седмичен преглед натисни бутона
                  Календар горе вдясно.
                </p>
              }
            />
          </div>
          <p className="text-base text-neutral-600">
            {totalCount === 0
              ? "Няма намерени срещи."
              : `Показани ${rangeStart}–${rangeEnd} от ${totalCount}.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/meetings/calendar">
            <Button variant="ghost">Календар</Button>
          </Link>
          <Link href="/meetings/new">
            <Button>+ Нова среща</Button>
          </Link>
        </div>
      </div>

      <MeetingFilters assignees={profiles} />

      <MeetingsTable
        rows={list.map<MeetingRow>((m) => {
          const assigneeIds = m.assignees.map((a) => a.profile.id);
          return {
            id: m.id,
            startsAtIso: m.startsAt.toISOString(),
            startsAtLocal: utcToSofiaWallClock(m.startsAt),
            startsAtFormatted: formatDateTime(m.startsAt),
            durationMinutes: m.durationMinutes,
            contactName: m.lead.contact.fullName,
            type: m.type,
            status: m.status,
            location: m.location,
            assignees: m.assignees.map((a) => ({
              id: a.profile.id,
              label: a.profile.fullName,
            })),
            // Per spec §4.1: inline cells are disabled when the user can't
            // edit (assignee-or-manager-or-admin) OR the meeting is cancelled.
            canEdit:
              m.status !== "cancelled" &&
              canEditMeeting(me.role, assigneeIds, me.id),
          };
        })}
        assigneeOptions={profiles.map((p) => ({ id: p.id, label: p.fullName }))}
      />

      {totalPages > 1 && (
        <nav className="flex items-center justify-between gap-2 pt-1">
          <div className="text-sm text-neutral-500">
            Страница {filters.page} от {totalPages}
          </div>
          <div className="flex items-center gap-2">
            {filters.page > 1 ? (
              <Link href={pageHref(filters, filters.page - 1)}>
                <Button variant="secondary" size="sm">
                  ← Предишна
                </Button>
              </Link>
            ) : (
              <Button variant="secondary" size="sm" disabled>
                ← Предишна
              </Button>
            )}
            {filters.page < totalPages ? (
              <Link href={pageHref(filters, filters.page + 1)}>
                <Button variant="secondary" size="sm">
                  Следваща →
                </Button>
              </Link>
            ) : (
              <Button variant="secondary" size="sm" disabled>
                Следваща →
              </Button>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
