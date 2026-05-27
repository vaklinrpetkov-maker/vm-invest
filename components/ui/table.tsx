// Table primitives following specs/design-system/tables.md (base) and specs/design-system/tables-advanced.md
// (advanced patterns). Defaults to compact, tabular-nums numeric cells, hover
// tints, neutral-150 row dividers. Extend rather than restyle for variants.

import type { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type TableProps = HTMLAttributes<HTMLTableElement>;

export function Table({ className, ...props }: TableProps) {
  return (
    // overflow-x-auto on the wrapper + min-w-max on the inner table lets
    // each table grow to its natural content width and scroll horizontally
    // when columns exceed the container. Inline-cell popovers use
    // `position: fixed` (anchored to the viewport, not the wrapper) so
    // they aren't clipped by the scroll container.
    <div className="bg-neutral-0 rounded-lg overflow-x-auto">
      <table
        className={cn("w-full min-w-max text-base border-collapse", className)}
        {...props}
      />
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
