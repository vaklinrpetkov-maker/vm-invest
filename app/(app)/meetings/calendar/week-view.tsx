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
  toIsoDate,
  weekDays,
} from "@/lib/meetings/calendar-helpers";

const HOUR_PX = 48; // pixel height per hour row
const TOTAL_HOURS = 24;

export type WeekMeeting = {
  id: string;
  isoDate: string; // YYYY-MM-DD in Europe/Sofia
  startHour: number;
  startMinute: number;
  durationMinutes: number;
  type: MeetingType;
  status: "upcoming" | "happened" | "cancelled";
  contactName: string;
  assigneeNames: string[];
  pastDate: boolean;
};

type Props = {
  anchor: Date;
  meetings: WeekMeeting[];
};

function assignLanes(items: WeekMeeting[]): Array<WeekMeeting & { lane: number; laneCount: number }> {
  // For a single day column: sort by start, greedily place into the first
  // available lane (lane becomes available when its last meeting has ended).
  const sorted = [...items].sort((a, b) => {
    if (a.startHour !== b.startHour) return a.startHour - b.startHour;
    return a.startMinute - b.startMinute;
  });
  const laneEnds: number[] = []; // minutes-from-midnight when each lane frees up
  const withLane: Array<WeekMeeting & { lane: number }> = [];
  for (const m of sorted) {
    const startM = m.startHour * 60 + m.startMinute;
    let lane = laneEnds.findIndex((end) => end <= startM);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = startM + m.durationMinutes;
    withLane.push({ ...m, lane });
  }
  const laneCount = Math.max(1, laneEnds.length);
  return withLane.map((m) => ({ ...m, laneCount }));
}

export function WeekView({ anchor, meetings }: Props) {
  const days = weekDays(anchor);
  const today = toIsoDate(
    new Date(
      Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        new Date().getUTCDate(),
      ),
    ),
  );

  // Group meetings by day iso for lane assignment
  const byDay = new Map<string, WeekMeeting[]>();
  for (const m of meetings) {
    const arr = byDay.get(m.isoDate) ?? [];
    arr.push(m);
    byDay.set(m.isoDate, arr);
  }

  return (
    <div className="bg-neutral-0 rounded-lg overflow-hidden">
      {/* Day header row */}
      <div className="grid" style={{ gridTemplateColumns: `56px repeat(7, 1fr)` }}>
        <div className="h-10" />
        {days.map((d) => {
          const iso = toIsoDate(d);
          const isToday = iso === today;
          const wd = (d.getUTCDay() + 6) % 7;
          const isWeekend = wd >= 5;
          return (
            <div
              key={iso}
              className={cn(
                "h-10 flex flex-col items-center justify-center border-l border-neutral-150 text-sm",
                isToday && "bg-accent-50 text-accent-800 font-medium",
                isWeekend && !isToday && "bg-neutral-50 text-neutral-500",
              )}
            >
              <span className="text-xs text-neutral-500">
                {WEEKDAY_SHORT_BG[wd]}
              </span>
              <span
                className={cn(
                  "text-base tabular-nums",
                  isToday ? "text-accent-800" : "text-neutral-900",
                )}
              >
                {d.getUTCDate()}
              </span>
            </div>
          );
        })}
      </div>

      {/* Scrollable grid */}
      <div
        className="relative overflow-auto border-t border-neutral-150"
        style={{ maxHeight: "72vh" }}
      >
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: `56px repeat(7, 1fr)`,
            height: HOUR_PX * TOTAL_HOURS,
          }}
        >
          {/* Hour labels column */}
          <div className="relative">
            {Array.from({ length: TOTAL_HOURS }, (_, h) => (
              <div
                key={h}
                className="absolute left-0 right-0 text-xs text-neutral-400 tabular-nums pr-1 text-right"
                style={{ top: h * HOUR_PX }}
              >
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((d) => {
            const iso = toIsoDate(d);
            const wd = (d.getUTCDay() + 6) % 7;
            const isWeekend = wd >= 5;
            const dayMeetings = assignLanes(byDay.get(iso) ?? []);
            return (
              <div
                key={iso}
                className={cn(
                  "relative border-l border-neutral-150",
                  isWeekend && "bg-neutral-50",
                )}
              >
                {/* Hour rules + click-to-create cells (underneath bars) */}
                {Array.from({ length: TOTAL_HOURS }, (_, h) => (
                  <Link
                    key={h}
                    href={
                      `/meetings/new?date=${iso}&hour=${String(h).padStart(2, "0")}` as Route
                    }
                    className="absolute left-0 right-0 border-t border-neutral-100 hover:bg-accent-50/40 transition-colors duration-120"
                    style={{ top: h * HOUR_PX, height: HOUR_PX }}
                    title={`Създай среща на ${iso} в ${String(h).padStart(2, "0")}:00`}
                  />
                ))}

                {/* Meeting bars */}
                {dayMeetings.map((m) => {
                  const top = m.startHour * HOUR_PX + (m.startMinute / 60) * HOUR_PX;
                  const height = Math.max(
                    18,
                    (m.durationMinutes / 60) * HOUR_PX,
                  );
                  const widthPct = 100 / m.laneCount;
                  const leftPct = m.lane * widthPct;
                  const color = MEETING_TYPE_COLORS_HEX[m.type];
                  return (
                    <Link
                      key={m.id}
                      href={`/meetings/${m.id}` as Route}
                      className={cn(
                        "absolute rounded-md px-1.5 py-0.5 text-xs overflow-hidden",
                        "hover:brightness-95 transition-[filter] duration-120",
                        m.status === "happened" && "opacity-80",
                        m.status === "cancelled" && "opacity-60 line-through",
                      )}
                      style={{
                        top,
                        height,
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        backgroundColor: `${color}1a`, // ~10% opacity tint
                        borderLeft: `3px solid ${color}`,
                        color: "#17170F",
                        // Red border overlay for past-date flag
                        outline: m.pastDate ? "1px solid #B03A1E" : undefined,
                        outlineOffset: "-1px",
                      }}
                      title={`${m.contactName} · ${MEETING_TYPE_LABELS[m.type]}${
                        m.assigneeNames.length
                          ? ` · ${m.assigneeNames.join(", ")}`
                          : ""
                      }`}
                    >
                      <div className="font-medium tabular-nums leading-tight">
                        {String(m.startHour).padStart(2, "0")}:
                        {String(m.startMinute).padStart(2, "0")}
                      </div>
                      <div className="truncate leading-tight">{m.contactName}</div>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
