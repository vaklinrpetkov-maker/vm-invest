"use client";

// Single-line text inline-edit cell. Implements the canonical pattern from
// `specs/_foundations/ui-patterns-inline-edit.md` §3.4:
//
//   - Click cell → text becomes a pre-selected input.
//   - Commit on blur, Enter, or Tab.
//   - Esc reverts.
//   - Optimistic update: cell flips to new value immediately. On server
//     reject, cell rolls back, flashes red, and surfaces a toast with retry.
//
// Validation is done on the server. The cell calls `onSave`; if it returns
// `{ ok: false, error }`, the rollback flow takes over. We deliberately
// don't duplicate validation client-side — server is the source of truth and
// the rollback toast is unambiguous about what went wrong.

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
import { cn } from "@/lib/cn";

type SaveResult = { ok: true } | { ok: false; error: string };

type Props = {
  value: string | null;
  // Returns ok or an error message that's surfaced in the rollback toast.
  // Pass `null` for "cleared" — most fields are optional. Required fields
  // should reject empty values server-side.
  onSave: (newValue: string | null) => Promise<SaveResult>;
  // Empty-state placeholder when the value is null/empty.
  emptyLabel?: string;
  // Visual classname for the trigger (when not editing).
  className?: string;
  // Per-row className for read mode (e.g. "font-mono" for ЕГН display).
  readClassName?: string;
  // Inline input attributes pass-through where useful.
  type?: "text" | "tel" | "email";
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
  // Optional autocomplete suggestions. When set, the edit-mode input gets a
  // backing <datalist> so the browser surfaces native autocomplete. Used for
  // free-text fields with a known set of canonical values that the user
  // should be nudged toward — `Property.sellers`, supplier names, etc.
  // Purely a UX nicety: the server still owns validation/normalisation.
  suggestions?: ReadonlyArray<string>;
};

export function InlineTextCell({
  value,
  onSave,
  emptyLabel = "—",
  className,
  readClassName,
  type = "text",
  maxLength,
  placeholder,
  disabled = false,
  suggestions,
}: Props) {
  const [localValue, setLocalValue] = useState<string | null>(value);
  // Per-instance datalist id so multiple cells on the same page don't collide.
  const datalistIdRef = useRef<string | null>(null);
  if (suggestions && suggestions.length > 0 && datalistIdRef.current === null) {
    datalistIdRef.current = `inline-text-cell-suggestions-${Math.random()
      .toString(36)
      .slice(2)}`;
  }
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value ?? "");
  const [flashError, setFlashError] = useState(false);
  const [, startSave] = useTransition();
  const { error: toastError } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  // Track whether the input is committing (via Enter) so the imminent blur
  // doesn't trigger a second commit.
  const committedRef = useRef(false);

  // Resync if parent re-renders with a new value (after revalidatePath).
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

  // Auto-focus + select-all when entering edit mode.
  useEffect(() => {
    if (!editing) return;
    const handle = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
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
          console.error("[inline-text-cell] save threw", err);
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
    const datalistId = suggestions && suggestions.length > 0 ? datalistIdRef.current : null;
    return (
      <>
        <input
          ref={inputRef}
          type={type}
          value={draft}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          list={datalistId ?? undefined}
          className={cn(
            "block w-full h-7 px-2 -mx-2 rounded-md text-base text-neutral-900",
            "bg-neutral-0 ring-2 ring-accent-500/40 focus:outline-none",
            "tabular-nums",
            className,
          )}
        />
        {datalistId && (
          <datalist id={datalistId}>
            {suggestions!.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
      </>
    );
  }

  return (
    <button
      type="button"
      onClick={beginEdit}
      disabled={disabled}
      className={cn(
        "inline-flex items-center min-h-7 max-w-full px-2 -mx-2 rounded-md text-left transition-all duration-120",
        !disabled &&
          "hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent-500/40",
        flashError && "ring-2 ring-danger-500/60 bg-danger-50",
        disabled && "cursor-default",
        className,
      )}
    >
      {localValue && localValue.length > 0 ? (
        <span className={cn("truncate text-neutral-900", readClassName)}>
          {localValue}
        </span>
      ) : (
        <span className="text-neutral-400">{emptyLabel}</span>
      )}
    </button>
  );
}
