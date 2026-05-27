"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { paramArray, useDebouncedQueryReplace } from "@/lib/use-filter-url";

type Owner = { id: string; fullName: string };

type Props = {
  types: readonly string[];
  buildings: readonly string[];
  owners: Owner[];
};

const SELECT_CLS =
  "block w-full px-3 py-2 rounded-lg bg-neutral-100 text-base text-neutral-900 tracking-tight focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120";

export function ContactFilters({ types, buildings, owners }: Props) {
  const params = useSearchParams();

  const hasAnyFilter =
    params.has("type") ||
    params.has("owner") ||
    params.has("building") ||
    params.has("from") ||
    params.has("to") ||
    params.has("bdays");

  const [open, setOpen] = useState(hasAnyFilter);

  const [q, setQ] = useState(params.get("q") ?? "");
  const [selectedTypes, setSelectedTypes] = useState<string[]>(paramArray(params, "type"));
  const [selectedOwners, setSelectedOwners] = useState<string[]>(paramArray(params, "owner"));
  const [selectedBuildings, setSelectedBuildings] = useState<string[]>(
    paramArray(params, "building"),
  );
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");
  const [bdays, setBdays] = useState(params.get("bdays") ?? "");

  // Compute the URL the current filter state would produce. Kept as a
  // string so the hook's dep comparison is value-based.
  const targetQs = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (selectedTypes.length) p.set("type", selectedTypes.join(","));
    if (selectedOwners.length) p.set("owner", selectedOwners.join(","));
    if (selectedBuildings.length) p.set("building", selectedBuildings.join(","));
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (bdays) p.set("bdays", bdays);
    return p.toString();
  }, [q, selectedTypes, selectedOwners, selectedBuildings, from, to, bdays]);

  const { pending } = useDebouncedQueryReplace({ pathname: "/contacts", targetQs });

  const clear = () => {
    setQ("");
    setSelectedTypes([]);
    setSelectedOwners([]);
    setSelectedBuildings([]);
    setFrom("");
    setTo("");
    setBdays("");
  };

  const selectOptions = (e: React.ChangeEvent<HTMLSelectElement>) =>
    Array.from(e.target.selectedOptions).map((o) => o.value);

  const ownerOptions: Array<{ value: string; label: string }> = [
    { value: "none", label: "— Без отговорник —" },
    ...owners.map((o) => ({ value: o.id, label: o.fullName })),
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          type="search"
          placeholder="Търси по име, телефон, имейл, ЕГН, имоти или бележки…"
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
              value={selectedTypes}
              onChange={(e) => setSelectedTypes(selectOptions(e))}
              className={SELECT_CLS}
            >
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Отговорник</label>
            <select
              multiple
              size={5}
              value={selectedOwners}
              onChange={(e) => setSelectedOwners(selectOptions(e))}
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
              value={selectedBuildings}
              onChange={(e) => setSelectedBuildings(selectOptions(e))}
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
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
              <span className="text-sm text-neutral-500">до</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">
              Рождени дни през следващите N дни
            </label>
            <Input
              type="number"
              min={1}
              max={366}
              placeholder="напр. 14"
              value={bdays}
              onChange={(e) => setBdays(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className={cn("text-sm text-neutral-500", !pending && "invisible")}>
        Обновяване…
      </div>
    </div>
  );
}
