"use client";

// Boolean inline-edit cell. Implements `specs/_foundations/ui-patterns-inline-edit.md` §3.11.
//
// The simplest cell type: click toggles immediately. No popover, no
// confirmation, no edit-mode input. Click again to revert. Keyboard: space
// when focused. Same optimistic-update + rollback-toast flow as the others.
//
// Visual: renders the current value's label (`Да` / `—` by default) as a
// button-like span. The user knows it's interactive because of the hover
// background. No icon — we want this to read as text that's flippable.

import {
  useCallback,
  useEffect,
  useState,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

type SaveResult = { ok: true } | { ok: false; error: string };

type Props = {
  value: boolean;
  onSave: (newValue: boolean) => Promise<SaveResult>;
  // Labels for the two states. Defaults match the existing convention in
  // contracts/contracts-table.tsx for the "Кредит" column.
  trueLabel?: string;
  falseLabel?: string;
  className?: string;
  disabled?: boolean;
};

export function InlineBooleanCell({
  value,
  onSave,
  trueLabel = "Да",
  falseLabel = "—",
  className,
  disabled = false,
}: Props) {
  const [localValue, setLocalValue] = useState<boolean>(value);
  const [flashError, setFlashError] = useState(false);
  const [pending, startSave] = useTransition();
  const { error: toastError } = useToast();

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const toggle = useCallback(
    (e?: ReactMouseEvent | ReactKeyboardEvent) => {
      if (disabled) return;
      e?.stopPropagation();
      if ("preventDefault" in e!) e.preventDefault();

      const previous = localValue;
      const next = !previous;
      setLocalValue(next);

      const performSave = (target: boolean) => {
        startSave(async () => {
          let result: SaveResult;
          try {
            result = await onSave(target);
          } catch (err) {
            console.error("[inline-boolean-cell] save threw", err);
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
    },
    [disabled, localValue, onSave, toastError],
  );

  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === " " || e.key === "Enter") {
      toggle(e);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      onKeyDown={onKeyDown}
      disabled={disabled}
      aria-pressed={localValue}
      className={cn(
        "inline-flex items-center min-h-7 px-2 -mx-2 rounded-md text-left transition-all duration-120",
        !disabled &&
          "hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent-500/40",
        flashError && "ring-2 ring-danger-500/60 bg-danger-50",
        pending && "opacity-70",
        disabled && "cursor-default",
        className,
      )}
    >
      {localValue ? (
        <span className="text-neutral-900">{trueLabel}</span>
      ) : (
        <span className="text-neutral-400">{falseLabel}</span>
      )}
    </button>
  );
}
