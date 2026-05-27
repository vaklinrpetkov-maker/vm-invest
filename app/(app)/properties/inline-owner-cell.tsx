"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { ContactPicker } from "@/components/ui/contact-picker";
import type { ContactSuggestion } from "@/lib/contacts/search";
import { cn } from "@/lib/cn";
import { updatePropertyOwner } from "./actions";

// Inline-edit cell for the Property.owner column in the list table. Click the
// cell → a small floating panel opens containing a ContactPicker + Запази
// button. This lets admins bulk-assign owners to a building's properties
// without round-tripping through the detail page for each row.
//
// Design notes:
// - The cell itself stays narrow (matches Status/Type inline cells).
// - Popover is positioned absolutely below the cell, width 280px so the
//   picker's typeahead dropdown has room.
// - Closes on outside click or Escape.
// - Locked (contract linked) or no-permission cells render a muted tooltip
//   instead of an editable trigger — mirroring lib/properties/permissions.ts.

type Props = {
  propertyId: string;
  initialOwner: { id: string; fullName: string; phone: string | null; email: string | null } | null;
  canEdit: boolean;
  lockMessage: string | null;
};

export function InlineOwnerCell({ propertyId, initialOwner, canEdit, lockMessage }: Props) {
  const [saved, setSaved] = useState<ContactSuggestion | null>(initialOwner);
  const [draft, setDraft] = useState<ContactSuggestion | null>(initialOwner);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Mark mounted so portal can render on client only.
  useEffect(() => setMounted(true), []);

  // Compute popover coordinates from the trigger's bounding rect. The popover
  // is 280px wide; anchor its left edge to the trigger's left and top to just
  // below the trigger (+4px gap). Fixed-positioned = relative to the viewport,
  // so we only need to recompute on open and on scroll/resize.
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const popWidth = 280;
      // Nudge leftwards if the popover would overflow the right edge.
      const maxLeft = window.innerWidth - popWidth - 8;
      const left = Math.max(8, Math.min(r.left, maxLeft));
      setCoords({ left, top: r.bottom + 4 });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  // Close on outside click or Esc.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function save() {
    setErr(null);
    startTransition(async () => {
      const res = await updatePropertyOwner(propertyId, draft?.id ?? null);
      if (!res.ok) {
        setErr(res.error ?? "Грешка при запис.");
        return;
      }
      setSaved(draft);
      setOpen(false);
    });
  }

  function cancel() {
    setDraft(saved);
    setErr(null);
    setOpen(false);
  }

  // Read-only view.
  if (!canEdit) {
    return (
      <div title={lockMessage ?? undefined} className="cursor-not-allowed">
        {saved ? (
          <Link
            href={`/contacts/${saved.id}` as Route}
            className="text-neutral-700 hover:text-accent-700 transition-colors"
          >
            {saved.fullName}
          </Link>
        ) : (
          <span className="text-neutral-400">—</span>
        )}
      </div>
    );
  }

  const dirty = (saved?.id ?? null) !== (draft?.id ?? null);

  return (
    <>
      {/* Trigger: shows the saved owner (or em-dash) as a clickable area.
          The popover is rendered in a portal so the Table's overflow-hidden
          wrapper can't clip it. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setDraft(saved);
          setErr(null);
          setOpen((x) => !x);
        }}
        className={cn(
          "text-left w-full rounded-sm px-1 -mx-1 hover:bg-neutral-100 transition-colors duration-120",
          open && "bg-neutral-100",
        )}
        title="Избери контакт, за да го свържеш като собственик."
      >
        {saved ? (
          <span className="text-neutral-700 hover:text-accent-700">{saved.fullName}</span>
        ) : (
          <span className="text-neutral-400">— избери —</span>
        )}
      </button>

      {mounted && open &&
        createPortal(
          <div
            ref={popoverRef}
            className="fixed z-dropdown w-[280px] bg-neutral-0 rounded-lg shadow-popover p-3 space-y-2"
            style={{ left: coords.left, top: coords.top }}
          >
            <div className="flex items-center justify-between">
              <div className="text-xs text-neutral-500">Собственик</div>
              {saved && (
                <Link
                  href={`/contacts/${saved.id}` as Route}
                  className="text-xs text-neutral-500 hover:text-accent-700"
                  title="Отвори профила на текущия собственик"
                >
                  Виж профила ↗
                </Link>
              )}
            </div>
            <ContactPicker
              name={`inline-owner-${propertyId}`}
              initial={draft ?? undefined}
              onChange={(c) => {
                setDraft(c);
                setErr(null);
              }}
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button type="button" size="sm" variant="ghost" onClick={cancel} disabled={pending}>
                Отказ
              </Button>
              <Button type="button" size="sm" onClick={save} disabled={pending || !dirty}>
                {pending ? "Запис…" : "Запази"}
              </Button>
            </div>
            {err && <div className="text-xs text-danger-700">{err}</div>}
            {draft === null && saved !== null && (
              <div className="text-xs text-neutral-500">
                Запазването ще изчисти собственика.
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
