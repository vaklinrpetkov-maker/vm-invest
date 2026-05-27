"use client";

// Section chrome for the activity block on the renovation detail page: title
// + progress + tab toggle (Списък / Гант) + "+ Добави дейност" button +
// "Преподреди по сегашния ред" button. Wraps the editor + read-only Gantt.
//
// "+ Добави дейност" opens an inline sub-panel with a checklist of templates
// not yet loaded onto this renovation (strict one-of-each per spec).

import { useMemo, useState, useTransition } from "react";
import type { ApartmentSize } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { FieldHelp } from "@/components/ui/field-help";
import { StatusBadge } from "@/components/ui/status-badge";
import type { BadgeTone } from "@/components/ui/status-badge";
import { GanttChart, type GanttRow } from "@/components/ui/gantt-chart";
import {
  TeamCapacityStrip,
  type TeamCapacityStripRow,
} from "@/components/ui/team-capacity-strip";
import { cn } from "@/lib/cn";
import { computeViewport, type Viewport } from "@/lib/gantt";
import {
  APARTMENT_SIZE_DURATION_FIELD,
  RENOVATION_TASK_STATUS_TONES,
} from "@/lib/renovations/constants";
import {
  addRenovationActivities,
  rechainRenovationActivities,
} from "../actions";
import {
  TemplateDurationBreakdown,
  type ActivityTemplateOption,
} from "../renovation-form";
import {
  RenovationActivitiesEditor,
  type ActivityRowVm,
} from "./activities-editor";

// Capacity overlay (R4). `capacityDangerDays` are ISO-day strings the
// Gantt should red-tint; `teamLoad` feeds the per-team strip below the
// chart. Both are computed server-side for the renovation's window.
export type CapacityTeamLoad = {
  teamId: string;
  name: string;
  specialty: string | null;
  totalPeople: number;
  // Plain object since this crosses the server→client boundary; the strip
  // hydrates it into a Map internally.
  loadByDay: Record<string, number>;
};

type Props = {
  renovationId: string;
  activities: ActivityRowVm[];
  apartmentSize: ApartmentSize | null;
  bathroomCount: number;
  plannedStartDate: Date | null;
  plannedEndDate: Date | null;
  availableTemplates: ActivityTemplateOption[];
  canEdit: boolean;
  capacityDangerDays: ReadonlyArray<string>;
  teamLoad: ReadonlyArray<CapacityTeamLoad>;
};

type Tab = "list" | "gantt";

export function ActivitiesSection({
  renovationId,
  activities,
  apartmentSize,
  bathroomCount,
  plannedStartDate,
  plannedEndDate,
  availableTemplates,
  canEdit,
  capacityDangerDays,
  teamLoad,
}: Props) {
  const [tab, setTab] = useState<Tab>("list");
  const [addingOpen, setAddingOpen] = useState(false);
  // "Покажи целия проект" toggle (spec §6.4). When off, the Gantt auto-fits
  // to the activity bars only. When on, the renovation's planned start +
  // cached planned end are pushed in as extra dates so the axis covers the
  // full envelope (useful when activities have been manually shifted
  // outside their original range and the project bookends sit outside).
  const [showFullProject, setShowFullProject] = useState(false);

  const total = activities.length;
  const done = activities.filter((a) => a.status === "done").length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  // Effort summary (sum of people-required × days) + max simultaneous people
  // across the project window — quick health-check shown in the footer.
  // Per spec §6.3: total activities · effort (man-days) · max simultaneous
  // people-required. Max-simultaneous walks each day in the project window
  // and sums people-required across non-cancelled activities active on
  // that day; takes the peak. Pure client compute — small enough at the
  // ~29-activity scale we run at.
  const { effortSummary, maxSimultaneous } = useMemo(() => {
    let effort = 0;
    let minMs = Infinity;
    let maxMs = -Infinity;
    for (const a of activities) {
      if (a.status === "cancelled") continue;
      effort += a.peopleRequired * a.durationDays;
      if (a.startDateIso) {
        const s = new Date(`${a.startDateIso}T00:00:00Z`).getTime();
        if (s < minMs) minMs = s;
      }
      if (a.endDateIso) {
        const e = new Date(`${a.endDateIso}T00:00:00Z`).getTime();
        if (e > maxMs) maxMs = e;
      }
    }
    let peak = 0;
    if (minMs !== Infinity && maxMs !== -Infinity) {
      const DAY_MS = 24 * 60 * 60 * 1000;
      for (let t = minMs; t <= maxMs; t += DAY_MS) {
        let dayLoad = 0;
        for (const a of activities) {
          if (a.status === "cancelled") continue;
          if (!a.startDateIso || !a.endDateIso) continue;
          const s = new Date(`${a.startDateIso}T00:00:00Z`).getTime();
          const e = new Date(`${a.endDateIso}T00:00:00Z`).getTime();
          if (s <= t && t <= e) dayLoad += a.peopleRequired;
        }
        if (dayLoad > peak) peak = dayLoad;
      }
    }
    return { effortSummary: effort, maxSimultaneous: peak };
  }, [activities]);

  // Today (ISO) used to flag overdue activities — same rule as the list
  // editor's danger-tone left border.
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const ganttRows = useMemo<GanttRow[]>(
    () =>
      activities.map((a) => ({
        id: a.id,
        label: a.name,
        sublabel: a.teamSpecialty ?? a.teamName ?? "Outsourced",
        start: a.startDateIso ? new Date(`${a.startDateIso}T00:00:00Z`) : null,
        end: a.endDateIso ? new Date(`${a.endDateIso}T00:00:00Z`) : null,
        tone: RENOVATION_TASK_STATUS_TONES[a.status] as BadgeTone,
        // Spec §6.4 — overdue bars get a danger-tone left border. Same
        // condition the row editor uses for the row stripe.
        overdue:
          a.endDateIso !== null &&
          a.status !== "done" &&
          a.status !== "cancelled" &&
          a.endDateIso < todayIso,
      })),
    [activities, todayIso],
  );

  // Shared viewport between the Gantt and the capacity strip — must match
  // the bar positions exactly. Same defaults as <GanttChart> (7-day pad).
  // When `showFullProject` is off (the default), we feed empty extraDates
  // so the axis fits the activity bars only — that's the spec default.
  // Toggle on to widen to the renovation envelope.
  const extraDates = useMemo(
    () =>
      showFullProject ? [plannedStartDate, plannedEndDate] : [],
    [showFullProject, plannedStartDate, plannedEndDate],
  );
  const sharedViewport = useMemo<Viewport | null>(
    () =>
      computeViewport(
        ganttRows.map((r) => ({ start: r.start, end: r.end })),
        { padDays: 7, extraDates },
      ),
    [ganttRows, extraDates],
  );

  // Hydrate the loadByDay record into a Map for the strip component.
  const stripTeams = useMemo<TeamCapacityStripRow[]>(
    () =>
      teamLoad.map((t) => ({
        teamId: t.teamId,
        name: t.name,
        specialty: t.specialty,
        totalPeople: t.totalPeople,
        loadByDay: new Map(Object.entries(t.loadByDay)),
      })),
    [teamLoad],
  );

  return (
    <section className="bg-neutral-0 rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-md font-medium text-neutral-900">
            Дейности{" "}
            {total > 0 && (
              <span className="text-sm text-neutral-500 font-normal">
                ({done} / {total} завършени · {pct}%)
              </span>
            )}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md bg-neutral-100 p-0.5">
            <TabButton current={tab} value="list" onClick={() => setTab("list")}>
              Списък
            </TabButton>
            <TabButton current={tab} value="gantt" onClick={() => setTab("gantt")}>
              Гант
            </TabButton>
          </div>
          {canEdit && (
            <>
              <RechainButton renovationId={renovationId} />
              <Button
                size="sm"
                onClick={() => setAddingOpen((x) => !x)}
                disabled={availableTemplates.length === 0}
                title={
                  availableTemplates.length === 0
                    ? "Всички дейности от каталога вече са заредени."
                    : undefined
                }
              >
                + Добави дейност
              </Button>
            </>
          )}
        </div>
      </div>

      {addingOpen && canEdit && apartmentSize && (
        <AddActivityPanel
          renovationId={renovationId}
          apartmentSize={apartmentSize}
          bathroomCount={bathroomCount}
          templates={availableTemplates}
          onClose={() => setAddingOpen(false)}
        />
      )}

      {tab === "list" ? (
        <RenovationActivitiesEditor
          renovationId={renovationId}
          activities={activities}
          canEdit={canEdit}
        />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-end">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none text-sm text-neutral-600">
              <input
                type="checkbox"
                checked={showFullProject}
                onChange={(e) => setShowFullProject(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-300 text-accent-500 focus:ring-accent-500/40"
              />
              Покажи целия проект
            </label>
          </div>
          <GanttChart
            rows={ganttRows}
            viewport={sharedViewport}
            dangerDays={capacityDangerDays}
          />
          {sharedViewport && stripTeams.length > 0 && (
            <TeamCapacityStrip
              viewport={sharedViewport}
              teams={stripTeams}
            />
          )}
        </div>
      )}

      {total > 0 && (
        <p className="text-xs text-neutral-500 pt-2 border-t border-neutral-150">
          Общо <span className="tabular-nums">{total}</span> дейности
          {effortSummary > 0 && (
            <>
              {" "}
              · оценка усилие: <span className="tabular-nums">{effortSummary.toFixed(1)}</span> човеко-дни
            </>
          )}
          {maxSimultaneous > 0 && (
            <>
              {" "}
              · пик паралелна заетост: <span className="tabular-nums">{maxSimultaneous}</span> {maxSimultaneous === 1 ? "човек" : "човека"}
            </>
          )}
        </p>
      )}
    </section>
  );
}

function TabButton({
  current,
  value,
  onClick,
  children,
}: {
  current: Tab;
  value: Tab;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "px-3 py-1 rounded text-sm transition-colors duration-120",
        active
          ? "bg-neutral-0 text-neutral-900 shadow-sm"
          : "text-neutral-600 hover:text-neutral-900",
      )}
    >
      {children}
    </button>
  );
}

function RechainButton({ renovationId }: { renovationId: string }) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  function onClick() {
    if (
      !confirm(
        "Пренареждане ще нагласи всички дати от планираното начало на ремонта в сегашния ред на дейностите. Продължи?",
      )
    )
      return;
    startTransition(async () => {
      setErr(null);
      const res = await rechainRenovationActivities(renovationId);
      if (!res.ok) setErr(res.error);
    });
  }
  return (
    <div className="flex items-center gap-2">
      {err && <span className="text-xs text-danger-700">{err}</span>}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClick}
        disabled={pending}
      >
        {pending ? "Пренареждане…" : "Преподреди дати"}
      </Button>
    </div>
  );
}

function AddActivityPanel({
  renovationId,
  apartmentSize,
  bathroomCount,
  templates,
  onClose,
}: {
  renovationId: string;
  apartmentSize: ApartmentSize;
  bathroomCount: number;
  templates: ActivityTemplateOption[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const dField = APARTMENT_SIZE_DURATION_FIELD[apartmentSize];

  function durationFor(t: ActivityTemplateOption): number {
    const base = t[dField];
    return t.bathroomMultiplied ? base * Math.max(1, bathroomCount) : base;
  }

  function submit() {
    if (selected.size === 0) {
      setErr("Изберете поне една дейност.");
      return;
    }
    startTransition(async () => {
      setErr(null);
      const ids = Array.from(selected);
      const res = await addRenovationActivities(renovationId, ids);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setSelected(new Set());
      onClose();
    });
  }

  return (
    <div className="border border-accent-200 bg-accent-50/30 rounded-lg p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-sm font-medium text-neutral-700">
          Избери дейности за зареждане
        </h3>
        <div className="text-xs text-neutral-500 flex items-center gap-4">
          <button
            type="button"
            onClick={() => setSelected(new Set(templates.map((t) => t.id)))}
            className="text-accent-700 hover:underline"
          >
            Избери всички
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-neutral-600 hover:text-neutral-900 hover:underline"
          >
            Изчисти
          </button>
        </div>
      </div>
      <div className="max-h-72 overflow-y-auto border border-neutral-200 bg-neutral-0 rounded-md">
        {templates.map((t, idx) => {
          const isChecked = selected.has(t.id);
          const dur = durationFor(t);
          return (
            <label
              key={t.id}
              className={cn(
                "flex items-center gap-3 px-3 py-2 cursor-pointer text-sm",
                idx > 0 && "border-t border-neutral-150",
                isChecked ? "bg-accent-50/50" : "hover:bg-neutral-50",
              )}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(t.id);
                  else next.delete(t.id);
                  setSelected(next);
                }}
                className="rounded"
              />
              <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                <span className="text-neutral-900">{t.name}</span>
                {t.teamName ? (
                  <StatusBadge tone="neutral">
                    {t.teamSpecialty ?? t.teamName}
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="neutral-outline">Outsourced</StatusBadge>
                )}
              </div>
              <span className="text-xs text-neutral-700 tabular-nums shrink-0">
                {dur}
                {t.bathroomMultiplied ? " дни (× бани)" : " дни"}
              </span>
              <FieldHelp
                title={t.name}
                content={<TemplateDurationBreakdown t={t} />}
              />
            </label>
          );
        })}
      </div>
      {err && <div className="text-sm text-danger-700">{err}</div>}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Зареждане…" : `Зареди (${selected.size})`}
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Откажи
        </Button>
      </div>
    </div>
  );
}
