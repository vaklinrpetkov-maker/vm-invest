"use client";

// Per-field help. A smaller variant of <PageHelp> sized to sit next to a
// form label without dominating it. Use this for fields where the meaning
// isn't obvious from the label alone — ЕГН format, "Идеална част от земя",
// abbreviated property types, etc.
//
// Convention: 1–3 sentences of plain Bulgarian. The user is paused on a form
// field and needs a quick answer — they don't want a tutorial. If the
// content needs more than a short paragraph, link to docs (when they exist)
// from inside the popover instead.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";

type Props = {
  content: ReactNode;
  // Optional title shown above the popover body. Default is "Подсказка".
  title?: string;
  // Optional accessible label override for the trigger icon. Default matches
  // the trigger's hover tooltip.
  ariaLabel?: string;
};

export function FieldHelp({
  content,
  title = "Подсказка",
  ariaLabel = "Подсказка за полето",
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const computePos = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({
      top: rect.bottom + 6,
      left: rect.left,
    });
  }, []);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    computePos();
    const update = () => computePos();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, computePos]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const portalTarget = typeof document !== "undefined" ? document.body : null;

  return (
    <>
      <Tooltip content={ariaLabel} delayMs={200}>
        <button
          ref={triggerRef}
          type="button"
          // Important: form-field labels often sit inside <form> elements, so
          // explicitly typed "button" prevents accidental submit when clicked.
          onClick={(e) => {
            // Prevent any parent label's implicit-focus behavior — clicking
            // the icon shouldn't steal focus into the input.
            e.preventDefault();
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          aria-label={ariaLabel}
          aria-expanded={open}
          className={cn(
            // 16px circular icon — smaller than PageHelp's 20px so it pairs
            // naturally with text-sm form labels (12px).
            "inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-medium leading-none align-middle",
            "transition-colors duration-120 focus:outline-none focus:ring-2 focus:ring-accent-500/40",
            open
              ? "bg-accent-500 text-neutral-0"
              : "bg-neutral-100 text-neutral-500 hover:bg-neutral-150 hover:text-neutral-900",
          )}
        >
          ?
        </button>
      </Tooltip>

      {open && pos && portalTarget && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={title}
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            maxWidth: 340,
          }}
          className={cn(
            "z-dropdown w-72 bg-neutral-0 rounded-lg shadow-popover ring-1 ring-neutral-150 p-3",
          )}
        >
          <div className="flex items-start justify-between gap-3 mb-1.5">
            <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-tight">
              {title}
            </h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Затвори"
              className="text-neutral-400 hover:text-neutral-700 text-sm shrink-0 -mt-0.5 transition-colors duration-120"
            >
              ✕
            </button>
          </div>
          <div className="text-sm text-neutral-700 leading-relaxed">
            {content}
          </div>
        </div>,
        portalTarget,
      )}
    </>
  );
}
