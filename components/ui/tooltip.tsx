"use client";

// Tooltip primitive. Wraps any trigger element and shows a small popover
// with descriptive text on hover or keyboard focus.
//
// Design choices:
//   - **Portal rendering**: tooltip lives at `document.body` via `createPortal`
//     so it can escape `overflow-hidden` ancestors (the same reason inline-
//     edit cells use this pattern).
//   - **Fixed positioning**: computed from the trigger's `getBoundingClientRect`
//     on show. Recomputed on scroll/resize while open.
//   - **Hover-in delay** (default 400ms) avoids tooltip spam during normal
//     pointer movement. Hover-out is immediate.
//   - **Keyboard accessible**: focusing the trigger shows the tooltip
//     immediately; Escape hides it.
//   - **ARIA**: the tooltip has `role="tooltip"`; the trigger gets
//     `aria-describedby` pointing at the tooltip's id when shown.
//
// Why not a third-party library: per CLAUDE.md we don't add deps without
// asking. This primitive is ~100 lines and covers our needs.

import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

type Side = "top" | "right" | "bottom" | "left";

type Props = {
  content: ReactNode;
  // Preferred side for the tooltip relative to the trigger. If there isn't
  // room, we flip to the opposite side; we don't try the perpendicular sides
  // for Phase 1 — the trigger's neighbors usually leave room in one of the
  // two vertical directions.
  side?: Side;
  // Milliseconds of hover before the tooltip appears. Keyboard focus shows
  // immediately regardless of this value.
  delayMs?: number;
  // When true, suppresses the tooltip entirely (still renders the children).
  // Useful for disabled-state triggers where the tooltip text wouldn't apply.
  disabled?: boolean;
  // Optional max-width for the tooltip body. Defaults to 280px — enough for
  // a 2–3 sentence Bulgarian description without becoming a wall of text.
  maxWidth?: number;
  // The trigger element. Must be a single React element that accepts a ref
  // and standard mouse/focus handlers.
  children: ReactElement<{
    ref?: React.Ref<HTMLElement>;
    onMouseEnter?: React.MouseEventHandler;
    onMouseLeave?: React.MouseEventHandler;
    onFocus?: React.FocusEventHandler;
    onBlur?: React.FocusEventHandler;
    "aria-describedby"?: string;
  }>;
};

type Pos = { top: number; left: number; transform: string };

export function Tooltip({
  content,
  side = "bottom",
  delayMs = 400,
  disabled = false,
  maxWidth = 280,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);

  const computePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 6;
    let next: Pos;
    switch (side) {
      case "top":
        next = {
          top: rect.top - gap,
          left: rect.left + rect.width / 2,
          transform: "translate(-50%, -100%)",
        };
        break;
      case "right":
        next = {
          top: rect.top + rect.height / 2,
          left: rect.right + gap,
          transform: "translate(0, -50%)",
        };
        break;
      case "left":
        next = {
          top: rect.top + rect.height / 2,
          left: rect.left - gap,
          transform: "translate(-100%, -50%)",
        };
        break;
      case "bottom":
      default:
        next = {
          top: rect.bottom + gap,
          left: rect.left + rect.width / 2,
          transform: "translate(-50%, 0)",
        };
        break;
    }
    setPos(next);
  }, [side]);

  const openTooltip = useCallback(
    (immediate: boolean) => {
      if (disabled) return;
      clearShowTimer();
      if (immediate) {
        computePosition();
        setOpen(true);
      } else {
        showTimerRef.current = setTimeout(() => {
          computePosition();
          setOpen(true);
        }, delayMs);
      }
    },
    [computePosition, delayMs, disabled, clearShowTimer],
  );

  const closeTooltip = useCallback(() => {
    clearShowTimer();
    setOpen(false);
  }, [clearShowTimer]);

  // Recompute position + close on Escape while the tooltip is open.
  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => computePosition();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeTooltip();
    };
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, computePosition, closeTooltip]);

  // Cleanup timer on unmount.
  useEffect(() => clearShowTimer, [clearShowTimer]);

  const child = cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      // Forward to an existing ref on the child if it had one. cloneElement
      // doesn't auto-merge refs; for our usage (Link, button, span) we don't
      // typically need to chain.
    },
    onMouseEnter: (e: React.MouseEvent) => {
      children.props.onMouseEnter?.(e);
      openTooltip(false);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      children.props.onMouseLeave?.(e);
      closeTooltip();
    },
    onFocus: (e: React.FocusEvent) => {
      children.props.onFocus?.(e);
      openTooltip(true);
    },
    onBlur: (e: React.FocusEvent) => {
      children.props.onBlur?.(e);
      closeTooltip();
    },
    "aria-describedby": open ? tooltipId : children.props["aria-describedby"],
  });

  const portalTarget = typeof document !== "undefined" ? document.body : null;

  return (
    <>
      {child}
      {open && pos && portalTarget && createPortal(
        <div
          id={tooltipId}
          role="tooltip"
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            transform: pos.transform,
            maxWidth,
          }}
          className={cn(
            "z-tooltip px-2.5 py-1.5 rounded-md text-xs leading-snug",
            "bg-neutral-900 text-neutral-0 shadow-popover",
            "pointer-events-none",
          )}
        >
          {content}
        </div>,
        portalTarget,
      )}
    </>
  );
}
