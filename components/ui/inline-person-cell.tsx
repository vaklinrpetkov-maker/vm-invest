"use client";

// Inline-edit cell for person/owner fields. Implements the canonical pattern
// described in `specs/_foundations/ui-patterns-inline-edit.md` §3.9:
//
//   - Click cell → popover anchored below it.
//   - Search input auto-focused; type to filter the active-profile list.
//   - "— Без отговорник" entry always at the top, regardless of filter.
//   - ↑/↓ navigate, Enter commits, Esc cancels.
//   - Optimistic UI: the cell flips to the new value immediately. On server
//     rejection the value rolls back, the cell flashes red, and a toast
//     appears with a `Повтори` retry button.
//   - Click outside the popover closes without changing the value.
//
// The component is intentionally generic across "person fields" — it doesn't
// know about contacts vs leads vs tasks. Wire-up happens at the table layer
// by passing a module-specific `onSave` server action.

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
import { AvatarCircle } from "@/components/ui/avatar-circle";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

export type Person = {
  id: string;
  fullName: string;
};

export type PersonOption = Person & {
  // Optional metadata: e.g. inactive profiles can still appear as the current
  // value but should never appear in the picker list (see `options` prop).
  active?: boolean;
};

type SaveResult = { ok: true } | { ok: false; error: string };

type Props = {
  // The current value displayed in the cell. May reference a profile no
  // longer in the active list — in that case it still renders, dimmed.
  value: Person | null;
  // Whether the current value's profile is active. Optional; defaults true.
  // When false the displayed name is muted with a "(неактивен)" tag.
  valueActive?: boolean;
  // Pickable options. Should be the active profiles only.
  options: PersonOption[];
  // Called with the chosen id, or null for unassign. Returns ok or an error
  // message that's surfaced in the rollback toast.
  onSave: (newId: string | null) => Promise<SaveResult>;
  // Optional: text shown when the cell is empty.
  emptyLabel?: string;
  // Optional: classname forwarded to the trigger.
  className?: string;
  // Optional: disables interaction. The cell renders read-only.
  disabled?: boolean;
};

const UNASSIGN_LABEL = "— Без отговорник";

export function InlinePersonCell({
  value,
  valueActive = true,
  options,
  onSave,
  emptyLabel = "—",
  className,
  disabled = false,
}: Props) {
  // Local mirror of the server value so we can update optimistically without
  // waiting for the server roundtrip + revalidation.
  const [localValue, setLocalValue] = useState<Person | null>(value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [flashError, setFlashError] = useState(false);
  // The popover uses `position: fixed` because the parent Table wrapper has
  // `overflow-hidden` (for rounded corners) — an absolutely-positioned popover
  // would be clipped. We compute coordinates from the trigger's bounding box.
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

  // Keep local mirror in sync if parent re-renders with a fresh server value.
  useEffect(() => {
    setLocalValue(value);
  }, [value?.id, value?.fullName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bulgarian-aware filter (Cyrillic toLowerCase works without diacritic
  // normalization — there are no Bulgarian diacritics to strip).
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("bg-BG");
    if (!q) return options;
    return options.filter((o) => o.fullName.toLocaleLowerCase("bg-BG").includes(q));
  }, [options, query]);

  // The picker rows the user can navigate. The "Без отговорник" entry is
  // always at index 0, regardless of search — it's the unassign action.
  type Row =
    | { kind: "unassign" }
    | { kind: "option"; option: PersonOption };
  const rows: Row[] = useMemo(
    () => [{ kind: "unassign" }, ...filtered.map((o) => ({ kind: "option" as const, option: o }))],
    [filtered],
  );

  // Reset highlight to a sensible position when the row list changes. Prefer
  // the row matching the current value; fall back to the first selectable one.
  useEffect(() => {
    if (!open) return;
    const idx = localValue
      ? rows.findIndex((r) => r.kind === "option" && r.option.id === localValue.id)
      : 0;
    setHighlight(idx >= 0 ? idx : 0);
  }, [open, rows, localValue]);

  // Outside-click close. The popover is portaled outside `rootRef`, so we
  // also need to allow clicks inside the popover itself.
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

  // Compute popover position from the trigger's bounding box. Re-runs on
  // scroll/resize so the popover stays anchored as the user moves around.
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

  // Auto-focus the search input when the popover opens.
  useEffect(() => {
    if (open) {
      // Using rAF avoids the focus being stolen back by the click that opened it.
      const handle = requestAnimationFrame(() => searchRef.current?.focus());
      return () => cancelAnimationFrame(handle);
    }
  }, [open]);

  const commit = useCallback(
    (newValue: Person | null) => {
      const previous = localValue;
      const previousId = previous?.id ?? null;
      const newId = newValue?.id ?? null;
      setOpen(false);
      setQuery("");

      // No-op short-circuit: no need to roundtrip if nothing changed.
      if (previousId === newId) return;

      // Optimistic update.
      setLocalValue(newValue);

      const performSave = (target: Person | null) => {
        startSave(async () => {
          let result: SaveResult;
          try {
            result = await onSave(target?.id ?? null);
          } catch (err) {
            console.error("[inline-person-cell] save threw", err);
            result = {
              ok: false,
              error: "Възникна неочаквана грешка.",
            };
          }
          if (!result.ok) {
            // Roll back to the prior value, briefly flash red, surface a toast.
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
    // Don't let the click bubble to a parent row link / navigate.
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
      else commit({ id: row.option.id, fullName: row.option.fullName });
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    }
  };

  const showInactiveTag = localValue != null && valueActive === false;

  return (
    <span ref={rootRef} className={cn("relative inline-block", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={onTriggerClick}
        disabled={disabled}
        className={cn(
          // Fixed min height + horizontal padding gives a deliberate hover
          // target. We deliberately avoid negative margins here — earlier
          // versions used `-mx -my` to compensate the padding visually but
          // collapsed weirdly around short content (e.g. the empty-state em-dash).
          "inline-flex items-center gap-2 min-h-7 max-w-full px-2 rounded-md text-left transition-all duration-120",
          !disabled && "hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent-500/40",
          flashError && "ring-2 ring-danger-500/60 bg-danger-50",
          disabled && "cursor-default",
        )}
      >
        {localValue ? (
          <>
            <AvatarCircle name={localValue.fullName} size="sm" muted={!valueActive} />
            <span
              className={cn(
                "truncate",
                valueActive ? "text-neutral-900" : "text-neutral-400",
              )}
            >
              {localValue.fullName}
              {showInactiveTag && (
                <span className="text-neutral-400 ml-1 text-sm">(неактивен)</span>
              )}
            </span>
          </>
        ) : (
          // min-w gives the empty-state click target a usable width even when
          // the only content is a 1ch em-dash glyph.
          <span className="text-neutral-400 inline-block min-w-6 text-center">
            {emptyLabel}
          </span>
        )}
      </button>

      {open && popoverPos && (
        <div
          ref={popoverRef}
          // Fixed positioning escapes the table wrapper's `overflow-hidden`.
          // z-dropdown sits above rows but below modals (see tokens).
          style={{
            position: "fixed",
            top: popoverPos.top,
            left: popoverPos.left,
            minWidth: popoverPos.minWidth,
          }}
          className="z-dropdown bg-neutral-0 rounded-lg shadow-popover ring-1 ring-neutral-150 max-w-[320px] overflow-hidden"
        >
          <div className="p-1.5 border-b border-neutral-100">
            <input
              ref={searchRef}
              type="text"
              value={query}
              placeholder="Търси отговорник…"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              autoComplete="off"
              className="w-full h-8 px-2 text-base bg-neutral-50 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-500/40 placeholder:text-neutral-400"
            />
          </div>
          <ul role="listbox" className="max-h-60 overflow-y-auto p-1">
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
                      <span className="text-neutral-500 italic">{UNASSIGN_LABEL}</span>
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
                    onClick={() =>
                      commit({ id: row.option.id, fullName: row.option.fullName })
                    }
                    className={cn(
                      "w-full text-left px-2 py-1.5 rounded-md text-base flex items-center gap-2 transition-colors duration-80",
                      isHighlighted ? "bg-neutral-100" : "hover:bg-neutral-50",
                    )}
                  >
                    <AvatarCircle name={row.option.fullName} size="sm" />
                    <span className="flex-1 truncate text-neutral-900">
                      {row.option.fullName}
                    </span>
                    {isSelected && <span className="text-accent-700 text-sm">✓</span>}
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
