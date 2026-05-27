"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/cn";
import {
  PROPERTY_STATUSES,
  PROPERTY_STATUS_TONES,
  PROPERTY_TYPES,
  type PropertyStatus,
} from "@/lib/properties/constants";
import type { DuplicateGroup, DuplicateRow } from "@/lib/properties/duplicates";
import { splitDuplicate } from "./actions";

// Admin review tool for CSV rows that were dropped during seed because
// another row with the same (Сграда, Name) won the upsert.
//
// For each group the admin sees:
//   - the winning row (links to its current DB record)
//   - every losing row with its CSV-line number and a few key fields
// and can either:
//   a) mark the group as "legitimate duplicate" (stored locally — no side-effects),
//   b) split a losing row into a brand-new Property with a differentiated name.

const ACK_STORAGE_KEY = "properties:dup-acknowledged";

function groupKey(g: DuplicateGroup): string {
  return `${g.buildingStorageName}|||${g.name}`;
}

function fmtMoney(v: string | null): string {
  if (!v) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n.toLocaleString("bg-BG", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function DuplicatesAdmin({ groups }: { groups: DuplicateGroup[] }) {
  const [ack, setAck] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [query, setQuery] = useState("");
  const [splitting, setSplitting] = useState<{
    group: DuplicateGroup;
    source: DuplicateRow;
  } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ACK_STORAGE_KEY);
      if (raw) setAck(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(ACK_STORAGE_KEY, JSON.stringify([...ack]));
    } catch {
      /* ignore */
    }
  }, [ack, hydrated]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((g) => {
      const k = groupKey(g);
      if (ack.has(k) && !showResolved) return false;
      if (!q) return true;
      return (
        g.buildingDisplayName.toLowerCase().includes(q) ||
        g.name.toLowerCase().includes(q)
      );
    });
  }, [groups, ack, showResolved, query]);

  const resolvedCount = useMemo(
    () => groups.filter((g) => ack.has(groupKey(g))).length,
    [groups, ack],
  );

  function toggleAck(key: string) {
    setAck((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          type="search"
          placeholder="Филтрирай по сграда или име…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-[240px]"
        />
        <label className="flex items-center gap-2 text-sm text-neutral-600 whitespace-nowrap">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
            className="h-4 w-4 rounded-sm bg-neutral-100 checked:bg-neutral-900 hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
          />
          Покажи прегледаните ({resolvedCount})
        </label>
        <div className="text-sm text-neutral-600 tabular-nums whitespace-nowrap">
          {filtered.length} / {groups.length} групи
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-sm text-neutral-500 py-8 text-center">
          {groups.length === 0
            ? "Няма дубликатни групи — CSV-то и базата са съвпадат по ключ."
            : "Няма групи, съвпадащи с филтъра."}
        </div>
      ) : (
        <ul className="space-y-4">
          {filtered.map((g) => {
            const k = groupKey(g);
            const isAck = ack.has(k);
            return (
              <li
                key={k}
                className={cn(
                  "bg-neutral-0 rounded-xl border border-neutral-150",
                  isAck && "opacity-60",
                )}
              >
                <header className="px-5 py-3 border-b border-neutral-150 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-base font-medium text-neutral-900">
                        {g.buildingDisplayName} › {g.name}
                      </span>
                      <span className="text-sm text-neutral-500">
                        {g.losers.length + 1} реда в CSV
                      </span>
                    </div>
                    {g.winningPropertyId && (
                      <Link
                        href={`/properties/${g.winningPropertyId}` as Route}
                        className="text-sm text-accent-700 hover:text-accent-800"
                      >
                        Отвори текущия запис ↗
                      </Link>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleAck(k)}
                  >
                    {isAck ? "Върни в списъка" : "Отбележи като проверен"}
                  </Button>
                </header>

                <div className="divide-y divide-neutral-150">
                  <RowDisplay row={g.winner} kind="winner" />
                  {g.losers.map((loser) => (
                    <RowDisplay
                      key={loser.csvLine}
                      row={loser}
                      kind="loser"
                      onSplit={() => setSplitting({ group: g, source: loser })}
                      canSplit={Boolean(g.buildingId)}
                    />
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {splitting && (
        <SplitModal
          group={splitting.group}
          source={splitting.source}
          onClose={() => setSplitting(null)}
          onSuccess={() => {
            // After a successful split, auto-acknowledge the group since at
            // least one action has been taken on it. The admin can still
            // un-acknowledge if they want to act on other losers.
            setAck((prev) => new Set(prev).add(groupKey(splitting.group)));
            setSplitting(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Row display ──────────────────────────────────────────────────────────

function RowDisplay({
  row,
  kind,
  onSplit,
  canSplit,
}: {
  row: DuplicateRow | null;
  kind: "winner" | "loser";
  onSplit?: () => void;
  canSplit?: boolean;
}) {
  if (!row) {
    return (
      <div className="px-5 py-3 text-sm text-neutral-500">
        Текущият запис е изтрит от базата.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "px-5 py-3 flex items-start justify-between gap-4",
        kind === "winner" ? "bg-success-50/40" : "bg-neutral-0",
      )}
    >
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              "text-xs font-medium uppercase tracking-tight",
              kind === "winner" ? "text-success-700" : "text-neutral-500",
            )}
          >
            {kind === "winner" ? "Победил (в базата)" : "Отпаднал"}
          </span>
          <span className="text-xs text-neutral-500 tabular-nums">ред {row.csvLine}</span>
          {row.status && (
            <StatusBadge
              tone={PROPERTY_STATUS_TONES[row.status as PropertyStatus] ?? "neutral"}
            >
              {row.status}
            </StatusBadge>
          )}
          {row.type && <StatusBadge tone="neutral">{row.type}</StatusBadge>}
        </div>
        <div className="text-sm text-neutral-700 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
          <Field label="Описание" value={row.description} />
          <Field label="Продавач" value={row.sellers === "" ? null : row.sellers} />
          <Field label="Цена (EUR)" value={fmtMoney(row.priceEur)} />
          <Field label="Очаквана цена (EUR)" value={fmtMoney(row.expectedPriceEur)} />
          <Field label="Купувач" value={row.buyerLabel} />
          <Field label="Договор (описание)" value={row.contractLabel} />
        </div>
      </div>
      {kind === "loser" && onSplit && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onSplit}
          disabled={!canSplit}
          title={canSplit ? undefined : "Сградата е деактивирана или липсва."}
        >
          Създай отделен имот
        </Button>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2">
      <span className="text-neutral-500 shrink-0">{label}:</span>
      <span className="truncate">
        {value ?? <span className="text-neutral-400">—</span>}
      </span>
    </div>
  );
}

// ─── Split modal ──────────────────────────────────────────────────────────

function SplitModal({
  group,
  source,
  onClose,
  onSuccess,
}: {
  group: DuplicateGroup;
  source: DuplicateRow;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const suggestedName = `${group.name} (ред ${source.csvLine})`;
  const [newName, setNewName] = useState(suggestedName);
  const [status, setStatus] = useState(source.status ?? "Свободен");
  const [type, setType] = useState(source.type ?? "Друго");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    if (!group.buildingId) {
      setErr("Сградата не може да бъде намерена.");
      return;
    }
    setErr(null);
    startTransition(async () => {
      const res = await splitDuplicate({
        buildingId: group.buildingId!,
        newName: newName.trim(),
        status,
        type,
        description: source.description,
        // `splitDuplicate` accepts the joined string and re-splits via
        // `parseSellerInput` server-side. Keeps the action surface narrow.
        sellers: source.sellers,
        priceEur: source.priceEur,
        expectedPriceEur: source.expectedPriceEur,
        buyerLabel: source.buyerLabel,
        contractLabel: source.contractLabel,
      });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      onSuccess();
    });
  }

  return (
    <div
      className="fixed inset-0 z-modal bg-neutral-900/40 flex items-start justify-center pt-20 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div
        className="bg-neutral-0 rounded-xl p-6 w-full max-w-lg shadow-popover space-y-4"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium">Създай отделен имот</h2>
            <p className="text-sm text-neutral-600">
              От ред {source.csvLine} в CSV-то. Сграда:{" "}
              <strong>{group.buildingDisplayName}</strong>. Базовите данни са
              попълнени от изтрития ред; промени при нужда.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-neutral-500 hover:text-neutral-900 transition-colors duration-120 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-neutral-700">Ново име *</span>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="напр. Ап.1 (v2)"
            />
            <span className="text-xs text-neutral-500 mt-1 block">
              Трябва да е различно от текущото «{group.name}» в тази сграда.
            </span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Статус</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="block w-full mt-1 px-3 py-2 rounded-lg bg-neutral-100 text-base text-neutral-900 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
              >
                {PROPERTY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Тип</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="block w-full mt-1 px-3 py-2 rounded-lg bg-neutral-100 text-base text-neutral-900 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
              >
                {PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {err && (
          <div className="rounded-lg bg-danger-50 p-3 text-sm text-danger-700">{err}</div>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Отказ
          </Button>
          <Button type="button" onClick={submit} disabled={pending || !newName.trim()}>
            {pending ? "Създаване…" : "Създай"}
          </Button>
        </div>
      </div>
    </div>
  );
}
