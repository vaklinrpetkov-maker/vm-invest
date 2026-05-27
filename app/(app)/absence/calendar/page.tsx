import Link from "next/link";
import { PageHelp } from "@/components/ui/page-help";
import {
  BG_WEEKDAY_LABELS,
  addMonths,
  buildMonthGrid,
  chunkWeeks,
  computeNoteSpans,
  formatMonthParam,
  formatMonthTitle,
  parseMonthParam,
} from "@/lib/absence/calendar";
import { requireProfile } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SearchParams = { month?: string };

function firstName(fullName: string): string {
  return fullName.split(" ")[0] ?? fullName;
}

export default async function SharedCalendarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireProfile();
  const { month } = await searchParams;
  const ref = parseMonthParam(month);
  const cells = buildMonthGrid(ref);
  const rangeStart = cells[0].date;
  const rangeEnd = cells[cells.length - 1].date;

  const [requests, calendarDays, calendarNotes] = await Promise.all([
    prisma.absenceRequest.findMany({
      where: {
        status: "approved",
        startDate: { lte: rangeEnd },
        endDate: { gte: rangeStart },
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        employee: { select: { fullName: true } },
        category: { select: { code: true, labelBg: true, colorHex: true } },
      },
    }),
    prisma.calendarDay.findMany({
      where: { day: { gte: rangeStart, lte: rangeEnd }, isWorking: false },
      select: { day: true, holidayName: true },
    }),
    prisma.calendarNote.findMany({
      where: { day: { gte: rangeStart, lte: rangeEnd } },
      select: { day: true, note: true },
    }),
  ]);

  const holidayByIso = new Map(
    calendarDays.map((d) => [d.day.toISOString().slice(0, 10), d.holidayName]),
  );
  const noteByIso = new Map(
    calendarNotes.map((n) => [n.day.toISOString().slice(0, 10), n.note]),
  );

  const prevRef = addMonths(ref, -1);
  const nextRef = addMonths(ref, 1);
  const todayIso = new Date().toISOString().slice(0, 10);

  // Category color legend (unique categories that appear in this month).
  const seenCategories = new Map<string, { labelBg: string; colorHex: string }>();
  for (const r of requests) {
    if (!seenCategories.has(r.category.code)) {
      seenCategories.set(r.category.code, {
        labelBg: r.category.labelBg,
        colorHex: r.category.colorHex,
      });
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl text-neutral-900">Календар на отсъствията</h1>
            <PageHelp
              content={
                <p>
                  Месечен преглед на отсъствията на цялата компания. Само
                  одобрени заявки се визуализират; всеки човек има свой цвят,
                  легендата е горе. Полезно за планиране на ваканции около
                  колегите — преди да подадеш заявка, виж кой вече е в отпуск
                  в същия период.
                </p>
              }
            />
          </div>
          <p className="text-base text-neutral-600">
            {formatMonthTitle(ref)}. Показват се само одобрени заявки.
          </p>
        </div>
        <nav className="flex items-center gap-2">
          <Link
            href={{ pathname: "/absence/calendar", query: { month: formatMonthParam(prevRef) } }}
            className="h-8 px-3 inline-flex items-center rounded-lg bg-neutral-100 text-base text-neutral-900 hover:bg-neutral-150 transition-colors duration-120"
          >
            ←
          </Link>
          <Link
            href="/absence/calendar"
            className="h-8 px-3 inline-flex items-center rounded-lg bg-neutral-100 text-base text-neutral-900 hover:bg-neutral-150 transition-colors duration-120"
          >
            Днес
          </Link>
          <Link
            href={{ pathname: "/absence/calendar", query: { month: formatMonthParam(nextRef) } }}
            className="h-8 px-3 inline-flex items-center rounded-lg bg-neutral-100 text-base text-neutral-900 hover:bg-neutral-150 transition-colors duration-120"
          >
            →
          </Link>
        </nav>
      </div>

      {seenCategories.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {Array.from(seenCategories.entries()).map(([code, c]) => (
            <div key={code} className="flex items-center gap-1.5 text-neutral-600">
              <span
                aria-hidden="true"
                className="inline-block w-3 h-3 rounded-sm"
                style={{ backgroundColor: c.colorHex }}
              />
              {c.labelBg}
            </div>
          ))}
        </div>
      )}

      <div className="bg-neutral-0 rounded-lg overflow-hidden">
        <div className="grid grid-cols-7 border-b border-neutral-150">
          {BG_WEEKDAY_LABELS.map((label, i) => (
            <div
              key={label}
              className={cn(
                "px-3 py-2 text-sm font-medium text-neutral-500",
                i >= 5 && "text-neutral-400",
              )}
            >
              {label}
            </div>
          ))}
        </div>
        {/* Render one row per week (7 cells) so admin notes can be drawn as
            horizontal bars spanning multiple days within the same week. Runs
            don't cross week boundaries — a 10-day note shows as two bars,
            same as a multi-day event would in Google Calendar / monday.com.
            Bars overlay the cells themselves (not a separate row above them)
            — they sit just below the day-number row, inside the cell area. */}
        {chunkWeeks(cells).map((week, wi) => {
          const spans = computeNoteSpans(week, (c) => noteByIso.get(c.iso));
          // In weeks that contain notes, every cell reserves vertical space
          // below the day-number row for the bar overlay so absences flow
          // below the bar instead of being hidden behind it.
          const hasNotes = spans.length > 0;
          return (
            <div key={wi} className="grid grid-cols-7">
              {week.map((cell, i) => {
                const holidayName = holidayByIso.get(cell.iso);
                const isWeekend = i >= 5;
                const isToday = cell.iso === todayIso;
                const absences = requests.filter(
                  (r) => r.startDate <= cell.date && r.endDate >= cell.date,
                );
                return (
                  <div
                    key={cell.iso}
                    style={{ gridColumnStart: i + 1, gridRowStart: 1 }}
                    className={cn(
                      "min-h-24 border-b border-r border-neutral-150 p-1.5 flex flex-col gap-1",
                      hasNotes && "pt-9", // reserve top slot for bar overlay
                      (isWeekend || holidayName) && "bg-neutral-50",
                      !cell.inCurrentMonth && "bg-neutral-25",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "text-sm tabular-nums",
                          isToday
                            ? "inline-flex items-center justify-center w-6 h-6 rounded-full bg-accent-500 text-neutral-0 font-medium"
                            : cell.inCurrentMonth
                              ? "text-neutral-700"
                              : "text-neutral-300",
                        )}
                      >
                        {cell.day}
                      </span>
                      {holidayName && (
                        <span
                          className="text-xs text-neutral-500 truncate max-w-[70%]"
                          title={holidayName}
                        >
                          {holidayName}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {absences.map((r) => (
                        <div
                          key={r.id}
                          className="text-xs text-neutral-0 font-medium tracking-tight px-1.5 py-0.5 rounded-sm truncate"
                          style={{ backgroundColor: r.category.colorHex }}
                          title={`${r.employee.fullName} — ${r.category.labelBg}`}
                        >
                          {firstName(r.employee.fullName)}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {/* Spanning note bars overlay the cells at the top of the
                  reserved slot. They share grid-row 1 with the cells and use
                  `align-self:start` plus a top offset to sit just below the
                  day-number row. */}
              {spans.map((s) => (
                <div
                  key={`note-${s.startCol}`}
                  style={{
                    gridColumn: `${s.startCol + 1} / span ${s.spanCols}`,
                    gridRowStart: 1,
                    alignSelf: "start",
                    marginTop: "32px",
                  }}
                  className="relative z-10 mx-1 text-xs italic text-warning-800 bg-warning-100 px-2 py-1 truncate rounded-sm pointer-events-none"
                  title={s.note}
                >
                  {s.note}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
