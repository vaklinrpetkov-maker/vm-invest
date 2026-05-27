"use client";

// Per-page help. Renders a small `?` icon next to the page title; on click
// opens a popover with 2–4 sentences explaining what the page is for and the
// primary actions. Targeted at first-time / non-technical users.
//
// Why click and not hover: the content is multi-sentence, so users need
// time to read. Hover-popovers with long content fight pointer movement;
// click is more deliberate and works on touch devices too. The trigger icon
// itself has a tiny hover-tooltip ("Помощ за тази страница") so the
// affordance is discoverable.
//
// Closes on outside click, on Escape, or via the explicit ✕ button.

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
  // Body of the popover. Plain string for simple help, JSX for richer
  // content (lists, emphasized terms, etc.). Keep concise — 2–4 sentences
  // or a short list. If you need a wall of text, link to a longer guide
  // (when one exists) instead.
  content: ReactNode;
  // Optional override for the popover's header. Default is generic.
  title?: string;
  // Optional accessible label override for the trigger icon. Default is
  // "Помощ за тази страница" — matches the trigger's hover tooltip.
  ariaLabel?: string;
};

export function PageHelp({
  content,
  title = "Как се ползва тази страница",
  ariaLabel = "Помощ за тази страница",
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const computePos = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({
      top: rect.bottom + 8,
      // Align the popover's left edge with the trigger's left edge — the
      // popover extends rightward from the icon. If the icon sits near the
      // right edge of the viewport we'd flip, but page headers always have
      // room on the right at our typical widths.
      left: rect.left,
    });
  }, []);

  // Recompute on open + on scroll/resize while open.
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

  // Outside-click + Escape close the popover.
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
          onClick={() => setOpen((o) => !o)}
          aria-label={ariaLabel}
          aria-expanded={open}
          className={cn(
            "inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium leading-none",
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
            maxWidth: 380,
          }}
          className={cn(
            "z-dropdown w-80 bg-neutral-0 rounded-lg shadow-popover ring-1 ring-neutral-150 p-4",
          )}
        >
          <div className="flex items-start justify-between gap-3 mb-2">
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
          <div className="text-base text-neutral-700 leading-relaxed">
            {content}
          </div>
        </div>,
        portalTarget,
      )}
    </>
  );
}
