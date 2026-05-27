import type { Route } from "next";
import { PageHelp } from "@/components/ui/page-help";
import { requireProfile } from "@/lib/auth/session";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  formatMonthTitle,
  formatWeekRange,
  isCalendarView,
  parseAnchorDate,
  sofiaParts,
  startOfMonth,
  startOfWeek,
  toIsoDate,
  type CalendarView,
} from "@/lib/meetings/calendar-helpers";
import { prisma } from "@/lib/prisma";
import { CalendarNav, Legend } from "./nav";
import { MonthView, type MonthMeeting } from "./month-view";
import { WeekView, type WeekMeeting } from "./week-view";

export const dynamic = "force-dynamic";

type SearchParams = { view?: string; date?: string };

// Helper to build typed href for the calendar navigation.
function buildHref(view: CalendarView, dateIso: string): Route {
  const qs = new URLSearchParams({ view, date: dateIso }).toString();
  return `/meetings/calendar?${qs}` as Route;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireProfile();
  const { view: viewRaw, date: dateRaw } = await searchParams;

  const view: CalendarView = isCalendarView(viewRaw ?? "") ? (viewRaw as CalendarView) : "week";
  const anchor = parseAnchorDate(dateRaw);
  const anchorIso = toIsoDate(anchor);

  // Date window for DB query. Month view needs the 6×7 grid range (leading/
  // trailing days shown), not just the month.
  let rangeStart: Date;
  let rangeEnd: Date;
  if (view === "week") {
    rangeStart = startOfWeek(anchor);
    rangeEnd = endOfWeek(anchor);
  } else {
    const mStart = startOfMonth(anchor);
    rangeStart = startOfWeek(mStart);
    const mEnd = endOfMonth(anchor);
    rangeEnd = addDays(startOfWeek(mEnd), 42); // safe upper bound
  }

  const rows = await prisma.meeting.findMany({
    where: {
      status: { not: "cancelled" },
      startsAt: { gte: rangeStart, lt: rangeEnd },
    },
    orderBy: { startsAt: "asc" },
    include: {
      lead: { select: { contact: { select: { fullName: true } } } },
      assignees: { select: { profile: { select: { fullName: true } } } },
    },
  });

  const now = Date.now();

  const weekMeetings: WeekMeeting[] = rows.map((m) => {
    const p = sofiaParts(m.startsAt);
    const end = m.startsAt.getTime() + m.durationMinutes * 60_000;
    return {
      id: m.id,
      isoDate: p.iso,
      startHour: p.hour,
      startMinute: p.minute,
      durationMinutes: m.durationMinutes,
      type: m.type,
      status: m.status,
      contactName: m.lead.contact.fullName,
      assigneeNames: m.assignees.map((a) => a.profile.fullName),
      pastDate: m.status === "upcoming" && end < now,
    };
  });

  const monthMeetings: MonthMeeting[] = weekMeetings.map((m) => ({
    id: m.id,
    isoDate: m.isoDate,
    startHour: m.startHour,
    startMinute: m.startMinute,
    type: m.type,
    status: m.status,
    contactName: m.contactName,
    pastDate: m.pastDate,
  }));

  const todayIso = toIsoDate(
    new Date(
      Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        new Date().getUTCDate(),
      ),
    ),
  );

  const prev = view === "week" ? toIsoDate(addDays(anchor, -7)) : toIsoDate(addMonths(anchor, -1));
  const next = view === "week" ? toIsoDate(addDays(anchor, 7)) : toIsoDate(addMonths(anchor, 1));

  const title = view === "week" ? formatWeekRange(anchor) : formatMonthTitle(anchor);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <h1 className="text-xl text-neutral-900">Календар на срещите</h1>
          <PageHelp
            content={
              <p>
                Седмичен / месечен / годишен преглед на всички планирани срещи.
                Цветовете показват типа на срещата (виж легендата). Кликни на
                среща, за да отвориш детайла. За филтри и редакция в табличен
                вид се върни на страница Срещи.
              </p>
            }
          />
        </div>
      </div>

      <CalendarNav
        view={view}
        anchorIso={anchorIso}
        prevHref={buildHref(view, prev)}
        nextHref={buildHref(view, next)}
        todayHref={buildHref(view, todayIso)}
        weekHref={buildHref("week", anchorIso)}
        monthHref={buildHref("month", anchorIso)}
        listHref={"/meetings" as Route}
        newHref={"/meetings/new" as Route}
        title={title}
      />

      <Legend />

      {view === "week" ? (
        <WeekView anchor={anchor} meetings={weekMeetings} />
      ) : (
        <MonthView anchor={anchor} meetings={monthMeetings} />
      )}
    </div>
  );
}
