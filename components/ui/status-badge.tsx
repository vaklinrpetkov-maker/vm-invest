import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// Two extra tones live here primarily for Properties status chips (§3.4 of
// specs/properties.md):
//   warning-soft   — lighter amber for `Запазен` (informal hold, not yet deposit)
//   neutral-outline — dashed grey outline for `Отложена продажба` (on-hold, visually distinct from the settled/greyed "Продаден Нот. Акт")
export type BadgeTone =
  | "neutral"
  | "success"
  | "warning"
  | "warning-soft"
  | "danger"
  | "info"
  | "accent"
  | "neutral-outline";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-neutral-100 text-neutral-600",
  success: "bg-success-50 text-success-700",
  warning: "bg-warning-50 text-warning-800",
  "warning-soft": "bg-warning-50/60 text-warning-700",
  danger: "bg-danger-50 text-danger-700",
  info: "bg-info-50 text-info-700",
  accent: "bg-accent-50 text-accent-700",
  "neutral-outline": "border border-dashed border-neutral-400 text-neutral-500 bg-transparent",
};

// Legacy alias — some call sites import `Tone`. Kept so existing usage compiles.
type Tone = BadgeTone;
export type { Tone };

export function StatusBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block px-2 py-0.5 rounded-sm text-xs font-medium tracking-tight",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
