"use client";

// Date + time inline-edit cell. Implements `specs/_foundations/ui-patterns-inline-edit.md` §3.8 —
// same idea as `<InlineDateCell>` (§3.7) but with a `datetime-local` input
// so the user picks both date and time in one popover.
//
// Wire format: ISO `YYYY-MM-DDTHH:MM` (the native input's value format). The
// server action receives that string verbatim and converts to a `Date` —
// the parsing is locale-agnostic on the wire, and the display layer uses
// `formatDateTime()` for the canonical `DD.MM.YYYY HH:MM` rendering.

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
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";

type SaveResult = { ok: true } | { ok: false; error: string };

type Props = {
  // ISO `YYYY-MM-DDTHH:MM` (no seconds, no zone — matches the native input
  // shape). The page is responsible for translating between this and any
  // server-side Date object representation.
  value: string | null;
  onSave: (newIso: string | null) => Promise<SaveResult>;
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
};

export function InlineDateTimeCell({
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
      if (typeof el.showPicker === "function") {
        try {
          el.showPicker();
        } catch {
          // some browsers throw outside a user gesture — we ARE in one,
          // but harmless to swallow.
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
          console.error("[inline-datetime-cell] save threw", err);
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
        type="datetime-local"
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

  // Read mode — formatDateTime gives canonical `DD.MM.YYYY HH:MM`.
  // The input emits `YYYY-MM-DDTHH:MM`; we append `:00` for second-precision
  // when parsing back to a Date so the format helper gets a valid datetime.
  const displayLabel = localValue
    ? formatDateTime(new Date(`${localValue}:00`))
    : null;

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
