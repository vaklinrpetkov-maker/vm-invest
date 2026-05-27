"use client";

// Multiline text inline-edit cell. Implements `specs/_foundations/ui-patterns-inline-edit.md` §3.5:
//
//   - Click cell → expands into a textarea, pre-selected.
//   - Commit on blur or Ctrl+Enter (Enter alone inserts a newline).
//   - Esc reverts.
//   - Same optimistic + rollback flow as the single-line variant.
//
// Read mode shows a single-line truncated preview to keep table rows tidy.
// On hover the truncated text gets a tooltip with the full content. Click
// expands to the full editor.

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
  onSave: (newValue: string | null) => Promise<SaveResult>;
  emptyLabel?: string;
  className?: string;
  // Max height of the textarea before it scrolls. Default 240px (~10 lines).
  maxHeightPx?: number;
  placeholder?: string;
  disabled?: boolean;
};

export function InlineMultilineCell({
  value,
  onSave,
  emptyLabel = "—",
  className,
  maxHeightPx = 240,
  placeholder,
  disabled = false,
}: Props) {
  const [localValue, setLocalValue] = useState<string | null>(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value ?? "");
  const [flashError, setFlashError] = useState(false);
  const [, startSave] = useTransition();
  const { error: toastError } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  // Auto-focus + position caret at end so the user can keep typing.
  useEffect(() => {
    if (!editing) return;
    const handle = requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
      autoResize(el, maxHeightPx);
    });
    return () => cancelAnimationFrame(handle);
  }, [editing, maxHeightPx]);

  const commit = useCallback(() => {
    const next = draft.trim() === "" ? null : draft;
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
          console.error("[inline-multiline-cell] save threw", err);
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

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Enter (or Cmd+Enter on Mac) commits. Plain Enter inserts a newline.
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
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
      <textarea
        ref={textareaRef}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => {
          setDraft(e.target.value);
          autoResize(e.currentTarget, maxHeightPx);
        }}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        rows={3}
        style={{ maxHeight: maxHeightPx }}
        className={cn(
          "block w-full px-2 py-1.5 -mx-2 rounded-md text-base text-neutral-900",
          "bg-neutral-0 ring-2 ring-accent-500/40 focus:outline-none",
          "resize-none overflow-y-auto leading-relaxed",
          className,
        )}
      />
    );
  }

  // Read mode: single-line truncate, full content in title attr.
  const display = (localValue ?? "").replace(/\s+/g, " ").trim();
  return (
    <button
      type="button"
      onClick={beginEdit}
      disabled={disabled}
      title={localValue ?? undefined}
      className={cn(
        "inline-flex items-center min-h-7 max-w-full px-2 -mx-2 rounded-md text-left transition-all duration-120",
        !disabled &&
          "hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent-500/40",
        flashError && "ring-2 ring-danger-500/60 bg-danger-50",
        disabled && "cursor-default",
        className,
      )}
    >
      {display.length > 0 ? (
        <span className="truncate text-neutral-900">{display}</span>
      ) : (
        <span className="text-neutral-400">{emptyLabel}</span>
      )}
    </button>
  );
}

// Auto-grow the textarea up to a max height, then scroll. Caller passes the
// current target so we don't hold a ref to it across renders.
function autoResize(el: HTMLTextAreaElement, maxHeightPx: number): void {
  el.style.height = "auto";
  const next = Math.min(el.scrollHeight, maxHeightPx);
  el.style.height = `${next}px`;
}
