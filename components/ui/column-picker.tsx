"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

// Reusable "Колони" dropdown for table-view modules. Toggles per-column
// visibility and persists choice to localStorage under the given key.
//
// Why a custom component instead of inlining: the previous inlined version
// rendered an invisible `fixed inset-0 z-overlay` backdrop above the menu
// itself (z-overlay = 200, z-dropdown = 100 in tailwind.config.ts), which
// silently swallowed every click on the menu. This component drops the
// backdrop and uses a document `mousedown` listener anchored on a root ref
// to close on outside-click — same pattern as user-menu.tsx, which works.
//
// Usage:
//   const COLUMNS = [
//     { key: "name", label: "Име", defaultVisible: true },
//     { key: "phone", label: "Телефон", defaultVisible: false },
//   ] as const;
//   const visible = useColumnVisibility("contacts:visible-columns", COLUMNS);
//   <ColumnPicker columns={COLUMNS} visible={visible.state} onToggle={visible.toggle} />
//   {visible.state.name && <td>{row.name}</td>}

export type ColumnDef<K extends string> = {
  key: K;
  label: string;
  defaultVisible: boolean;
};

type Props<K extends string> = {
  columns: readonly ColumnDef<K>[];
  visible: Record<K, boolean>;
  onToggle: (key: K) => void;
  /** Optional override for the trigger button label. */
  triggerLabel?: string;
  /** Optional class for the menu's max-height; defaults to "max-h-96". */
  menuMaxHeightClass?: string;
};

export function ColumnPicker<K extends string>({
  columns,
  visible,
  onToggle,
  triggerLabel = "Колони",
  menuMaxHeightClass = "max-h-96",
}: Props<K>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape — no z-index overlay needed.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const visibleCount = Object.values(visible).filter(Boolean).length;

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen((x) => !x)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {triggerLabel}
        <span className="ml-1.5 text-neutral-500 tabular-nums text-xs">
          {visibleCount}/{columns.length}
        </span>
      </Button>

      {open && (
        <div
          role="menu"
          className={`absolute right-0 top-9 z-dropdown bg-neutral-0 rounded-lg p-2 shadow-popover min-w-64 overflow-y-auto ${menuMaxHeightClass}`}
        >
          {columns.map((c) => (
            <label
              key={c.key}
              className="flex items-center gap-2 px-2 py-1.5 text-base text-neutral-700 rounded-md hover:bg-neutral-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={visible[c.key]}
                onChange={() => onToggle(c.key)}
                className="h-4 w-4 rounded-sm bg-neutral-100 checked:bg-neutral-900 hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
              />
              {c.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// Hook that owns the visibility state for a column set, persists it to
// localStorage on change, and rehydrates on mount. Default visibility comes
// from each column's `defaultVisible` field.
export function useColumnVisibility<K extends string>(
  storageKey: string,
  columns: readonly ColumnDef<K>[],
): {
  state: Record<K, boolean>;
  toggle: (key: K) => void;
} {
  const defaults = (): Record<K, boolean> =>
    columns.reduce(
      (acc, c) => ({ ...acc, [c.key]: c.defaultVisible }),
      {} as Record<K, boolean>,
    );

  const [state, setState] = useState<Record<K, boolean>>(defaults);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        const clean = defaults();
        for (const c of columns) {
          if (parsed[c.key] === true || parsed[c.key] === false) {
            clean[c.key] = parsed[c.key];
          }
        }
        setState(clean);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, hydrated, storageKey]);

  function toggle(key: K) {
    setState((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return { state, toggle };
}
