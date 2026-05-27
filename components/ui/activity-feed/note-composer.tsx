"use client";

// Note composer for the activity feed. Generalised to any
// `(targetType, targetId)` pair so every detail page in the app can drop
// it in.
//
// `@mention` autocomplete (Phase 1.B-mentions):
//   - When the textarea's text up to the caret ends with `@` followed by
//     a partial name (letters / spaces / hyphens, no newline), a popover
//     opens beneath the textarea listing matching active profiles.
//   - ↑/↓ navigate, Enter or Tab to commit the highlight, Esc closes.
//   - Committing replaces the `@partial` token with `@Full Name `.
//   - Outside-click also closes the popover.
//
// Anchored beneath the textarea (full width of the composer) rather than
// at the caret position — pragmatic Phase-1 trade-off; cursor-anchored
// popover is a future polish noted in `activity-feed.md` §8.1.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { postNote, searchMentionCandidates } from "@/lib/activity-feed/actions";
import { cn } from "@/lib/cn";

type Candidate = { id: string; fullName: string };

type Props = {
  targetType: string;
  targetId: string;
  parentId?: string;
  placeholder?: string;
  onDone?: () => void;
  autoFocus?: boolean;
  compact?: boolean;
};

// Detect a `@partial` token directly to the left of the caret. Returns
// `{ start, query }` where `start` is the index of the `@` character. If
// the caret isn't sitting on a mention-candidate token, returns null.
function detectMentionContext(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  if (caret <= 0) return null;
  // Walk backwards from the caret until we hit `@`, whitespace, or a
  // non-mention character. Accept letters (any unicode letter class),
  // space, hyphen.
  for (let i = caret - 1; i >= 0; i--) {
    const ch = text.charAt(i);
    if (ch === "@") {
      // The character before `@` must be the start of the string or a
      // whitespace — otherwise `email@example.com` would falsely trigger.
      const prev = i === 0 ? "" : text.charAt(i - 1);
      if (i !== 0 && !/\s/.test(prev)) return null;
      return { start: i, query: text.slice(i + 1, caret) };
    }
    // Allow letters (any script), space, hyphen inside the token.
    if (!/[\p{L} \-]/u.test(ch)) return null;
    // Newline breaks the mention.
    if (ch === "\n") return null;
  }
  return null;
}

export function NoteComposer({
  targetType,
  targetId,
  parentId,
  placeholder,
  onDone,
  autoFocus,
  compact,
}: Props) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mention-autocomplete state.
  const [mentionCtx, setMentionCtx] = useState<{ start: number; query: string } | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [, startSearch] = useTransition();

  // Track the caret position via a ref to update mentionCtx on every input
  // / selection change without re-rendering the textarea uncontrolled.
  const updateMentionCtx = useCallback(
    (text: string, caret: number) => {
      const ctx = detectMentionContext(text, caret);
      setMentionCtx(ctx);
      if (!ctx) {
        setCandidates([]);
        return;
      }
      // Fetch candidates for the current query.
      startSearch(async () => {
        const result = await searchMentionCandidates(ctx.query);
        setCandidates(result);
        setHighlight(0);
      });
    },
    [],
  );

  const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setBody(next);
    const caret = e.target.selectionStart;
    updateMentionCtx(next, caret);
  };

  // Detect caret moves via keyup so arrow-keys reposition correctly.
  const onKeyUp = () => {
    const el = textareaRef.current;
    if (!el) return;
    updateMentionCtx(el.value, el.selectionStart);
  };

  const closeAutocomplete = () => {
    setMentionCtx(null);
    setCandidates([]);
  };

  const commitMention = (c: Candidate) => {
    if (!mentionCtx || !textareaRef.current) return;
    const el = textareaRef.current;
    const before = body.slice(0, mentionCtx.start);
    const after = body.slice(el.selectionStart);
    const inserted = `@${c.fullName} `;
    const next = `${before}${inserted}${after}`;
    setBody(next);
    closeAutocomplete();
    // Reposition the caret to right after the inserted mention.
    requestAnimationFrame(() => {
      el.focus();
      const caret = (before + inserted).length;
      el.setSelectionRange(caret, caret);
    });
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionCtx && candidates.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % candidates.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + candidates.length) % candidates.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        commitMention(candidates[highlight]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeAutocomplete();
        return;
      }
    }
  };

  // Outside-click closes the popover.
  useEffect(() => {
    if (!mentionCtx) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node | null;
      if (textareaRef.current && target && textareaRef.current.contains(target)) {
        return; // clicks inside the textarea handled by onKeyUp/onChange
      }
      // Close on any other click.
      setMentionCtx(null);
      setCandidates([]);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [mentionCtx]);

  const onSubmit = () => {
    if (body.trim().length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await postNote(targetType, targetId, body, parentId ?? null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBody("");
      closeAutocomplete();
      onDone?.();
    });
  };

  return (
    <div className="space-y-2 relative">
      <textarea
        ref={textareaRef}
        value={body}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onClick={onKeyUp}
        autoFocus={autoFocus}
        rows={compact ? 2 : 3}
        placeholder={placeholder ?? "Напишете бележка… използвайте @ за споменаване"}
        className="block w-full px-3 py-2 rounded-lg bg-neutral-100 text-base text-neutral-900 placeholder:text-neutral-400 tracking-tight hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120 resize-y"
      />

      {mentionCtx && candidates.length > 0 && (
        <div
          role="listbox"
          aria-label="Спомени колега"
          className="absolute z-10 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg bg-neutral-0 shadow-lg border border-neutral-200"
        >
          {candidates.map((c, idx) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={idx === highlight}
              onMouseDown={(e) => {
                // Prevent the textarea blur that would close the popover
                // before the click registers.
                e.preventDefault();
                commitMention(c);
              }}
              onMouseEnter={() => setHighlight(idx)}
              className={cn(
                "block w-full text-left px-3 py-2 text-base transition-colors duration-120",
                idx === highlight
                  ? "bg-accent-50 text-accent-700"
                  : "text-neutral-900 hover:bg-neutral-100",
              )}
            >
              {c.fullName}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-danger-700 min-h-[1rem]">{error}</div>
        <div className="flex items-center gap-2">
          {onDone && (
            <Button type="button" variant="ghost" size="sm" onClick={onDone}>
              Отказ
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={pending || body.trim().length === 0}
            onClick={onSubmit}
          >
            {pending ? "Публикуване…" : "Публикувай"}
          </Button>
        </div>
      </div>
    </div>
  );
}
