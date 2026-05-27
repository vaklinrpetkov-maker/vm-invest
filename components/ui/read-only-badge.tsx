// Tiny lock-icon badge that surfaces a cell as not-editable on hover.
// Used next to system-managed timestamps (`createdAt`), derived fields
// (`age`, `birthdayThisYear`), and module-locked columns.
//
// Spec: `_foundations/ui-patterns-inline-edit.md` §3.12 — read-only cells
// should be visually distinguishable from editable ones, with a tooltip
// explaining why they're locked.

import { cn } from "@/lib/cn";

export function ReadOnlyBadge({
  reason,
  className,
}: {
  reason: string;
  className?: string;
}) {
  return (
    <span
      title={reason}
      aria-label={reason}
      className={cn(
        "ml-1 text-neutral-300 text-[10px] cursor-help select-none align-middle",
        className,
      )}
    >
      🔒
    </span>
  );
}
