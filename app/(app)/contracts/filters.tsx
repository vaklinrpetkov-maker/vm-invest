"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import {
  CONTRACT_STATUSES,
  CONTRACT_STATUS_LABELS,
  CONTRACT_TYPES,
  CONTRACT_TYPE_LABELS,
  type ContractStatus,
  type ContractType,
} from "@/lib/contracts/constants";
import { paramArray, useDebouncedQueryReplace } from "@/lib/use-filter-url";

// URL-synced filter bar for /contracts. Same shape as the others — see
// `lib/use-filter-url.ts` for the shared debounce / no-op-guard / page-drop
// machinery.

type Props = {
  buildings: readonly string[];
  salespeople: readonly string[];
};

const SELECT_CLS =
  "block w-full px-3 py-2 rounded-lg bg-neutral-100 text-base text-neutral-900 tracking-tight focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120";

export function ContractFilters({ buildings, salespeople }: Props) {
  const params = useSearchParams();

  const hasAnyFilter =
    params.has("status") ||
    params.has("type") ||
    params.has("building") ||
    params.has("salesperson") ||
    params.has("preOrPost") ||
    params.has("usesCredit") ||
    params.has("hasRemaining") ||
    params.has("totalMin") ||
    params.has("totalMax");

  const [open, setOpen] = useState(hasAnyFilter);

  const [q, setQ] = useState(params.get("q") ?? "");
  const [statuses, setStatuses] = useState<string[]>(paramArray(params, "status"));
  const [types, setTypes] = useState<string[]>(paramArray(params, "type"));
  const [buildingsSel, setBuildingsSel] = useState<string[]>(paramArray(params, "building"));
  const [salespeopleSel, setSalespeopleSel] = useState<string[]>(paramArray(params, "salesperson"));
  const [preOrPost, setPreOrPost] = useState<string[]>(paramArray(params, "preOrPost"));
  const [usesCredit, setUsesCredit] = useState(params.get("usesCredit") ?? "any");
  const [hasRemaining, setHasRemaining] = useState(params.get("hasRemaining") ?? "any");
  const [totalMin, setTotalMin] = useState(params.get("totalMin") ?? "");
  const [totalMax, setTotalMax] = useState(params.get("totalMax") ?? "");

  const targetQs = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (statuses.length) p.set("status", statuses.join(","));
    if (types.length) p.set("type", types.join(","));
    if (buildingsSel.length) p.set("building", buildingsSel.join(","));
    if (salespeopleSel.length) p.set("salesperson", salespeopleSel.join(","));
    if (preOrPost.length) p.set("preOrPost", preOrPost.join(","));
    if (usesCredit === "yes" || usesCredit === "no") p.set("usesCredit", usesCredit);
    if (hasRemaining === "yes" || hasRemaining === "no") p.set("hasRemaining", hasRemaining);
    if (totalMin) p.set("totalMin", totalMin);
    if (totalMax) p.set("totalMax", totalMax);
    return p.toString();
  }, [
    q, statuses, types, buildingsSel, salespeopleSel, preOrPost,
    usesCredit, hasRemaining, totalMin, totalMax,
  ]);

  const { pending } = useDebouncedQueryReplace({ pathname: "/contracts", targetQs });

  const clear = () => {
    setQ("");
    setStatuses([]);
    setTypes([]);
    setBuildingsSel([]);
    setSalespeopleSel([]);
    setPreOrPost([]);
    setUsesCredit("any");
    setHasRemaining("any");
    setTotalMin("");
    setTotalMax("");
  };

  const selectOptions = (e: React.ChangeEvent<HTMLSelectElement>) =>
    Array.from(e.target.selectedOptions).map((o) => o.value);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          type="search"
          placeholder="Търси по договор, купувач, търговец…"
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
              size={3}
              value={statuses}
              onChange={(e) => setStatuses(selectOptions(e))}
              className={SELECT_CLS}
            >
              {CONTRACT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CONTRACT_STATUS_LABELS[s as ContractStatus]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Тип договор</label>
            <select
              multiple
              size={4}
              value={types}
              onChange={(e) => setTypes(selectOptions(e))}
              className={SELECT_CLS}
            >
              {CONTRACT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CONTRACT_TYPE_LABELS[t as ContractType]}
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

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Търговец</label>
            <select
              multiple
              size={5}
              value={salespeopleSel}
              onChange={(e) => setSalespeopleSel(selectOptions(e))}
              className={SELECT_CLS}
            >
              {salespeople.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Преди / След</label>
            <select
              multiple
              size={2}
              value={preOrPost}
              onChange={(e) => setPreOrPost(selectOptions(e))}
              className={SELECT_CLS}
            >
              <option value="Преди">Преди</option>
              <option value="След">След</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Кредит</label>
            <select
              value={usesCredit}
              onChange={(e) => setUsesCredit(e.target.value)}
              className={SELECT_CLS}
            >
              <option value="any">Всички</option>
              <option value="yes">С кредит</option>
              <option value="no">Без кредит</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Има остатък</label>
            <select
              value={hasRemaining}
              onChange={(e) => setHasRemaining(e.target.value)}
              className={SELECT_CLS}
            >
              <option value="any">Всички</option>
              <option value="yes">Има дължимо</option>
              <option value="no">Платени изцяло</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Обща сума (EUR)</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="от"
                value={totalMin}
                onChange={(e) => setTotalMin(e.target.value)}
              />
              <span className="text-sm text-neutral-500">–</span>
              <Input
                type="number"
                placeholder="до"
                value={totalMax}
                onChange={(e) => setTotalMax(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      <div className={cn("text-sm text-neutral-500", !pending && "invisible")}>Обновяване…</div>
    </div>
  );
}
