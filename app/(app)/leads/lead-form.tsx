"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { ContactPicker } from "@/components/ui/contact-picker";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { ContactSuggestion } from "@/lib/contacts/search";
import {
  LEAD_SOURCE_LABELS,
  LEAD_SOURCE_USER_SELECTABLE,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_USER_SELECTABLE,
} from "@/lib/leads/constants";

// Shared create + edit form for leads. Edit passes `initial`; create leaves it
// undefined. The `fixContact` flag keeps the contact slot read-only on edit
// (per Leads.md §15 — contact relink isn't a Phase 1 feature).

export type LeadFormState = {
  errors?: {
    contactId?: string;
    source?: string;
    status?: string;
    ownerId?: string;
    form?: string;
  };
};

type Option = { id: string; fullName: string };

type Props = {
  action: (prev: LeadFormState, formData: FormData) => Promise<LeadFormState>;
  submitLabel: string;
  pendingLabel: string;
  owners: Option[];
  /** Used on create to preselect the creator as owner. Ignored when `initial` is set. */
  defaultOwnerId?: string;
  /** Pre-fill from a "+ Нов лийд" button on a contact profile. Ignored when `initial` is set. */
  prefillContact?: ContactSuggestion;
  initial?: {
    contact: ContactSuggestion;
    source: string;
    status: string;
    ownerId: string | null;
    properties: string[];
    message: string;
  };
  fixContact?: boolean;
};

const EMPTY: LeadFormState = {};

const SELECT_CLS =
  "h-8 px-3 rounded-lg bg-neutral-100 text-base text-neutral-900 tracking-tight hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120";

const TEXTAREA_CLS =
  "block w-full px-3 py-2 rounded-lg bg-neutral-100 text-base text-neutral-900 placeholder:text-neutral-400 tracking-tight hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120 resize-y";

export function LeadForm({
  action,
  submitLabel,
  pendingLabel,
  owners,
  defaultOwnerId,
  prefillContact,
  initial,
  fixContact,
}: Props) {
  const [state, formAction, pending] = useActionState(action, EMPTY);
  const [properties, setProperties] = useState<string[]>(
    initial?.properties.length ? initial.properties : [""],
  );

  const setProp = (i: number, v: string) => {
    setProperties((prev) => prev.map((p, idx) => (idx === i ? v : p)));
  };
  const addProp = () => setProperties((prev) => [...prev, ""]);
  const removeProp = (i: number) =>
    setProperties((prev) =>
      prev.length === 1 ? [""] : prev.filter((_, idx) => idx !== i),
    );

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-2xl">
      <FormField
        label="Контакт"
        htmlFor="contactId"
        required
        error={state.errors?.contactId}
        helper={
          fixContact ? "Контактът не може да се сменя след създаване." : undefined
        }
      >
        {fixContact && initial ? (
          <>
            <input type="hidden" name="contactId" value={initial.contact.id} />
            <div className="h-8 px-3 rounded-lg bg-neutral-50 flex items-center gap-2">
              <span className="text-base text-neutral-900 truncate">
                {initial.contact.fullName}
              </span>
              <span className="text-sm text-neutral-500 truncate">
                {[initial.contact.phone, initial.contact.email]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          </>
        ) : (
          <ContactPicker
            name="contactId"
            required
            initial={initial?.contact ?? prefillContact}
          />
        )}
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Източник" htmlFor="source" required error={state.errors?.source}>
          <select
            id="source"
            name="source"
            required
            defaultValue={initial?.source ?? "manual"}
            className={SELECT_CLS}
          >
            {LEAD_SOURCE_USER_SELECTABLE.map((s) => (
              <option key={s} value={s}>
                {LEAD_SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Статус" htmlFor="status" error={state.errors?.status}>
          <select
            id="status"
            name="status"
            defaultValue={initial?.status ?? "new"}
            className={SELECT_CLS}
          >
            {LEAD_STATUS_USER_SELECTABLE.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <FormField label="Отговорник" htmlFor="ownerId">
        <select
          id="ownerId"
          name="ownerId"
          defaultValue={initial ? initial.ownerId ?? "" : defaultOwnerId ?? ""}
          className={SELECT_CLS}
        >
          <option value="">— без —</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.fullName}
            </option>
          ))}
        </select>
      </FormField>

      <FormField
        label="Имоти"
        htmlFor="properties-0"
        helper='Формат: "Сграда — Имот", напр. "Добруджа — B9". Използвайте "Other" когато клиентът не е сигурен.'
      >
        <div className="flex flex-col gap-2">
          {properties.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                id={i === 0 ? "properties-0" : undefined}
                name="properties"
                type="text"
                value={p}
                onChange={(e) => setProp(i, e.target.value)}
                placeholder="Добруджа — B9"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeProp(i)}
                disabled={properties.length === 1 && p === ""}
              >
                ✕
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addProp}
            className="self-start"
          >
            + Добави имот
          </Button>
        </div>
      </FormField>

      <FormField
        label="Съобщение / бележки"
        htmlFor="message"
        helper="Това, което клиентът пита, или вашата бележка за запитването."
      >
        <textarea
          id="message"
          name="message"
          rows={4}
          defaultValue={initial?.message ?? ""}
          className={TEXTAREA_CLS}
        />
      </FormField>

      {state.errors?.form && <p className="text-sm text-danger-700">{state.errors.form}</p>}

      <Button type="submit" disabled={pending} className="mt-2 self-start">
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
