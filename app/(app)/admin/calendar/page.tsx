import Link from "next/link";
import {
  buildMonthCellsWithGaps,
  mondayBasedWeekday,
} from "@/lib/absence/calendar";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { CalendarGrid, type CellInfo, type MonthInfo } from "./calendar-grid";

export const dynamic = "force-dynamic";

type SearchParams = { year?: string };

function parseYear(value: string | undefined): number {
  const now = new Date().getUTCFullYear();
  if (!value) return now;
  const n = Number(value);
  return Number.isFinite(n) && n >= 1970 && n <= 2100 ? n : now;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole("admin");
  const { year: yearStr } = await searchParams;
  const year = parseYear(yearStr);

  // Bounds at midnight UTC: CalendarDay.day is `@db.Date`, so values come back
  // at 00:00:00Z. Using noon would silently miss a Jan 1 override.
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31));
  const [calendarYear, overrides, notes] = await Promise.all([
    prisma.calendarYear.findUnique({ where: { year } }),
    prisma.calendarDay.findMany({
      where: { day: { gte: yearStart, lte: yearEnd } },
      orderBy: { day: "asc" },
    }),
    prisma.calendarNote.findMany({
      where: { day: { gte: yearStart, lte: yearEnd } },
      orderBy: { day: "asc" },
    }),
  ]);

  const byIso = new Map(overrides.map((o) => [toIsoDate(o.day), o]));
  const noteByIso = new Map(notes.map((n) => [toIsoDate(n.day), n.note]));

  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const todayIso = toIsoDate(new Date(Date.now()));

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl text-neutral-900">Работни дни — {year}</h1>
          <p className="text-base text-neutral-600">
            По подразбиране: понеделник–петък са работни. Кликнете ден за единична редакция или ден и втори ден за диапазон — типът, бележката и override-ите се редактират от панела горе.
            {calendarYear?.locked && (
              <span className="ml-2 text-warning-800">Годината е заключена.</span>
            )}
          </p>
        </div>
        <nav className="flex items-center gap-2">
          <Link
            href={{ pathname: "/admin/calendar", query: { year: year - 1 } }}
            className="h-8 px-3 inline-flex items-center rounded-lg bg-neutral-100 text-base text-neutral-900 hover:bg-neutral-150 transition-colors duration-120"
          >
            ← {year - 1}
          </Link>
          <Link
            href={{ pathname: "/admin/calendar", query: { year: year + 1 } }}
            className="h-8 px-3 inline-flex items-center rounded-lg bg-neutral-100 text-base text-neutral-900 hover:bg-neutral-150 transition-colors duration-120"
          >
            {year + 1} →
          </Link>
        </nav>
      </div>

      <CalendarGrid
        year={year}
        locked={!!calendarYear?.locked}
        months={months.map<MonthInfo>((m) => {
          const cells = buildMonthCellsWithGaps(year, m);
          return {
            month: m,
            cells: cells.map<CellInfo>((d) => {
              if (!d) return null;
              const iso = toIsoDate(d);
              const override = byIso.get(iso);
              const note = noteByIso.get(iso) ?? null;
              const isWeekend = mondayBasedWeekday(d) >= 5;
              const defaultWorking = !isWeekend;
              const effectiveWorking = override ? override.isWorking : defaultWorking;
              const isHoliday = !effectiveWorking && !isWeekend;
              const isCompensatory = effectiveWorking && isWeekend;
              const isAnnotatedOnly =
                !!override && !isHoliday && !isCompensatory;
              const baseHover =
                override?.holidayName ??
                (isHoliday ? "Празник" : isCompensatory ? "Компенсаторен" : "");

              // Tri-state day type for prefill — null means "no override".
              let effectiveDayType: "holiday" | "working" | "compensatory" | null = null;
              if (override) {
                if (!override.isWorking) effectiveDayType = "holiday";
                else if (isWeekend) effectiveDayType = "compensatory";
                else effectiveDayType = "working";
              }

              return {
                iso,
                day: d.getUTCDate(),
                isWeekend,
                isHoliday,
                isCompensatory,
                isAnnotatedOnly,
                hasNote: !!note,
                isToday: iso === todayIso,
                hoverLabel: note
                  ? baseHover
                    ? `${baseHover} — ${note}`
                    : note
                  : baseHover,
                holidayName: override?.holidayName ?? null,
                note,
                effectiveDayType,
              };
            }),
          };
        })}
      />

      {overrides.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-md font-medium text-neutral-900">
            Override-и за {year} ({overrides.length})
          </h2>
          <ul className="text-sm text-neutral-600 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
            {overrides.map((o) => (
              <li key={toIsoDate(o.day)} className="flex items-center gap-2">
                <span className="tabular-nums font-mono w-20">{toIsoDate(o.day)}</span>
                <span className="text-neutral-900">
                  {o.isWorking ? "Работен" : "Почивен"}
                </span>
                {o.holidayName && <span className="text-neutral-500">— {o.holidayName}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
