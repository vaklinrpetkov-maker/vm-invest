"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import {
  MEETING_STATUS_LABELS,
  MEETING_TYPE_LABELS,
} from "@/lib/meetings/constants";
import { paramArray, useDebouncedQueryReplace } from "@/lib/use-filter-url";
import type { MeetingStatus, MeetingType } from "@prisma/client";

type Owner = { id: string; fullName: string };

type Props = {
  assignees: Owner[];
};

const SELECT_CLS =
  "block w-full px-3 py-2 rounded-lg bg-neutral-100 text-base text-neutral-900 tracking-tight focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120";

const ALL_TYPES: MeetingType[] = [
  "office_presentation",
  "onsite_presentation",
  "contract_signing",
  "follow_up",
  "other",
];

const ALL_STATUSES: MeetingStatus[] = ["upcoming", "happened", "cancelled"];

export function MeetingFilters({ assignees }: Props) {
  const params = useSearchParams();

  const hasAnyFilter =
    params.has("type") ||
    params.has("status") ||
    params.has("assignee") ||
    params.has("from") ||
    params.has("to");

  const [open, setOpen] = useState(hasAnyFilter);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [types, setTypes] = useState<string[]>(paramArray(params, "type"));
  const [statuses, setStatuses] = useState<string[]>(paramArray(params, "status"));
  const [assigneesSel, setAssigneesSel] = useState<string[]>(paramArray(params, "assignee"));
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");

  const targetQs = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (types.length) p.set("type", types.join(","));
    if (statuses.length) p.set("status", statuses.join(","));
    if (assigneesSel.length) p.set("assignee", assigneesSel.join(","));
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  }, [q, types, statuses, assigneesSel, from, to]);

  const { pending } = useDebouncedQueryReplace({ pathname: "/meetings", targetQs });

  const clear = () => {
    setQ("");
    setTypes([]);
    setStatuses([]);
    setAssigneesSel([]);
    setFrom("");
    setTo("");
  };

  const selectOptions = (e: React.ChangeEvent<HTMLSelectElement>) =>
    Array.from(e.target.selectedOptions).map((o) => o.value);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          type="search"
          placeholder="Търси по клиент, локация, бележки…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-1"
        />
        <Button
          type="button"
          variant={open ? "secondary" : "ghost"}
          onClick={() => setOpen((x) => !x)}
        >
          {open ? "Скрий филтри" : "Филтри"}
          {hasAnyFilter && !open && (
            <span className="ml-2 inline-block w-2 h-2 rounded-full bg-accent-500" />
          )}
        </Button>
        {(hasAnyFilter || q) && (
          <Button type="button" variant="ghost" onClick={clear}>
            Изчисти
          </Button>
        )}
      </div>

      {open && (
        <div className="bg-neutral-0 rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Тип</label>
            <select
              multiple
              size={5}
              value={types}
              onChange={(e) => setTypes(selectOptions(e))}
              className={SELECT_CLS}
            >
              {ALL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {MEETING_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">
              Статус
              <span className="text-neutral-400 font-normal text-xs ml-1">
                (Отменените са скрити по подразбиране)
              </span>
            </label>
            <select
              multiple
              size={3}
              value={statuses}
              onChange={(e) => setStatuses(selectOptions(e))}
              className={SELECT_CLS}
            >
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {MEETING_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Участник</label>
            <select
              multiple
              size={5}
              value={assigneesSel}
              onChange={(e) => setAssigneesSel(selectOptions(e))}
              className={SELECT_CLS}
            >
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-sm font-medium text-neutral-700">Дата на срещата</label>
            <div className="flex items-center gap-2">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <span className="text-sm text-neutral-500">до</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      <div className={cn("text-sm text-neutral-500", !pending && "invisible")}>
        Обновяване…
      </div>
    </div>
  );
}
