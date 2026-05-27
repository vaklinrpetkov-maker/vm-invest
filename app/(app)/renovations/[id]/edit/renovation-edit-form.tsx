"use client";

import { useActionState } from "react";
import type { RenovationStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { ContactPicker } from "@/components/ui/contact-picker";
import { Input } from "@/components/ui/input";
import { PropertyPicker } from "@/components/ui/property-picker";
import { UserPicker } from "@/components/ui/user-picker";
import type { ContactSuggestion } from "@/lib/contacts/search";
import type { ProfileSuggestion } from "@/lib/profiles/search";
import type { PropertySuggestion } from "@/lib/properties/search";
import {
  RENOVATION_STATUSES,
  RENOVATION_STATUS_LABELS,
} from "@/lib/renovations/constants";
import type { RenovationFormState } from "@/lib/renovations/parse";

// Edit-only form for /renovations/[id]/edit. Header-only: status,
// description, manager, requestedBy, property, planned start, actual dates.
//
// Deliberately NOT editable here (per spec §6.1 + locked answer):
//   - apartmentSize, bathroomCount — baked at creation; changing them would
//     invalidate every snapshot duration. To change either, delete + recreate.
//   - plannedEndDate — derived from MAX(activity.endDate); changing it
//     directly would desync the cache.
//   - title, type — derived / dropped from the schema.

export type RenovationEditInitial = {
  status: RenovationStatus;
  description: string;
  property: PropertySuggestion | null;
  requestedBy: ContactSuggestion | null;
  manager: ProfileSuggestion | null;
  plannedStartDate: string; // ISO YYYY-MM-DD
  actualStartDate: string;
  actualEndDate: string;
};

type Props = {
  action: (
    prev: RenovationFormState,
    formData: FormData,
  ) => Promise<RenovationFormState>;
  initial: RenovationEditInitial;
};

export function RenovationEditForm({ action, initial }: Props) {
  const [state, formAction, pending] = useActionState<
    RenovationFormState,
    FormData
  >(action, {});

  const fieldError = (key: keyof NonNullable<RenovationFormState["errors"]>) =>
    state.errors?.[key];

  return (
    <form action={formAction} className="space-y-6 max-w-3xl">
      {state.errors?.form && (
        <div className="rounded-lg bg-danger-50 text-danger-700 px-3 py-2 text-sm">
          {state.errors.form}
        </div>
      )}

      <section className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm text-neutral-600">Имот *</label>
          <PropertyPicker name="propertyId" initial={initial.property} required />
          {fieldError("propertyId") && (
            <div className="text-sm text-danger-700">{fieldError("propertyId")}</div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm text-neutral-600">Статус</label>
          <select
            name="status"
            defaultValue={initial.status}
            className="block w-full px-3 py-2 rounded-lg bg-neutral-100 text-base text-neutral-900 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
          >
            {RENOVATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {RENOVATION_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm text-neutral-600">Описание</label>
          <textarea
            name="description"
            defaultValue={initial.description}
            rows={4}
            maxLength={4000}
            className="block w-full px-3 py-2 rounded-lg bg-neutral-100 text-base text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-accent-500/40 resize-y"
          />
          {fieldError("description") && (
            <div className="text-sm text-danger-700">{fieldError("description")}</div>
          )}
        </div>
      </section>

      <section className="space-y-4 border-t border-neutral-150 pt-6">
        <h2 className="text-md font-medium text-neutral-900">Хора</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm text-neutral-600">Заявител</label>
            <ContactPicker
              name="requestedByContactId"
              initial={initial.requestedBy}
              placeholder="Търси контакт…"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-neutral-600">Отговорник</label>
            <UserPicker
              name="managerId"
              initial={initial.manager}
              placeholder="Търси служител…"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t border-neutral-150 pt-6">
        <h2 className="text-md font-medium text-neutral-900">График</h2>
        <p className="text-xs text-neutral-500">
          Планираният край се изчислява автоматично от датите на дейностите.
          Размерът и броят бани не могат да се променят след създаване — ако
          трябва да се сменят, изтрийте и създайте ремонта отново.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm text-neutral-600">Планирано начало</label>
            <Input
              type="date"
              name="plannedStartDate"
              defaultValue={initial.plannedStartDate}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-neutral-600">
              Реално начало{" "}
              <span className="text-neutral-400 text-xs">— автоматично при „В процес“</span>
            </label>
            <Input
              type="date"
              name="actualStartDate"
              defaultValue={initial.actualStartDate}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-neutral-600">
              Реално завършване{" "}
              <span className="text-neutral-400 text-xs">— автоматично при „Завършена“</span>
            </label>
            <Input
              type="date"
              name="actualEndDate"
              defaultValue={initial.actualEndDate}
            />
            {state.warnings?.actualEndDate && (
              <div className="text-sm text-warning-700">{state.warnings.actualEndDate}</div>
            )}
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Запис…" : "Запази промените"}
        </Button>
      </div>
    </form>
  );
}
