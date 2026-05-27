"use client";

// Generic single-relation inline-edit cell. Implements
// `specs/_foundations/ui-patterns-inline-edit.md` §3.10 for any FK field
// (Contact.buildingId, Property.contactId, Lead.contactId, etc.).
//
// Same architecture as <InlinePersonCell> but with a generic option shape:
//   - `label` is the primary string shown in the trigger and picker rows.
//   - `sublabel` is optional metadata shown below the label in picker rows.
//   - No avatar — relations aren't always people. (Person fields have their
//     own dedicated primitive that adds AvatarCircle.)
//
// Picker behavior:
//   - Click → fixed-position popover (escapes table overflow).
//   - Search input auto-focused (only shown when more than 6 options to
//     avoid UI noise on short lists like enums).
//   - "— Без [thing]" entry pinned at the top, regardless of filter.
//   - ↑/↓ navigate, Enter commits, Esc cancels.
//   - Optimistic + rollback flow with toast retry.

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
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

export type RelationOption = {
  id: string;
  label: string;
  sublabel?: string;
};

type SaveResult = { ok: true } | { ok: false; error: string };

type Props = {
  value: RelationOption | null;
  options: ReadonlyArray<RelationOption>;
  onSave: (newId: string | null) => Promise<SaveResult>;
  // The unassign label shown at the top of the picker, e.g. "— Без сграда".
  unassignLabel?: string;
  // Empty-state placeholder when value is null.
  emptyLabel?: string;
  // Search input placeholder.
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
};

export function InlineRelationCell({
  value,
  options,
  onSave,
  unassignLabel = "— Без",
  emptyLabel = "—",
  searchPlaceholder = "Търси…",
  className,
  disabled = false,
}: Props) {
  const [localValue, setLocalValue] = useState<RelationOption | null>(value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [flashError, setFlashError] = useState(false);
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

  useEffect(() => {
    setLocalValue(value);
  }, [value?.id, value?.label]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bulgarian-aware substring filter.
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("bg-BG");
    if (!q) return options;
    return options.filter((o) => {
      const haystack = `${o.label} ${o.sublabel ?? ""}`.toLocaleLowerCase("bg-BG");
      return haystack.includes(q);
    });
  }, [options, query]);

  // Picker rows = unassign + filtered options, in that order.
  type Row = { kind: "unassign" } | { kind: "option"; option: RelationOption };
  const rows: Row[] = useMemo(
    () => [
      { kind: "unassign" },
      ...filtered.map((option) => ({ kind: "option" as const, option })),
    ],
    [filtered],
  );

  // Reset highlight to current value's row (or first) when rows change.
  useEffect(() => {
    if (!open) return;
    const idx = localValue
      ? rows.findIndex((r) => r.kind === "option" && r.option.id === localValue.id)
      : 0;
    setHighlight(idx >= 0 ? idx : 0);
  }, [open, rows, localValue]);

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
        minWidth: Math.max(rect.width, 240),
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
    (newValue: RelationOption | null) => {
      const previous = localValue;
      const previousId = previous?.id ?? null;
      const newId = newValue?.id ?? null;
      setOpen(false);
      setQuery("");

      if (previousId === newId) return;

      setLocalValue(newValue);

      const performSave = (target: RelationOption | null) => {
        startSave(async () => {
          let result: SaveResult;
          try {
            result = await onSave(target?.id ?? null);
          } catch (err) {
            console.error("[inline-relation-cell] save threw", err);
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
      setHighlight((h) => Math.min(h + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[highlight];
      if (!row) return;
      if (row.kind === "unassign") commit(null);
      else commit(row.option);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <span ref={rootRef} className={cn("relative inline-block", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={onTriggerClick}
        disabled={disabled}
        className={cn(
          "inline-flex items-center gap-2 min-h-7 max-w-full px-2 rounded-md text-left transition-all duration-120",
          !disabled &&
            "hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent-500/40",
          flashError && "ring-2 ring-danger-500/60 bg-danger-50",
          disabled && "cursor-default",
        )}
      >
        {localValue ? (
          <span className="truncate text-neutral-900">{localValue.label}</span>
        ) : (
          <span className="text-neutral-400 inline-block min-w-6 text-center">
            {emptyLabel}
          </span>
        )}
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
          className="z-dropdown bg-neutral-0 rounded-lg shadow-popover ring-1 ring-neutral-150 max-w-[360px] overflow-hidden"
        >
          {options.length > 6 && (
            <div className="p-1.5 border-b border-neutral-100">
              <input
                ref={searchRef}
                type="text"
                value={query}
                placeholder={searchPlaceholder}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onSearchKeyDown}
                autoComplete="off"
                className="w-full h-8 px-2 text-base bg-neutral-50 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-500/40 placeholder:text-neutral-400"
              />
            </div>
          )}
          <ul role="listbox" className="max-h-72 overflow-y-auto p-1">
            {rows.map((row, idx) => {
              if (row.kind === "unassign") {
                const isHighlighted = idx === highlight;
                const isSelected = localValue == null;
                return (
                  <li key="unassign" role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      onMouseEnter={() => setHighlight(idx)}
                      onClick={() => commit(null)}
                      className={cn(
                        "w-full text-left px-2 py-1.5 rounded-md text-base flex items-center justify-between gap-2 transition-colors duration-80",
                        isHighlighted ? "bg-neutral-100" : "hover:bg-neutral-50",
                      )}
                    >
                      <span className="text-neutral-500 italic">{unassignLabel}</span>
                      {isSelected && <span className="text-accent-700 text-sm">✓</span>}
                    </button>
                  </li>
                );
              }
              const isHighlighted = idx === highlight;
              const isSelected = localValue?.id === row.option.id;
              return (
                <li key={row.option.id} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => commit(row.option)}
                    className={cn(
                      "w-full text-left px-2 py-1.5 rounded-md text-base flex items-center gap-2 transition-colors duration-80",
                      isHighlighted ? "bg-neutral-100" : "hover:bg-neutral-50",
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-neutral-900">{row.option.label}</div>
                      {row.option.sublabel && (
                        <div className="truncate text-sm text-neutral-500">
                          {row.option.sublabel}
                        </div>
                      )}
                    </div>
                    {isSelected && <span className="text-accent-700 text-sm shrink-0">✓</span>}
                  </button>
                </li>
              );
            })}
            {rows.length === 1 && query.trim().length > 0 && (
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
