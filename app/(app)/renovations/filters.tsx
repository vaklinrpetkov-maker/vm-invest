"use client";

import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { ApartmentSize, RenovationStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { ContactPicker } from "@/components/ui/contact-picker";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import {
  APARTMENT_SIZES,
  APARTMENT_SIZE_LABELS,
  RENOVATION_STATUSES,
  RENOVATION_STATUS_LABELS,
} from "@/lib/renovations/constants";

// Filter bar for `/renovations`. Same chrome as `/leads`'s filters — chip
// multi-selects for status / size / manager / building, free-text search,
// period range, "Само просрочени" toggle.
//
// `type` filter retired in the template-driven pivot (20.05.2026); replaced
// by `size` (apartment size).

type Owner = { id: string; fullName: string };
type Building = { id: string; displayName: string };

type Props = {
  buildings: readonly Building[];
  owners: readonly Owner[];
};

function paramArray(sp: URLSearchParams, key: string): string[] {
  const raw = sp.get(key) ?? "";
  return raw ? raw.split(",").filter(Boolean) : [];
}

const SELECT_CLS =
  "block w-full px-3 py-2 rounded-lg bg-neutral-100 text-base text-neutral-900 tracking-tight focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120";

export function RenovationFilters({ buildings, owners }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const hasAnyFilter =
    params.has("status") ||
    params.has("size") ||
    params.has("manager") ||
    params.has("building") ||
    params.has("requestedBy") ||
    params.has("plannedFrom") ||
    params.has("plannedTo") ||
    params.has("overdue") ||
    params.has("capacityOver");

  const [open, setOpen] = useState(hasAnyFilter);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [statuses, setStatuses] = useState<string[]>(paramArray(params, "status"));
  const [sizes, setSizes] = useState<string[]>(paramArray(params, "size"));
  const [managers, setManagers] = useState<string[]>(paramArray(params, "manager"));
  const [buildingsSel, setBuildingsSel] = useState<string[]>(paramArray(params, "building"));
  // Заявител — single-select contact picker. ContactPicker doesn't hydrate
  // from a bare id (it expects a ContactSuggestion); on page load with a
  // ?requestedBy URL param the picker will appear empty but the filter is
  // still applied via the URL. Resolving the suggestion would need a
  // server round-trip — acceptable polish gap, the user reapplies if they
  // want to change selection.
  const [requestedBy, setRequestedBy] = useState<string | null>(
    params.get("requestedBy") || null,
  );
  const [plannedFrom, setPlannedFrom] = useState(params.get("plannedFrom") ?? "");
  const [plannedTo, setPlannedTo] = useState(params.get("plannedTo") ?? "");
  const [overdueOnly, setOverdueOnly] = useState(
    params.get("overdue") === "1" || params.get("overdue") === "true",
  );
  const [capacityOver, setCapacityOver] = useState(
    params.get("capacityOver") === "1" || params.get("capacityOver") === "true",
  );

  const targetQs = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (statuses.length) p.set("status", statuses.join(","));
    if (sizes.length) p.set("size", sizes.join(","));
    if (managers.length) p.set("manager", managers.join(","));
    if (buildingsSel.length) p.set("building", buildingsSel.join(","));
    if (requestedBy) p.set("requestedBy", requestedBy);
    if (plannedFrom) p.set("plannedFrom", plannedFrom);
    if (plannedTo) p.set("plannedTo", plannedTo);
    if (overdueOnly) p.set("overdue", "1");
    if (capacityOver) p.set("capacityOver", "1");
    return p.toString();
  }, [q, statuses, sizes, managers, buildingsSel, requestedBy, plannedFrom, plannedTo, overdueOnly, capacityOver]);

  const apply = () => {
    startTransition(() => {
      router.push(
        (targetQs ? `/renovations?${targetQs}` : "/renovations") as Route,
      );
    });
  };

  const clear = () => {
    setQ("");
    setStatuses([]);
    setSizes([]);
    setManagers([]);
    setBuildingsSel([]);
    setRequestedBy(null);
    setPlannedFrom("");
    setPlannedTo("");
    setOverdueOnly(false);
    setCapacityOver(false);
    startTransition(() => router.push("/renovations" as Route));
  };

  function toggle(list: string[], value: string, setter: (next: string[]) => void) {
    setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Търсене по описание, имот, заявител…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
          className="flex-1 max-w-xl"
        />
        <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Скрий филтрите" : "Покажи филтрите"}
        </Button>
        <Button variant="primary" size="sm" onClick={apply}>
          Приложи
        </Button>
        {hasAnyFilter && (
          <Button variant="ghost" size="sm" onClick={clear}>
            Изчисти
          </Button>
        )}
      </div>

      {open && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-neutral-50 rounded-lg p-4">
          <div className="space-y-2">
            <label className="text-sm text-neutral-600">Статус</label>
            <div className="flex flex-wrap gap-1">
              {RENOVATION_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggle(statuses, s, setStatuses)}
                  className={cn(
                    "px-2 py-1 rounded text-sm transition-colors duration-120",
                    statuses.includes(s)
                      ? "bg-accent-100 text-accent-700"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-150",
                  )}
                >
                  {RENOVATION_STATUS_LABELS[s as RenovationStatus]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-neutral-600">Размер</label>
            <div className="flex flex-wrap gap-1">
              {APARTMENT_SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggle(sizes, s, setSizes)}
                  className={cn(
                    "px-2 py-1 rounded text-sm transition-colors duration-120",
                    sizes.includes(s)
                      ? "bg-accent-100 text-accent-700"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-150",
                  )}
                >
                  {APARTMENT_SIZE_LABELS[s as ApartmentSize]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-neutral-600">Отговорник</label>
            <select
              multiple
              value={managers}
              onChange={(e) => {
                const next = Array.from(e.target.selectedOptions).map((o) => o.value);
                setManagers(next);
              }}
              className={cn(SELECT_CLS, "h-32")}
            >
              {/* Synthetic option — maps to `managerId IS NULL` server-side
                  via the "none" sentinel (lib/renovations/queries.ts). */}
              <option value="none" className="italic">— Без отговорник</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.fullName}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-neutral-600">Сграда</label>
            <select
              multiple
              value={buildingsSel}
              onChange={(e) => {
                const next = Array.from(e.target.selectedOptions).map((o) => o.value);
                setBuildingsSel(next);
              }}
              className={cn(SELECT_CLS, "h-32")}
            >
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.displayName}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2 lg:col-span-2 space-y-2">
            <label className="text-sm text-neutral-600">Заявител</label>
            <ContactPicker
              name="requestedByFilter"
              onChange={(c) => setRequestedBy(c?.id ?? null)}
              placeholder={
                requestedBy
                  ? "Контактът е избран (натисни ×, за да изчистиш)"
                  : "Търси контакт…"
              }
            />
          </div>

          <div className="md:col-span-2 lg:col-span-4 space-y-2">
            <label className="text-sm text-neutral-600">
              Период (Планирано начало)
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={plannedFrom}
                onChange={(e) => setPlannedFrom(e.target.value)}
                className="max-w-44"
              />
              <span className="text-sm text-neutral-500">до</span>
              <Input
                type="date"
                value={plannedTo}
                onChange={(e) => setPlannedTo(e.target.value)}
                className="max-w-44"
              />
            </div>
          </div>

          <div className="md:col-span-2 lg:col-span-4 space-y-2">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={overdueOnly}
                onChange={(e) => setOverdueOnly(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-300 text-accent-500 focus:ring-accent-500/40"
              />
              <span className="text-sm text-neutral-700">
                Само просрочени{" "}
                <span className="text-neutral-500">
                  — План. край преди днес, без Завършена / Отказана
                </span>
              </span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={capacityOver}
                onChange={(e) => setCapacityOver(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-300 text-accent-500 focus:ring-accent-500/40"
              />
              <span className="text-sm text-neutral-700">
                Само с превишен капацитет{" "}
                <span className="text-neutral-500">
                  — ремонти, които допринасят за ден с надхвърлен капацитет
                </span>
              </span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
