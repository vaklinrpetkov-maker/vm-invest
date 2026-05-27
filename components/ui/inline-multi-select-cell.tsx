"use client";

// Multi-select inline-edit cell. Implements `specs/_foundations/ui-patterns-inline-edit.md` §3.3.
//
// On click → popover with a checkbox list. Toggling a checkbox flips its
// inclusion locally; the popover stays open. Click outside or press Esc
// to commit all pending changes (one `onSave` call with the final array).
//
// Read mode: row of pills showing the labels of selected options, with a
// "+N още" overflow indicator when there are more than `maxVisible`.
//
// Empty selection: shows `emptyLabel` (default `—`). The server action
// decides if empty is valid — if it rejects, the cell rolls back per the
// shared rollback flow.

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

export type MultiSelectOption = {
  id: string;
  label: string;
  sublabel?: string;
};

type SaveResult = { ok: true } | { ok: false; error: string };

type Props = {
  // Currently selected options (full objects so we can render labels in the
  // pill stack without a separate id→label lookup on every render).
  values: ReadonlyArray<MultiSelectOption>;
  // All available options. Selected ones are matched by `id`.
  options: ReadonlyArray<MultiSelectOption>;
  // Called once with the final id array when the popover closes (if changed).
  onSave: (newIds: string[]) => Promise<SaveResult>;
  emptyLabel?: string;
  searchPlaceholder?: string;
  // Visible pill count in read mode before the `+N още` overflow tag.
  maxVisible?: number;
  className?: string;
  disabled?: boolean;
};

export function InlineMultiSelectCell({
  values,
  options,
  onSave,
  emptyLabel = "—",
  searchPlaceholder = "Търси…",
  maxVisible = 3,
  className,
  disabled = false,
}: Props) {
  const [localValues, setLocalValues] = useState<ReadonlyArray<MultiSelectOption>>(values);
  const [draftIds, setDraftIds] = useState<ReadonlySet<string>>(
    new Set(values.map((v) => v.id)),
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
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

  // Keep local mirror + draft in sync if parent re-renders with new values.
  useEffect(() => {
    setLocalValues(values);
    setDraftIds(new Set(values.map((v) => v.id)));
  }, [values]);

  // Bulgarian-aware substring filter on label + sublabel.
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("bg-BG");
    if (!q) return options;
    return options.filter((o) => {
      const haystack = `${o.label} ${o.sublabel ?? ""}`.toLocaleLowerCase("bg-BG");
      return haystack.includes(q);
    });
  }, [options, query]);

  // Compute popover position from trigger (same pattern as person/relation cells).
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
        minWidth: Math.max(rect.width, 260),
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

  // Auto-focus search on open (only relevant when the input is rendered).
  useEffect(() => {
    if (open && options.length > 6) {
      const handle = requestAnimationFrame(() => searchRef.current?.focus());
      return () => cancelAnimationFrame(handle);
    }
  }, [open, options.length]);

  // Commit on close. We compute the diff vs. the last-known committed values
  // (`localValues`); if nothing changed, no roundtrip.
  const commit = useCallback(() => {
    const previousIds = new Set(localValues.map((v) => v.id));
    const nextIds = new Set(draftIds);

    setOpen(false);
    setQuery("");

    // Unchanged? Bail out cheaply.
    if (
      previousIds.size === nextIds.size &&
      [...previousIds].every((id) => nextIds.has(id))
    ) {
      return;
    }

    const nextValues = options.filter((o) => nextIds.has(o.id));
    setLocalValues(nextValues);

    const performSave = (targetIds: string[], targetValues: ReadonlyArray<MultiSelectOption>) => {
      startSave(async () => {
        let result: SaveResult;
        try {
          result = await onSave(targetIds);
        } catch (err) {
          console.error("[inline-multi-select-cell] save threw", err);
          result = { ok: false, error: "Възникна неочаквана грешка." };
        }
        if (!result.ok) {
          setLocalValues(values);
          setDraftIds(new Set(values.map((v) => v.id)));
          setFlashError(true);
          setTimeout(() => setFlashError(false), 600);
          toastError(`Промяната не беше запазена. ${result.error}`, {
            retryLabel: "Повтори",
            onRetry: () => {
              setLocalValues(targetValues);
              setDraftIds(new Set(targetIds));
              performSave(targetIds, targetValues);
            },
          });
        }
      });
    };

    performSave([...nextIds], nextValues);
  }, [draftIds, localValues, onSave, options, values, toastError]);

  // Outside-click closes + commits.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      commit();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, commit]);

  const onTriggerClick = (e: ReactMouseEvent) => {
    if (disabled) return;
    e.stopPropagation();
    if (open) {
      commit();
    } else {
      setDraftIds(new Set(localValues.map((v) => v.id)));
      setOpen(true);
    }
  };

  const toggleOption = (id: string) => {
    setDraftIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      // Cancel — restore draft to committed state, close without saving.
      setDraftIds(new Set(localValues.map((v) => v.id)));
      setOpen(false);
      setQuery("");
    }
  };

  const visiblePills = localValues.slice(0, maxVisible);
  const overflow = Math.max(0, localValues.length - maxVisible);

  return (
    <span ref={rootRef} className={cn("relative inline-block", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={onTriggerClick}
        disabled={disabled}
        className={cn(
          "inline-flex items-center gap-1 min-h-7 max-w-full px-2 -mx-2 rounded-md text-left transition-all duration-120 flex-wrap",
          !disabled &&
            "hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent-500/40",
          flashError && "ring-2 ring-danger-500/60 bg-danger-50",
          disabled && "cursor-default",
        )}
      >
        {localValues.length === 0 ? (
          <span className="text-neutral-400">{emptyLabel}</span>
        ) : (
          <>
            {visiblePills.map((v) => (
              <span
                key={v.id}
                className="inline-block px-1.5 py-0.5 rounded-sm bg-neutral-100 text-neutral-700 text-xs font-medium tracking-tight"
              >
                {v.label}
              </span>
            ))}
            {overflow > 0 && (
              <span className="text-xs text-neutral-500 ml-0.5">
                +{overflow} още
              </span>
            )}
          </>
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
          <ul role="listbox" aria-multiselectable="true" className="max-h-72 overflow-y-auto p-1">
            {filtered.map((opt) => {
              const checked = draftIds.has(opt.id);
              return (
                <li key={opt.id} role="option" aria-selected={checked}>
                  <label
                    className={cn(
                      "w-full text-left px-2 py-1.5 rounded-md text-base flex items-center gap-2 cursor-pointer transition-colors duration-80",
                      checked ? "bg-neutral-50" : "hover:bg-neutral-50",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOption(opt.id)}
                      className="h-4 w-4 rounded-sm shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-neutral-900">{opt.label}</div>
                      {opt.sublabel && (
                        <div className="truncate text-sm text-neutral-500">
                          {opt.sublabel}
                        </div>
                      )}
                    </div>
                  </label>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-2 py-2 text-sm text-neutral-500">
                Няма съвпадения.
              </li>
            )}
          </ul>
          <div className="border-t border-neutral-100 px-2 py-1.5 text-xs text-neutral-500 flex items-center justify-between">
            <span>
              {draftIds.size === 0
                ? "Няма избрани"
                : `${draftIds.size} ${draftIds.size === 1 ? "избран" : "избрани"}`}
            </span>
            <span>Esc отказва · клик навън запазва</span>
          </div>
        </div>
      )}
    </span>
  );
}
