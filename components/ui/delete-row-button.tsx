"use client";

// Shared per-row delete affordance for list tables. Renders a small × icon
// in the trailing actions column; caller decides whether to render based on
// the viewer's role (the server action also enforces the role gate as
// defense-in-depth).
//
// On click: native confirm() → action fires → revalidatePath inside the
// action refreshes the table → row disappears. Errors surface as toasts;
// the row stays put (action's role-check rejects non-admins with a clear
// Bulgarian message).

import { useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

type Result = { ok: true } | { ok: false; error: string };

type Props = {
  /** Label shown in the confirm dialog — e.g. "контакта „Иван Иванов"". */
  label: string;
  /** Bound server action — see the module's `actions.ts` for the canonical
   *  delete action (deleteContact, deleteLead, etc). The caller passes a
   *  no-arg async function; binding is done at the call site via
   *  `() => deleteContact(id)`. */
  onDelete: () => Promise<Result | void>;
  /** Optional class on the wrapping button (e.g. `ml-auto`). */
  className?: string;
  /** Override the trigger glyph. Default × — small, consistent with the
   *  existing per-activity delete in renovations-editor.tsx. */
  glyph?: string;
};

export function DeleteRowButton({ label, onDelete, className, glyph = "×" }: Props) {
  const [pending, startTransition] = useTransition();
  const { error: toastError } = useToast();

  function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    // Stop propagation so the click doesn't bubble to a row-level Link
    // (some modules wrap the row in a navigation link).
    e.stopPropagation();
    if (!confirm(`Изтриване на ${label}?`)) return;
    startTransition(async () => {
      try {
        const res = await onDelete();
        // Some delete actions don't return a result (they just redirect or
        // throw); only show toast when we got an explicit error back.
        if (res && !res.ok) {
          toastError(`Изтриването не успя. ${res.error}`);
        }
      } catch (err) {
        toastError(
          `Възникна грешка при изтриване. ${
            err instanceof Error ? err.message : "Опитайте отново."
          }`,
        );
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label={`Изтрий ${label}`}
      title={`Изтрий ${label}`}
      className={cn(
        "inline-flex items-center justify-center w-7 h-7 rounded-md text-neutral-400 hover:text-danger-700 hover:bg-danger-50 transition-colors duration-120",
        pending && "opacity-50 cursor-wait",
        className,
      )}
    >
      <span aria-hidden="true" className="text-lg leading-none">{glyph}</span>
    </button>
  );
}
