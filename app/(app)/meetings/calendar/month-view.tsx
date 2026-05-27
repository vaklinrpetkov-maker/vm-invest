"use client";

import Link from "next/link";
import type { Route } from "next";
import type { MeetingType } from "@prisma/client";
import { cn } from "@/lib/cn";
import {
  MEETING_TYPE_COLORS_HEX,
  MEETING_TYPE_LABELS,
} from "@/lib/meetings/constants";
import {
  WEEKDAY_SHORT_BG,
  monthGrid,
  toIsoDate,
} from "@/lib/meetings/calendar-helpers";

export type MonthMeeting = {
  id: string;
  isoDate: string; // YYYY-MM-DD in Europe/Sofia
  startHour: number;
  startMinute: number;
  type: MeetingType;
  status: "upcoming" | "happened" | "cancelled";
  contactName: string;
  pastDate: boolean;
};

type Props = {
  anchor: Date;
  meetings: MonthMeeting[];
};

const MAX_PER_CELL = 3;

export function MonthView({ anchor, meetings }: Props) {
  const cells = monthGrid(anchor);
  const currentMonth = anchor.getUTCMonth();
  const todayIso = toIsoDate(
    new Date(
      Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        new Date().getUTCDate(),
      ),
    ),
  );

  const byDay = new Map<string, MonthMeeting[]>();
  for (const m of meetings) {
    const arr = byDay.get(m.isoDate) ?? [];
    arr.push(m);
    byDay.set(m.isoDate, arr);
  }
  // Sort each day's meetings by start time.
  for (const arr of byDay.values()) {
    arr.sort((a, b) =>
      a.startHour !== b.startHour
        ? a.startHour - b.startHour
        : a.startMinute - b.startMinute,
    );
  }

  return (
    <div className="bg-neutral-0 rounded-lg overflow-hidden">
      <div className="grid grid-cols-7 border-b border-neutral-150">
        {WEEKDAY_SHORT_BG.map((label, i) => (
          <div
            key={label}
            className={cn(
              "py-2 text-center text-xs font-medium",
              i >= 5 ? "text-neutral-400" : "text-neutral-500",
            )}
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 auto-rows-fr" style={{ minHeight: "60vh" }}>
        {cells.map((d) => {
          const iso = toIsoDate(d);
          const inMonth = d.getUTCMonth() === currentMonth;
          const isToday = iso === todayIso;
          const wd = (d.getUTCDay() + 6) % 7;
          const isWeekend = wd >= 5;
          const dayMeetings = byDay.get(iso) ?? [];
          const shown = dayMeetings.slice(0, MAX_PER_CELL);
          const overflow = dayMeetings.length - shown.length;

          return (
            <div
              key={iso}
              className={cn(
                "border-t border-l border-neutral-150 p-1 flex flex-col gap-0.5 min-h-24",
                isWeekend && inMonth && "bg-neutral-50",
                !inMonth && "bg-neutral-25",
              )}
            >
              <div className="flex items-center justify-between px-1">
                <Link
                  href={`/meetings/new?date=${iso}` as Route}
                  className={cn(
                    "text-sm tabular-nums px-1 rounded-sm hover:bg-neutral-100 transition-colors duration-120",
                    isToday
                      ? "text-accent-800 font-medium"
                      : inMonth
                        ? "text-neutral-900"
                        : "text-neutral-400",
                  )}
                  title={`Създай среща на ${iso}`}
                >
                  {d.getUTCDate()}
                </Link>
                {dayMeetings.length > 0 && (
                  <span className="text-xs text-neutral-400 tabular-nums">
                    {dayMeetings.length}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-0.5">
                {shown.map((m) => {
                  const color = MEETING_TYPE_COLORS_HEX[m.type];
                  return (
                    <Link
                      key={m.id}
                      href={`/meetings/${m.id}` as Route}
                      className={cn(
                        "flex items-center gap-1.5 px-1 py-0.5 rounded-sm text-xs truncate",
                        "hover:brightness-95 transition-[filter] duration-120",
                        m.status === "happened" && "opacity-80",
                        m.status === "cancelled" && "opacity-60 line-through",
                      )}
                      style={{
                        backgroundColor: `${color}1a`,
                        borderLeft: `2px solid ${color}`,
                        color: "#17170F",
                        outline: m.pastDate ? "1px solid #B03A1E" : undefined,
                        outlineOffset: "-1px",
                      }}
                      title={`${m.contactName} · ${MEETING_TYPE_LABELS[m.type]}`}
                    >
                      <span className="tabular-nums text-neutral-700">
                        {String(m.startHour).padStart(2, "0")}:
                        {String(m.startMinute).padStart(2, "0")}
                      </span>
                      <span className="truncate">{m.contactName}</span>
                    </Link>
                  );
                })}
                {overflow > 0 && (
                  <Link
                    href={
                      {
                        pathname: "/meetings/calendar",
                        query: { view: "week", date: iso },
                      } as unknown as Route
                    }
                    className="px-1 text-xs text-neutral-500 hover:text-neutral-900 transition-colors duration-120"
                  >
                    +{overflow} още
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
