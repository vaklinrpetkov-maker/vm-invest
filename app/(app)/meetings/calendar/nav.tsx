"use client";

import Link from "next/link";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  MEETING_TYPE_COLORS_HEX,
  MEETING_TYPE_LABELS,
} from "@/lib/meetings/constants";
import type { MeetingType } from "@prisma/client";
import type { CalendarView } from "@/lib/meetings/calendar-helpers";

type NavProps = {
  view: CalendarView;
  anchorIso: string;
  prevHref: Route;
  nextHref: Route;
  todayHref: Route;
  weekHref: Route;
  monthHref: Route;
  listHref: Route;
  newHref: Route;
  title: string;
};

export function CalendarNav({
  view,
  prevHref,
  nextHref,
  todayHref,
  weekHref,
  monthHref,
  listHref,
  newHref,
  title,
}: NavProps) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <Link href={todayHref}>
          <Button variant="secondary" size="sm">
            Днес
          </Button>
        </Link>
        <div className="flex items-center gap-1">
          <Link href={prevHref}>
            <Button variant="ghost" size="sm" aria-label="Назад">
              ←
            </Button>
          </Link>
          <Link href={nextHref}>
            <Button variant="ghost" size="sm" aria-label="Напред">
              →
            </Button>
          </Link>
        </div>
        <span className="text-md text-neutral-900 font-medium px-2">{title}</span>
      </div>
      <div className="flex items-center gap-1 bg-neutral-100 rounded-lg p-0.5">
        <Link
          href={weekHref}
          className={cn(
            "h-7 px-3 inline-flex items-center rounded-md text-sm transition-colors duration-120",
            view === "week"
              ? "bg-neutral-0 text-neutral-900"
              : "text-neutral-600 hover:text-neutral-900",
          )}
        >
          Седмица
        </Link>
        <Link
          href={monthHref}
          className={cn(
            "h-7 px-3 inline-flex items-center rounded-md text-sm transition-colors duration-120",
            view === "month"
              ? "bg-neutral-0 text-neutral-900"
              : "text-neutral-600 hover:text-neutral-900",
          )}
        >
          Месец
        </Link>
        <Link
          href={listHref}
          className="h-7 px-3 inline-flex items-center rounded-md text-sm text-neutral-600 hover:text-neutral-900 transition-colors duration-120"
        >
          Списък
        </Link>
      </div>
      <Link href={newHref}>
        <Button size="sm">+ Нова среща</Button>
      </Link>
    </div>
  );
}

export function Legend() {
  const TYPES: MeetingType[] = [
    "office_presentation",
    "onsite_presentation",
    "contract_signing",
    "follow_up",
    "other",
  ];
  return (
    <div className="flex items-center gap-4 flex-wrap text-sm">
      {TYPES.map((t) => (
        <div key={t} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: MEETING_TYPE_COLORS_HEX[t] }}
          />
          <span className="text-neutral-700">{MEETING_TYPE_LABELS[t]}</span>
        </div>
      ))}
    </div>
  );
}
