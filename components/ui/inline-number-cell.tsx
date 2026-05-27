"use client";

// Number inline-edit cell. Implements `specs/_foundations/ui-patterns-inline-edit.md` §3.6.
//
// Locale-aware parsing: accepts both "12 500,50" (canonical bg-BG: space
// thousands, comma decimal) and "12500.50" (programmatic) so paste-from-
// anywhere works. Display always uses bg-BG formatting via `toLocaleString`.
//
// Three formats:
//   - "integer"      — whole numbers only (e.g. duration minutes, counts).
//   - "decimal"      — up to N fraction digits (default 2).
//   - "currency-eur" — same as decimal-2 plus a ` €` suffix on read.
//
// A free-form `suffix` prop overrides the format's default suffix (use
// "мин" for minutes, "%" for percentages, etc.). The suffix is purely
// presentational — it's not stored, not parsed, not part of the wire value.

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

export type NumberFormat = "integer" | "decimal" | "currency-eur";

type Props = {
  value: number | null;
  onSave: (newValue: number | null) => Promise<SaveResult>;
  format?: NumberFormat;
  // Up to N fraction digits for "decimal"; ignored for "integer".
  // Currency-eur always uses 2.
  decimalDigits?: number;
  // Suffix shown on read (e.g. "мин", "%"). Overrides the format's default
  // (currency-eur → " €"). Pass `null` to suppress all suffixes.
  suffix?: string | null;
  // Optional bounds. Validated server-side too; this is for UX.
  min?: number;
  max?: number;
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
};

const LOCALE = "bg-BG";

function formatNumber(
  value: number,
  format: NumberFormat,
  decimalDigits: number,
): string {
  if (format === "integer") {
    return value.toLocaleString(LOCALE, { maximumFractionDigits: 0 });
  }
  if (format === "currency-eur") {
    return value.toLocaleString(LOCALE, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return value.toLocaleString(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimalDigits,
  });
}

function resolveSuffix(format: NumberFormat, override: string | null | undefined): string {
  if (override === null) return ""; // explicit suppress
  if (override !== undefined) return ` ${override}`;
  if (format === "currency-eur") return " €";
  return "";
}

// Locale-aware parse. Accepts:
//   "12 500,50" / "12500,50" / "12 500.50" / "12500.50" / "12,5" / "12.5"
// Rejects strings with both `,` and `.` (ambiguous) — that's almost certainly
// a paste from a different locale convention; user retypes cleanly.
function parseNumberInput(raw: string): { ok: true; value: number } | { ok: false } {
  let s = raw.trim();
  if (s === "") return { ok: false };
  // Strip the EUR suffix or "мин"-like suffixes the user may have typed.
  s = s.replace(/[€$£лв.\s]+$/i, "").trim();
  // Strip spaces inside the number (thousands separator).
  s = s.replace(/\s+/g, "");
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) return { ok: false };
  if (hasComma) s = s.replace(",", ".");
  // Allow leading sign and digits + optional fraction.
  if (!/^-?\d+(\.\d+)?$/.test(s)) return { ok: false };
  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false };
  return { ok: true, value: n };
}

export function InlineNumberCell({
  value,
  onSave,
  format = "decimal",
  decimalDigits = 2,
  suffix,
  min,
  max,
  emptyLabel = "—",
  className,
  disabled = false,
}: Props) {
  const [localValue, setLocalValue] = useState<number | null>(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const [flashError, setFlashError] = useState(false);
  const [, startSave] = useTransition();
  const { error: toastError } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const suffixText = resolveSuffix(format, suffix);

  const beginEdit = useCallback(
    (e?: ReactMouseEvent) => {
      if (disabled) return;
      e?.stopPropagation();
      // Pre-fill the input with the raw number (no locale formatting — easier
      // to edit numerically). The user can type freely and we'll re-parse.
      setDraft(localValue !== null ? String(localValue) : "");
      committedRef.current = false;
      setEditing(true);
    },
    [disabled, localValue],
  );

  useEffect(() => {
    if (!editing) return;
    const handle = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(handle);
  }, [editing]);

  const commit = useCallback(() => {
    const previous = localValue;
    committedRef.current = true;
    setEditing(false);

    // Empty input → null (clear the field). The action decides if null is OK.
    if (draft.trim() === "") {
      if (previous === null) return;
      setLocalValue(null);
      performSave(null);
      return;
    }

    const parsed = parseNumberInput(draft);
    if (!parsed.ok) {
      setFlashError(true);
      setTimeout(() => setFlashError(false), 600);
      toastError("Невалидно число.");
      return;
    }

    let next = parsed.value;
    if (format === "integer") next = Math.trunc(next);
    if (min !== undefined && next < min) {
      setFlashError(true);
      setTimeout(() => setFlashError(false), 600);
      toastError(`Стойността не може да е по-малка от ${min}.`);
      return;
    }
    if (max !== undefined && next > max) {
      setFlashError(true);
      setTimeout(() => setFlashError(false), 600);
      toastError(`Стойността не може да е по-голяма от ${max}.`);
      return;
    }
    if (previous === next) return;

    setLocalValue(next);
    performSave(next);

    function performSave(target: number | null) {
      startSave(async () => {
        let result: SaveResult;
        try {
          result = await onSave(target);
        } catch (err) {
          console.error("[inline-number-cell] save threw", err);
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
    }
  }, [draft, localValue, onSave, format, min, max, toastError]);

  const cancel = useCallback(() => {
    committedRef.current = true;
    setEditing(false);
  }, []);

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
        type="text"
        inputMode={format === "integer" ? "numeric" : "decimal"}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        className={cn(
          "block w-full h-7 px-2 -mx-2 rounded-md text-base text-neutral-900 tabular-nums",
          "bg-neutral-0 ring-2 ring-accent-500/40 focus:outline-none",
          "text-right",
          className,
        )}
      />
    );
  }

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
      {localValue !== null ? (
        <span className="text-neutral-900">
          {formatNumber(localValue, format, decimalDigits)}
          {suffixText && (
            <span className="text-neutral-500 ml-0.5">{suffixText}</span>
          )}
        </span>
      ) : (
        <span className="text-neutral-400">{emptyLabel}</span>
      )}
    </button>
  );
}
