"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
} from "@/lib/leads/constants";
import { paramArray, useDebouncedQueryReplace } from "@/lib/use-filter-url";
import type { LeadSource, LeadStatus } from "@prisma/client";

type Owner = { id: string; fullName: string };

type Props = {
  buildings: readonly string[];
  owners: Owner[];
};

const SELECT_CLS =
  "block w-full px-3 py-2 rounded-lg bg-neutral-100 text-base text-neutral-900 tracking-tight focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120";

const ALL_STATUSES: LeadStatus[] = ["new", "in_progress", "converted", "no_progress"];
const ALL_SOURCES: LeadSource[] = ["manual", "email_form", "email_unparsed", "phone"];

export function LeadFilters({ buildings, owners }: Props) {
  const params = useSearchParams();

  const hasAnyFilter =
    params.has("status") ||
    params.has("source") ||
    params.has("owner") ||
    params.has("building") ||
    params.has("from") ||
    params.has("to");

  const [open, setOpen] = useState(hasAnyFilter);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [statuses, setStatuses] = useState<string[]>(paramArray(params, "status"));
  const [sources, setSources] = useState<string[]>(paramArray(params, "source"));
  const [ownersSel, setOwnersSel] = useState<string[]>(paramArray(params, "owner"));
  const [buildingsSel, setBuildingsSel] = useState<string[]>(paramArray(params, "building"));
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");

  const targetQs = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (statuses.length) p.set("status", statuses.join(","));
    if (sources.length) p.set("source", sources.join(","));
    if (ownersSel.length) p.set("owner", ownersSel.join(","));
    if (buildingsSel.length) p.set("building", buildingsSel.join(","));
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  }, [q, statuses, sources, ownersSel, buildingsSel, from, to]);

  const { pending } = useDebouncedQueryReplace({ pathname: "/leads", targetQs });

  const clear = () => {
    setQ("");
    setStatuses([]);
    setSources([]);
    setOwnersSel([]);
    setBuildingsSel([]);
    setFrom("");
    setTo("");
  };

  const selectOptions = (e: React.ChangeEvent<HTMLSelectElement>) =>
    Array.from(e.target.selectedOptions).map((o) => o.value);

  const ownerOptions = [
    { value: "none", label: "— Без отговорник —" },
    ...owners.map((o) => ({ value: o.id, label: o.fullName })),
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          type="search"
          placeholder="Търси по клиент, телефон, имейл, съобщение…"
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
            <label className="text-sm font-medium text-neutral-700">Статус</label>
            <select
              multiple
              size={4}
              value={statuses}
              onChange={(e) => setStatuses(selectOptions(e))}
              className={SELECT_CLS}
            >
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Източник</label>
            <select
              multiple
              size={4}
              value={sources}
              onChange={(e) => setSources(selectOptions(e))}
              className={SELECT_CLS}
            >
              {ALL_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Отговорник</label>
            <select
              multiple
              size={5}
              value={ownersSel}
              onChange={(e) => setOwnersSel(selectOptions(e))}
              className={SELECT_CLS}
            >
              {ownerOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Сграда</label>
            <select
              multiple
              size={5}
              value={buildingsSel}
              onChange={(e) => setBuildingsSel(selectOptions(e))}
              className={SELECT_CLS}
            >
              {buildings.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-sm font-medium text-neutral-700">Дата на добавяне</label>
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
