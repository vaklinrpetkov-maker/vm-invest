"use client";

// Date inline-edit cell. Implements `specs/_foundations/ui-patterns-inline-edit.md` §3.7
// (the v1 subset — uses the browser's native date picker via `<input type="date">`
// rather than a custom calendar). The native picker handles keyboard nav,
// month/year jumps, and locale rendering on its own.
//
// Display always uses the project's `formatDate` (DD.MM.YYYY) per locale.
// The native input expects/emits ISO YYYY-MM-DD; we translate at the seam.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

type SaveResult = { ok: true } | { ok: false; error: string };

type Props = {
  // ISO YYYY-MM-DD or null. The cell speaks ISO; the page formats for display.
  value: string | null;
  onSave: (newIso: string | null) => Promise<SaveResult>;
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
};

export function InlineDateCell({
  value,
  onSave,
  emptyLabel = "—",
  className,
  disabled = false,
}: Props) {
  const [localValue, setLocalValue] = useState<string | null>(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value ?? "");
  const [flashError, setFlashError] = useState(false);
  const [, startSave] = useTransition();
  const { error: toastError } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const beginEdit = useCallback(
    (e?: ReactMouseEvent) => {
      if (disabled) return;
      e?.stopPropagation();
      setDraft(localValue ?? "");
      committedRef.current = false;
      setEditing(true);
    },
    [disabled, localValue],
  );

  useEffect(() => {
    if (!editing) return;
    const handle = requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      // showPicker() is supported in modern Chromium / Firefox / Safari ≥ 16.
      // If unsupported, the input is focused — user can type or click to open.
      if (typeof el.showPicker === "function") {
        try {
          el.showPicker();
        } catch {
          // Intentionally swallow — some browsers throw if showPicker is
          // called outside a user gesture, but we ARE in one (the click
          // that started edit mode). The focus alone is enough.
        }
      }
    });
    return () => cancelAnimationFrame(handle);
  }, [editing]);

  const commit = useCallback(() => {
    const next = draft.trim() === "" ? null : draft.trim();
    const previous = localValue;
    committedRef.current = true;
    setEditing(false);

    if (previous === next) return;

    setLocalValue(next);

    const performSave = (target: string | null) => {
      startSave(async () => {
        let result: SaveResult;
        try {
          result = await onSave(target);
        } catch (err) {
          console.error("[inline-date-cell] save threw", err);
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

    performSave(next);
  }, [draft, localValue, onSave, toastError]);

  const cancel = useCallback(() => {
    committedRef.current = true;
    setEditing(false);
    setDraft(localValue ?? "");
  }, [localValue]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  const onBlur = () => {
    if (committedRef.current) return;
    commit();
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        className={cn(
          "block h-7 px-2 -mx-2 rounded-md text-base text-neutral-900 tabular-nums",
          "bg-neutral-0 ring-2 ring-accent-500/40 focus:outline-none",
          className,
        )}
      />
    );
  }

  // Read mode — DD.MM.YYYY per locale.
  const displayLabel = localValue ? formatDate(new Date(`${localValue}T00:00:00Z`)) : null;

  return (
    <button
      type="button"
      onClick={beginEdit}
      disabled={disabled}
      className={cn(
        "inline-flex items-center min-h-7 max-w-full px-2 -mx-2 rounded-md text-left transition-all duration-120 tabular-nums",
        !disabled &&
          "hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent-500/40",
        flashError && "ring-2 ring-danger-500/60 bg-danger-50",
        disabled && "cursor-default",
        className,
      )}
    >
      {displayLabel ? (
        <span className="text-neutral-900">{displayLabel}</span>
      ) : (
        <span className="text-neutral-400">{emptyLabel}</span>
      )}
    </button>
  );
}
