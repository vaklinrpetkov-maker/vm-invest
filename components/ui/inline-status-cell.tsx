"use client";

// Inline-edit cell for status enum fields. Implements the canonical pattern
// described in `specs/_foundations/ui-patterns-inline-edit.md` §3.1:
//
//   - Click cell → popover anchored below it.
//   - Search input auto-focused; type to filter the options by label.
//   - ↑/↓ navigate, Enter commits, Esc cancels.
//   - Each option renders as a full-width tone-coded button matching the
//     <StatusBadge> visual language.
//   - Optimistic UI: the cell flips immediately. On server rejection it
//     rolls back, flashes red, and surfaces a toast with `Повтори`.
//   - System-only options (e.g. `Lead.status === "converted"`) render
//     correctly when set as the current value but are hidden from the picker.
//
// `+ Нов статус` (admin-inline status creation, spec §3.1) is **out of scope**
// for Phase 1 — adding values to a string enum is a schema/data change, not
// a runtime concern. Module specs decide when and how to expose it.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

export type StatusOption<T extends string> = {
  value: T;
  label: string;
  tone: BadgeTone;
  // Picker-hides this option (still renders correctly when set as current).
  // Use for statuses driven by other modules, e.g. Lead.status === "converted"
  // is set by Contracts conversion flow only.
  systemOnly?: boolean;
};

type SaveResult = { ok: true } | { ok: false; error: string };

type Props<T extends string> = {
  value: T;
  options: ReadonlyArray<StatusOption<T>>;
  onSave: (newValue: T) => Promise<SaveResult>;
  className?: string;
  disabled?: boolean;
};

// Tone class lookup matches `<StatusBadge>` exactly so the popover items read
// as "buttons that *are* the badge" rather than near-matches.
const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-neutral-100 text-neutral-600 hover:bg-neutral-150",
  success: "bg-success-50 text-success-700 hover:bg-success-100",
  warning: "bg-warning-50 text-warning-800 hover:bg-warning-100",
  "warning-soft": "bg-warning-50/60 text-warning-700 hover:bg-warning-50",
  danger: "bg-danger-50 text-danger-700 hover:bg-danger-100",
  info: "bg-info-50 text-info-700 hover:bg-info-100",
  accent: "bg-accent-50 text-accent-700 hover:bg-accent-100",
  "neutral-outline":
    "border border-dashed border-neutral-400 text-neutral-500 bg-transparent hover:bg-neutral-50",
};

export function InlineStatusCell<T extends string>({
  value,
  options,
  onSave,
  className,
  disabled = false,
}: Props<T>) {
  const [localValue, setLocalValue] = useState<T>(value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [flashError, setFlashError] = useState(false);
  // Popover position — same `position: fixed` strategy as InlinePersonCell to
  // escape any `overflow-hidden` ancestor (the Table wrapper).
  const [popoverPos, setPopoverPos] = useState<{
    top: number;
    left: number;
    minWidth: number;
  } | null>(null);
  const [, startSave] = useTransition();
  const { error: toastError } = useToast();
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Keep local mirror in sync if parent re-renders with a new server value.
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const currentOption = useMemo(
    () => options.find((o) => o.value === localValue),
    [options, localValue],
  );

  // Pickable rows: hide systemOnly entries unless they're the current value
  // (so the user can read but not pick a system-set status).
  const pickable = useMemo(
    () => options.filter((o) => !o.systemOnly),
    [options],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("bg-BG");
    if (!q) return pickable;
    return pickable.filter((o) =>
      o.label.toLocaleLowerCase("bg-BG").includes(q),
    );
  }, [pickable, query]);

  // Reset highlight to current value's row (or first) when options change.
  useEffect(() => {
    if (!open) return;
    const idx = filtered.findIndex((o) => o.value === localValue);
    setHighlight(idx >= 0 ? idx : 0);
  }, [open, filtered, localValue]);

  // Outside-click close.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Compute popover position from the trigger.
  useEffect(() => {
    if (!open) {
      setPopoverPos(null);
      return;
    }
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPopoverPos({
        top: rect.bottom + 4,
        left: rect.left,
        minWidth: Math.max(rect.width, 220),
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  // Auto-focus the search input on open.
  useEffect(() => {
    if (open) {
      const handle = requestAnimationFrame(() => searchRef.current?.focus());
      return () => cancelAnimationFrame(handle);
    }
  }, [open]);

  const commit = useCallback(
    (newValue: T) => {
      const previous = localValue;
      setOpen(false);
      setQuery("");

      if (previous === newValue) return;

      // Optimistic update.
      setLocalValue(newValue);

      const performSave = (target: T) => {
        startSave(async () => {
          let result: SaveResult;
          try {
            result = await onSave(target);
          } catch (err) {
            console.error("[inline-status-cell] save threw", err);
            result = { ok: false, error: "Възникна неочаквана грешка." };
          }
          if (!result.ok) {
            setLocalValue(previous);
            setFlashError(true);
            setTimeout(() => setFlashError(false), 600);
            toastError(`Промяната не беше запазена. ${result.error}`, {
              retryLabel: "Повтори",
              onRetry: () => {
                setLocalValue(target);
                performSave(target);
              },
            });
          }
        });
      };

      performSave(newValue);
    },
    [localValue, onSave, toastError],
  );

  const onTriggerClick = (e: ReactMouseEvent) => {
    if (disabled) return;
    e.stopPropagation();
    setOpen((o) => !o);
  };

  const onSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = filtered[highlight];
      if (row) commit(row.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    }
  };

  const triggerLabel = currentOption?.label ?? localValue;
  const triggerTone = currentOption?.tone ?? "neutral";

  return (
    <span ref={rootRef} className={cn("relative inline-block", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={onTriggerClick}
        disabled={disabled}
        className={cn(
          "inline-flex items-center rounded-md transition-all duration-120",
          !disabled &&
            "hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent-500/40",
          flashError && "ring-2 ring-danger-500/60",
          disabled && "cursor-default",
        )}
      >
        <StatusBadge tone={triggerTone}>{triggerLabel}</StatusBadge>
      </button>

      {open && popoverPos && (
        <div
          ref={popoverRef}
          style={{
            position: "fixed",
            top: popoverPos.top,
            left: popoverPos.left,
            minWidth: popoverPos.minWidth,
          }}
          className="z-dropdown bg-neutral-0 rounded-lg shadow-popover ring-1 ring-neutral-150 max-w-[300px] overflow-hidden"
        >
          {pickable.length > 4 && (
            <div className="p-1.5 border-b border-neutral-100">
              <input
                ref={searchRef}
                type="text"
                value={query}
                placeholder="Търси статус…"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onSearchKeyDown}
                autoComplete="off"
                className="w-full h-8 px-2 text-base bg-neutral-50 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-500/40 placeholder:text-neutral-400"
              />
            </div>
          )}
          <ul role="listbox" className="max-h-72 overflow-y-auto p-1.5 space-y-1">
            {filtered.map((opt, idx) => {
              const isHighlighted = idx === highlight;
              const isSelected = opt.value === localValue;
              return (
                <li key={opt.value} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => commit(opt.value)}
                    className={cn(
                      "w-full text-left px-2.5 py-1.5 rounded-md text-base font-medium tracking-tight",
                      "flex items-center justify-between gap-2 transition-colors duration-80",
                      TONE_CLASSES[opt.tone],
                      isHighlighted && "ring-1 ring-accent-500/30",
                    )}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && <span className="shrink-0 text-sm">✓</span>}
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-2 py-2 text-sm text-neutral-500">
                Няма съвпадения.
              </li>
            )}
          </ul>
        </div>
      )}
    </span>
  );
}

// On the input listening side: filter only renders when there are >4 options
// so short enum lists (contracts: 3 options) don't have an awkward search bar.
// For long lists (properties: 8) the filter shows up. Cutoff is empirical.
//
// If you need a different cutoff per cell, fork via `showFilter` prop later.
