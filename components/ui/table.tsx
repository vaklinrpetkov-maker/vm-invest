// Table primitives following specs/design-system/tables.md (base) and specs/design-system/tables-advanced.md
// (advanced patterns). Defaults to compact, tabular-nums numeric cells, hover
// tints, neutral-150 row dividers. Extend rather than restyle for variants.

"use client";

import { useEffect, useRef } from "react";
import type { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type TableProps = HTMLAttributes<HTMLTableElement>;

export function Table({ className, ...props }: TableProps) {
  // Dual horizontal scrollbar: the bottom one is the real table wrapper; the
  // top one is a thin "phantom" container whose width tracks the table's own
  // scrollWidth via ResizeObserver. Their scroll positions are mirrored, so
  // users can drag either to reach off-screen columns without scrolling the
  // whole page to find the bottom scrollbar. Inline-cell popovers use
  // `position: fixed` (anchored to the viewport, not these wrappers) so
  // they aren't clipped by either scroll container.
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const phantomRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  useEffect(() => {
    const top = topRef.current;
    const bottom = bottomRef.current;
    const phantom = phantomRef.current;
    const table = tableRef.current;
    if (!top || !bottom || !phantom || !table) return;

    const syncWidth = () => {
      phantom.style.width = `${table.scrollWidth}px`;
    };
    syncWidth();

    // Track table width changes — happens when the column picker toggles
    // columns, when inline-edited values reflow column widths, or when the
    // viewport resizes.
    const ro = new ResizeObserver(syncWidth);
    ro.observe(table);

    // Mirror scroll positions. The `syncing` guard prevents the recursive
    // re-fire when one handler programmatically sets the other's scrollLeft
    // (which itself triggers a scroll event).
    let syncing = false;
    const onTopScroll = () => {
      if (syncing) return;
      syncing = true;
      bottom.scrollLeft = top.scrollLeft;
      syncing = false;
    };
    const onBottomScroll = () => {
      if (syncing) return;
      syncing = true;
      top.scrollLeft = bottom.scrollLeft;
      syncing = false;
    };
    top.addEventListener("scroll", onTopScroll);
    bottom.addEventListener("scroll", onBottomScroll);

    return () => {
      ro.disconnect();
      top.removeEventListener("scroll", onTopScroll);
      bottom.removeEventListener("scroll", onBottomScroll);
    };
  }, []);

  return (
    <div className="bg-neutral-0 rounded-lg overflow-hidden">
      <div ref={topRef} className="overflow-x-auto" aria-hidden="true">
        <div ref={phantomRef} className="h-px" />
      </div>
      <div ref={bottomRef} className="overflow-x-auto">
        <table
          ref={tableRef}
          className={cn("w-full min-w-max text-base border-collapse", className)}
          {...props}
        />
      </div>
    </div>
  );
}

export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn("text-sm text-neutral-500 border-b border-neutral-150", className)}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn(className)} {...props} />;
}

type TRProps = HTMLAttributes<HTMLTableRowElement> & {
  hover?: boolean;
};

export function TR({ className, hover = true, ...props }: TRProps) {
  return (
    <tr
      className={cn(
        "border-b border-neutral-150 last:border-b-0",
        hover && "hover:bg-neutral-50 transition-colors duration-120",
        className,
      )}
      {...props}
    />
  );
}

type Align = "left" | "right" | "center";

type ThProps = ThHTMLAttributes<HTMLTableCellElement> & { align?: Align };

export function TH({ className, align = "left", ...props }: ThProps) {
  return (
    <th
      className={cn(
        "px-3 py-2 font-medium",
        align === "left" && "text-left",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
      {...props}
    />
  );
}

type TdProps = TdHTMLAttributes<HTMLTableCellElement> & {
  align?: Align;
  numeric?: boolean;
  muted?: boolean;
};

export function TD({ className, align, numeric, muted, ...props }: TdProps) {
  const resolvedAlign = align ?? (numeric ? "right" : "left");
  return (
    <td
      className={cn(
        "px-3 py-2.5",
        resolvedAlign === "left" && "text-left",
        resolvedAlign === "right" && "text-right",
        resolvedAlign === "center" && "text-center",
        numeric && "tabular-nums",
        muted ? "text-neutral-600" : "text-neutral-900",
        className,
      )}
      {...props}
    />
  );
}

export function TableEmpty({ children, colSpan }: { children: ReactNode; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center text-neutral-500 text-sm">
        {children}
      </td>
    </tr>
  );
}
