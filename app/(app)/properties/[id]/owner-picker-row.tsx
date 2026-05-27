"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ContactPicker } from "@/components/ui/contact-picker";
import type { ContactSuggestion } from "@/lib/contacts/search";
import { cn } from "@/lib/cn";
import { updatePropertyOwner } from "../actions";

// "Собственик" row on the property detail page. Two modes:
//   - canEdit=false → read-only name (linked to /contacts/[id]) or em-dash,
//     with an optional tooltip explaining why it's locked.
//   - canEdit=true  → ContactPicker with an explicit Запази button that
//     only appears when the picker state diverges from the saved owner.
//
// We use explicit submit (not autosave) so "Смени → Запази" is a deliberate
// clear rather than a race-prone two-step.

type Props = {
  propertyId: string;
  initial: ContactSuggestion | null;
  canEdit: boolean;
  lockMessage?: string | null;
};

export function OwnerPickerRow({ propertyId, initial, canEdit, lockMessage }: Props) {
  const [saved, setSaved] = useState<ContactSuggestion | null>(initial);
  const [draft, setDraft] = useState<ContactSuggestion | null>(initial);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  if (!canEdit) {
    return (
      <div className="inline-flex items-center gap-2" title={lockMessage ?? undefined}>
        {saved ? (
          <Link
            href={`/contacts/${saved.id}` as Route}
            className="text-neutral-900 hover:text-accent-700 transition-colors"
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

  function save() {
    setErr(null);
    setOk(false);
    startTransition(async () => {
      const res = await updatePropertyOwner(propertyId, draft?.id ?? null);
      if (!res.ok) {
        setErr(res.error ?? "Грешка при запис.");
        return;
      }
      setSaved(draft);
      setOk(true);
      // Flash the success indicator briefly.
      setTimeout(() => setOk(false), 1500);
    });
  }

  function cancel() {
    setDraft(saved);
    setErr(null);
  }

  return (
    <div className="space-y-2">
      <ContactPicker
        name={`property-owner-${propertyId}`}
        initial={saved ?? undefined}
        onChange={(c) => {
          setDraft(c);
          setErr(null);
          setOk(false);
        }}
      />
      {dirty && (
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={save} disabled={pending}>
            {pending ? "Запис…" : "Запази"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={cancel} disabled={pending}>
            Отказ
          </Button>
          {draft === null && saved !== null && (
            <span className="text-xs text-neutral-500">
              Запазването ще изчисти собственика.
            </span>
          )}
        </div>
      )}
      {err && <div className="text-sm text-danger-700">{err}</div>}
      <div
        className={cn(
          "text-xs text-success-700 transition-opacity duration-200",
          ok ? "opacity-100" : "opacity-0 h-0",
        )}
      >
        Запазено.
      </div>
    </div>
  );
}
