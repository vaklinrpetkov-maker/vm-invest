"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/cn";

// Full filter bar for /invoices per specs/invoices.md §6.2. URL is the
// source of truth; every control writes to URLSearchParams and the server
// re-renders the table. No client-side state for filter VALUES — only for
// the search input's debounced typing buffer.
//
// What we cover here:
//   - Section (single-select dropdown)
//   - "Само мои" / "Всички фактури" toggle (defaults to mine)
//   - Status pills (pending / paid — multi-select, toggle each)
//   - Date range — invoice_date from/to (two native date inputs)
//   - Uploader (single-select dropdown — multi-select with chips is overkill
//     for the team size; the "Само мои" toggle already covers the dominant case)
//   - Anomalies-only toggle
//   - Fuzzy search across vendor, invoice number, line items, notes
//
// Deliberately out of scope (per the spec simplifications): supplier multi-
// select with typeahead, due-date range, amount range, "duplicate-warning"
// toggle. Promote if/when usage suggests they're needed.

type Section = { id: string; labelBg: string };
type Uploader = { id: string; fullName: string };

type Props = {
  sections: Section[];
  uploaders: Uploader[];
};

const SEARCH_DEBOUNCE_MS = 300;

export function InvoiceFilters({ sections, uploaders }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const selectedSection = params.get("section") ?? "";
  const selectedStatuses = params.getAll("status");
  const selectedUploader = params.get("uploader") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const anomaliesOn = params.get("anomalies") === "1" || params.get("anomalies") === "true";
  const mineOn = !(params.get("mine") === "0" || params.get("mine") === "false");
  const urlQ = params.get("q") ?? "";

  // Search input is the only client-state control (we debounce typing so we
  // don't fire a request on every keystroke).
  const [qDraft, setQDraft] = useState(urlQ);
  const mountedRef = useRef(false);
  // When the URL changes externally (e.g. browser nav, Изчисти button), pull
  // the value back into the input.
  useEffect(() => {
    setQDraft(urlQ);
  }, [urlQ]);
  // Debounced commit. Skips the first render — see /tasks filters for the
  // same pattern; otherwise mount writes the same URL and clobbers other
  // state.
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (qDraft === urlQ) return;
    const handle = setTimeout(() => {
      updateMany({ q: qDraft || null });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDraft]);

  function buildSp(patch: Record<string, string | null | string[]>): URLSearchParams {
    const sp = new URLSearchParams(params.toString());
    sp.delete("page"); // any filter change resets to page 1
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") {
        sp.delete(k);
      } else if (Array.isArray(v)) {
        sp.delete(k);
        for (const item of v) sp.append(k, item);
      } else {
        sp.set(k, v);
      }
    }
    return sp;
  }

  function updateMany(patch: Record<string, string | null | string[]>) {
    const sp = buildSp(patch);
    startTransition(() => {
      router.replace(`/invoices${sp.toString() ? `?${sp}` : ""}` as Route);
    });
  }

  function toggleStatus(status: "pending" | "paid") {
    const next = selectedStatuses.includes(status)
      ? selectedStatuses.filter((s) => s !== status)
      : [...selectedStatuses, status];
    updateMany({ status: next });
  }

  function clearAll() {
    startTransition(() => {
      router.replace("/invoices" as Route);
    });
  }

  const hasAnyFilter =
    selectedSection !== "" ||
    selectedStatuses.length > 0 ||
    selectedUploader !== "" ||
    from !== "" ||
    to !== "" ||
    anomaliesOn ||
    !mineOn ||
    urlQ.length > 0;

  return (
    <div className="space-y-2" aria-busy={pending}>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <input
          type="search"
          value={qDraft}
          onChange={(e) => setQDraft(e.target.value)}
          placeholder="Търси по доставчик, номер, бележка, описание…"
          className="h-8 px-3 rounded-lg bg-neutral-100 text-base text-neutral-900 placeholder:text-neutral-400 tracking-tight hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120 w-80 max-w-full"
          aria-label="Търсене"
        />

        {/* Section */}
        <select
          value={selectedSection}
          onChange={(e) => updateMany({ section: e.target.value || null })}
          className={SELECT_CLS}
          aria-label="Филтрирай по секция"
        >
          <option value="">Всички секции</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.labelBg}
            </option>
          ))}
        </select>

        {/* Uploader */}
        <select
          value={selectedUploader}
          onChange={(e) => updateMany({ uploader: e.target.value || null })}
          className={SELECT_CLS}
          aria-label="Филтрирай по качил"
          disabled={mineOn}
          title={mineOn ? "Изключи „Само мои“, за да филтрираш по друг" : undefined}
        >
          <option value="">Всеки качил</option>
          {uploaders.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}
            </option>
          ))}
        </select>

        {/* Mine toggle */}
        <button
          type="button"
          onClick={() => updateMany({ mine: mineOn ? "0" : null, uploader: null })}
          className={cn(
            "h-8 px-3 rounded-lg text-base transition-colors duration-120",
            mineOn
              ? "bg-accent-500 text-neutral-0 hover:bg-accent-600"
              : "bg-neutral-100 text-neutral-900 hover:bg-neutral-150",
          )}
          aria-pressed={mineOn}
        >
          {mineOn ? "Само мои" : "Всички фактури"}
        </button>

        {/* Anomalies toggle */}
        <button
          type="button"
          onClick={() => updateMany({ anomalies: anomaliesOn ? null : "1" })}
          className={cn(
            "h-8 px-3 rounded-lg text-base transition-colors duration-120",
            anomaliesOn
              ? "bg-warning-100 text-warning-800 hover:bg-warning-50"
              : "bg-neutral-100 text-neutral-700 hover:bg-neutral-150",
          )}
          aria-pressed={anomaliesOn}
        >
          {anomaliesOn ? "⚠ Само с сигнали" : "Само с сигнали"}
        </button>

        {hasAnyFilter && (
          <button
            type="button"
            onClick={clearAll}
            className="h-8 px-3 rounded-lg bg-transparent text-base text-neutral-500 hover:text-neutral-900 transition-colors duration-120"
          >
            Изчисти филтрите
          </button>
        )}
      </div>

      {/* Row 2: status pills + date range */}
      <div className="flex items-center gap-3 flex-wrap text-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-neutral-500 text-sm">Статус:</span>
          <StatusPill
            label="Чакаща"
            tone="info"
            active={selectedStatuses.includes("pending")}
            onClick={() => toggleStatus("pending")}
          />
          <StatusPill
            label="Платена"
            tone="success"
            active={selectedStatuses.includes("paid")}
            onClick={() => toggleStatus("paid")}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-neutral-500 text-sm">Дата:</span>
          <input
            type="date"
            value={from}
            onChange={(e) => updateMany({ from: e.target.value || null })}
            className="h-8 px-2 rounded-lg bg-neutral-100 text-sm text-neutral-900 tabular-nums hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120"
            aria-label="От дата"
          />
          <span className="text-neutral-500 text-sm">–</span>
          <input
            type="date"
            value={to}
            onChange={(e) => updateMany({ to: e.target.value || null })}
            className="h-8 px-2 rounded-lg bg-neutral-100 text-sm text-neutral-900 tabular-nums hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120"
            aria-label="До дата"
          />
        </div>
      </div>
    </div>
  );
}

const SELECT_CLS =
  "h-8 px-3 rounded-lg bg-neutral-100 text-base text-neutral-900 tracking-tight hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120 disabled:opacity-50 disabled:cursor-not-allowed";

// Small status pill button. Active state matches the row badge tone so the
// filter reads as "show me rows that look like this."
function StatusPill({
  label,
  tone,
  active,
  onClick,
}: {
  label: string;
  tone: "info" | "success";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-7 px-2.5 rounded-full text-sm transition-colors duration-120",
        active
          ? tone === "info"
            ? "bg-info-100 text-info-700"
            : "bg-success-100 text-success-700"
          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-150",
      )}
    >
      {label}
    </button>
  );
}
