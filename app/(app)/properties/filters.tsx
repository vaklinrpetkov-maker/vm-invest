"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { PROPERTY_STATUSES, PROPERTY_TYPES } from "@/lib/properties/constants";
import { paramArray, useDebouncedQueryReplace } from "@/lib/use-filter-url";

// URL-synced filter bar for /properties. URL-sync machinery lives in
// `lib/use-filter-url.ts`; this component owns the per-field state +
// `targetQs` builder.
//
// NOTE: building selection is owned by the left-side navigator — not by this
// filter bar — because they'd both write to `?building=<id>` and the state
// desync would cause the navigator's click to get stripped after 250 ms. The
// bar preserves `?building` + `?complex` from the URL unchanged.

type Props = {
  sellers: readonly string[];
  entrances: readonly string[];
};

const SELECT_CLS =
  "block w-full px-3 py-2 rounded-lg bg-neutral-100 text-base text-neutral-900 tracking-tight focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120";

export function PropertyFilters({ sellers, entrances }: Props) {
  const params = useSearchParams();

  // `building` + `complex` are owned by the navigator, not the filter bar —
  // deliberately excluded from the "any filter active" indicator so the chip
  // only reflects bar-managed state.
  const hasAnyFilter =
    params.has("status") ||
    params.has("type") ||
    params.has("entrance") ||
    params.has("seller") ||
    params.has("floorMin") ||
    params.has("floorMax") ||
    params.has("priceMin") ||
    params.has("priceMax") ||
    params.has("netMin") ||
    params.has("netMax") ||
    params.has("hasOwner") ||
    params.has("hasCredit");

  const [open, setOpen] = useState(hasAnyFilter);

  const [q, setQ] = useState(params.get("q") ?? "");
  const [statuses, setStatuses] = useState<string[]>(paramArray(params, "status"));
  const [types, setTypes] = useState<string[]>(paramArray(params, "type"));
  const [entrancesSel, setEntrancesSel] = useState<string[]>(paramArray(params, "entrance"));
  const [sellersSel, setSellersSel] = useState<string[]>(paramArray(params, "seller"));
  const [floorMin, setFloorMin] = useState(params.get("floorMin") ?? "");
  const [floorMax, setFloorMax] = useState(params.get("floorMax") ?? "");
  const [priceMin, setPriceMin] = useState(params.get("priceMin") ?? "");
  const [priceMax, setPriceMax] = useState(params.get("priceMax") ?? "");
  const [netMin, setNetMin] = useState(params.get("netMin") ?? "");
  const [netMax, setNetMax] = useState(params.get("netMax") ?? "");
  const [hasOwner, setHasOwner] = useState(params.get("hasOwner") ?? "any");
  const [hasCredit, setHasCredit] = useState(params.get("hasCredit") ?? "any");

  const targetQs = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (statuses.length) p.set("status", statuses.join(","));
    if (types.length) p.set("type", types.join(","));
    if (entrancesSel.length) p.set("entrance", entrancesSel.join(","));
    if (sellersSel.length) p.set("seller", sellersSel.join(","));
    if (floorMin) p.set("floorMin", floorMin);
    if (floorMax) p.set("floorMax", floorMax);
    if (priceMin) p.set("priceMin", priceMin);
    if (priceMax) p.set("priceMax", priceMax);
    if (netMin) p.set("netMin", netMin);
    if (netMax) p.set("netMax", netMax);
    if (hasOwner === "yes" || hasOwner === "no") p.set("hasOwner", hasOwner);
    if (hasCredit === "yes" || hasCredit === "no") p.set("hasCredit", hasCredit);
    // Preserve navigator-owned params (?building, ?complex) from the URL so
    // the filter bar never accidentally strips them on its debounce pass.
    const building = params.get("building");
    if (building) p.set("building", building);
    const complex = params.get("complex");
    if (complex) p.set("complex", complex);
    return p.toString();
  }, [
    q,
    statuses,
    types,
    entrancesSel,
    sellersSel,
    floorMin,
    floorMax,
    priceMin,
    priceMax,
    netMin,
    netMax,
    hasOwner,
    hasCredit,
    params,
  ]);

  const { pending } = useDebouncedQueryReplace({ pathname: "/properties", targetQs });

  const clear = () => {
    setQ("");
    setStatuses([]);
    setTypes([]);
    setEntrancesSel([]);
    setSellersSel([]);
    setFloorMin("");
    setFloorMax("");
    setPriceMin("");
    setPriceMax("");
    setNetMin("");
    setNetMax("");
    setHasOwner("any");
    setHasCredit("any");
  };

  const selectOptions = (e: React.ChangeEvent<HTMLSelectElement>) =>
    Array.from(e.target.selectedOptions).map((o) => o.value);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          type="search"
          placeholder="Търси по име, описание, продавач, купувач, собственик…"
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
              size={5}
              value={statuses}
              onChange={(e) => setStatuses(selectOptions(e))}
              className={SELECT_CLS}
            >
              {PROPERTY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Тип</label>
            <select
              multiple
              size={5}
              value={types}
              onChange={(e) => setTypes(selectOptions(e))}
              className={SELECT_CLS}
            >
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Вход</label>
            <select
              multiple
              size={5}
              value={entrancesSel}
              onChange={(e) => setEntrancesSel(selectOptions(e))}
              className={SELECT_CLS}
            >
              {entrances.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Продавач</label>
            <select
              multiple
              size={5}
              value={sellersSel}
              onChange={(e) => setSellersSel(selectOptions(e))}
              className={SELECT_CLS}
            >
              {sellers.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Етаж</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="от"
                value={floorMin}
                onChange={(e) => setFloorMin(e.target.value)}
              />
              <span className="text-sm text-neutral-500">–</span>
              <Input
                type="number"
                placeholder="до"
                value={floorMax}
                onChange={(e) => setFloorMax(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Цена EUR</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="от"
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
              />
              <span className="text-sm text-neutral-500">–</span>
              <Input
                type="number"
                placeholder="до"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Чиста площ</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="от"
                value={netMin}
                onChange={(e) => setNetMin(e.target.value)}
              />
              <span className="text-sm text-neutral-500">–</span>
              <Input
                type="number"
                placeholder="до"
                value={netMax}
                onChange={(e) => setNetMax(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Има собственик</label>
            <select
              value={hasOwner}
              onChange={(e) => setHasOwner(e.target.value)}
              className={SELECT_CLS}
            >
              <option value="any">Всички</option>
              <option value="yes">Да</option>
              <option value="no">Не</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Кредит</label>
            <select
              value={hasCredit}
              onChange={(e) => setHasCredit(e.target.value)}
              className={SELECT_CLS}
            >
              <option value="any">Всички</option>
              <option value="yes">Да</option>
              <option value="no">Не</option>
            </select>
          </div>
        </div>
      )}

      <div className={cn("text-sm text-neutral-500", !pending && "invisible")}>Обновяване…</div>
    </div>
  );
}
