"use client";

import { useActionState, useState, useMemo } from "react";
import type { ApartmentSize } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { ContactPicker } from "@/components/ui/contact-picker";
import { FieldHelp } from "@/components/ui/field-help";
import { Input } from "@/components/ui/input";
import { PropertyPicker } from "@/components/ui/property-picker";
import { StatusBadge } from "@/components/ui/status-badge";
import { UserPicker } from "@/components/ui/user-picker";
import { cn } from "@/lib/cn";
import type { ContactSuggestion } from "@/lib/contacts/search";
import type { ProfileSuggestion } from "@/lib/profiles/search";
import type { PropertySuggestion } from "@/lib/properties/search";
import {
  APARTMENT_SIZES,
  APARTMENT_SIZE_LABELS,
  APARTMENT_SIZE_DURATION_FIELD,
} from "@/lib/renovations/constants";
import type { RenovationFormState } from "@/lib/renovations/parse";

// Create-only form for /renovations/new. Rewritten 20.05.2026 for the
// template-driven activity model. Two visual steps in one form:
//   1. Header — property, size, baths, planned start, manager, requestedBy,
//      description.
//   2. Activity loader — checkbox list of catalog templates, each row
//      showing its computed duration for the chosen size × bathroom-mult.
//
// Submit posts the whole thing; the server action runs the chain-load.

export type ActivityTemplateOption = {
  id: string;
  name: string;
  teamName: string | null;
  teamSpecialty: string | null;
  peopleRequired: number;
  bathroomMultiplied: boolean;
  durationStudio: number;
  durationTwoRoom: number;
  durationThreeRoom: number;
  durationFourRoom: number;
  sortOrder: number;
};

export type RenovationCreateInitial = {
  property: PropertySuggestion | null;
  requestedBy: ContactSuggestion | null;
  manager: ProfileSuggestion | null;
  apartmentSize: ApartmentSize | null;
  bathroomCount: number;
  description: string;
  plannedStartDate: string; // ISO YYYY-MM-DD
};

type Props = {
  action: (
    prev: RenovationFormState,
    formData: FormData,
  ) => Promise<RenovationFormState>;
  initial: RenovationCreateInitial;
  templates: ActivityTemplateOption[];
};

const SIZE_FIELD = APARTMENT_SIZE_DURATION_FIELD;

function durationFor(
  t: ActivityTemplateOption,
  size: ApartmentSize,
  baths: number,
): number {
  const base = t[SIZE_FIELD[size]];
  return t.bathroomMultiplied ? base * Math.max(1, baths) : base;
}

// Bulgarian-friendly: "8 дни" / "8 ½ дни" / "12 дни (× 2 бани)"
function formatDuration(n: number, multiplied: boolean): string {
  const whole = Math.floor(n);
  const half = n - whole >= 0.5;
  const left = `${whole}${half ? "½" : ""}`;
  return multiplied ? `${left} дни (× бани)` : `${left} дни`;
}

// Shared by the loader checklist's `?` icon — shows the raw per-size
// durations for a template so the operator can compare without picking a
// size first. Per spec §5.2 step 2.
export function TemplateDurationBreakdown({
  t,
}: {
  t: ActivityTemplateOption;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm text-neutral-700">
        Базова продължителност според вида апартамент:
      </p>
      <ul className="text-sm text-neutral-900 tabular-nums">
        <li>Едностаен: <strong>{t.durationStudio}</strong> дни</li>
        <li>Двустаен: <strong>{t.durationTwoRoom}</strong> дни</li>
        <li>Тристаен: <strong>{t.durationThreeRoom}</strong> дни</li>
        <li>Четиристаен: <strong>{t.durationFourRoom}</strong> дни</li>
      </ul>
      {t.bathroomMultiplied && (
        <p className="text-xs text-neutral-500">
          ⓘ Продължителността се умножава по броя бани на имота.
        </p>
      )}
      {t.peopleRequired > 0 && t.teamName && (
        <p className="text-xs text-neutral-500">
          Изисква {t.peopleRequired}{" "}
          {t.peopleRequired === 1 ? "човек" : "човека"} от {t.teamName}.
        </p>
      )}
    </div>
  );
}

export function RenovationCreateForm({ action, initial, templates }: Props) {
  const [state, formAction, pending] = useActionState<
    RenovationFormState,
    FormData
  >(action, {});

  const [size, setSize] = useState<ApartmentSize | "">(initial.apartmentSize ?? "");
  const [baths, setBaths] = useState<number>(initial.bathroomCount);
  // All templates start selected? No — Spec §5.2 says the operator ticks
  // what they want. Default = none selected; "Избери всички" + "Изчисти"
  // give quick paths.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Once a create succeeds, the action returns the new id — navigate.
  if (state.createdRenovationId) {
    if (typeof window !== "undefined") {
      window.location.href = `/renovations/${state.createdRenovationId}`;
    }
  }

  const fieldError = (key: keyof NonNullable<RenovationFormState["errors"]>) =>
    state.errors?.[key];

  // Running totals shown in the footer of the activity loader.
  const totals = useMemo(() => {
    if (!size) return { count: 0, days: 0 };
    let days = 0;
    let count = 0;
    for (const t of templates) {
      if (!selected.has(t.id)) continue;
      count++;
      days += durationFor(t, size as ApartmentSize, baths);
    }
    return { count, days };
  }, [selected, size, baths, templates]);

  const allSelected = templates.length > 0 && selected.size === templates.length;

  return (
    <form action={formAction} className="space-y-8 max-w-4xl">
      {state.errors?.form && (
        <div className="rounded-lg bg-danger-50 text-danger-700 px-3 py-2 text-sm">
          {state.errors.form}
        </div>
      )}

      {/* ─── Step 1: Header ─────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-md font-medium text-neutral-900">
          1. Основни данни
        </h2>

        <div className="space-y-1.5">
          <label className="text-sm text-neutral-600">Имот *</label>
          <PropertyPicker name="propertyId" initial={initial.property} required />
          {fieldError("propertyId") && (
            <div className="text-sm text-danger-700">{fieldError("propertyId")}</div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm text-neutral-600">Размер *</label>
            <select
              name="apartmentSize"
              value={size}
              onChange={(e) => setSize(e.target.value as ApartmentSize | "")}
              required
              className="block w-full px-3 py-2 rounded-lg bg-neutral-100 text-base text-neutral-900 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
            >
              <option value="">— Изберете —</option>
              {APARTMENT_SIZES.map((s) => (
                <option key={s} value={s}>
                  {APARTMENT_SIZE_LABELS[s]}
                </option>
              ))}
            </select>
            <span className="text-xs text-neutral-500">
              Определя продължителността на дейностите. Не може да се променя
              след създаване.
            </span>
            {fieldError("apartmentSize") && (
              <div className="text-sm text-danger-700">{fieldError("apartmentSize")}</div>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-neutral-600">Брой бани *</label>
            <Input
              type="number"
              name="bathroomCount"
              min={1}
              step={1}
              value={String(baths)}
              onChange={(e) => setBaths(Math.max(1, Number(e.target.value) || 1))}
              required
            />
            <span className="text-xs text-neutral-500">
              Умножава продължителността на 5 дейности, маркирани с „× бани“.
            </span>
            {fieldError("bathroomCount") && (
              <div className="text-sm text-danger-700">{fieldError("bathroomCount")}</div>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm text-neutral-600">Планирано начало</label>
          <Input
            type="date"
            name="plannedStartDate"
            defaultValue={initial.plannedStartDate}
          />
          <span className="text-xs text-neutral-500">
            Дейностите се пускат в редица от тази дата. Краят се изчислява
            автоматично.
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm text-neutral-600">Заявител</label>
            <ContactPicker
              name="requestedByContactId"
              initial={initial.requestedBy}
              placeholder="Търси контакт…"
            />
            <span className="text-xs text-neutral-500">
              Клиентът, който е заявил ремонта. Оставете празно за вътрешен
              ремонт.
            </span>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-neutral-600">Отговорник</label>
            <UserPicker
              name="managerId"
              initial={initial.manager}
              placeholder="Търси служител…"
            />
            <span className="text-xs text-neutral-500">
              По подразбиране — създателят на ремонта.
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm text-neutral-600">Описание</label>
          <textarea
            name="description"
            defaultValue={initial.description}
            rows={3}
            maxLength={4000}
            placeholder="Особени изисквания, контекст…"
            className="block w-full px-3 py-2 rounded-lg bg-neutral-100 text-base text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-accent-500/40 resize-y"
          />
        </div>
      </section>

      {/* ─── Step 2: Activity loader ────────────────────────────────── */}
      <section className="space-y-4 border-t border-neutral-150 pt-6">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <h2 className="text-md font-medium text-neutral-900">
            2. Дейности по ремонта
          </h2>
          <div className="text-sm text-neutral-500 flex items-center gap-4">
            <button
              type="button"
              onClick={() => setSelected(new Set(templates.map((t) => t.id)))}
              className="text-accent-700 hover:underline"
              disabled={allSelected}
            >
              Избери всички
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-neutral-600 hover:text-neutral-900 hover:underline"
              disabled={selected.size === 0}
            >
              Изчисти
            </button>
          </div>
        </div>

        {!size ? (
          <div className="text-sm text-neutral-500 bg-neutral-50 rounded-md p-4">
            Първо изберете размер на апартамента, за да видите продължителността
            на всяка дейност.
          </div>
        ) : templates.length === 0 ? (
          <div className="text-sm text-neutral-500 bg-neutral-50 rounded-md p-4">
            Каталогът е празен. Първо създайте дейности в{" "}
            <a href="/admin/renovations/activities" className="text-accent-700 hover:underline">
              админ панела
            </a>
            .
          </div>
        ) : (
          <div className="border border-neutral-200 rounded-lg overflow-hidden">
            {templates.map((t, idx) => {
              const isChecked = selected.has(t.id);
              const dur = durationFor(t, size as ApartmentSize, baths);
              return (
                <label
                  key={t.id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors duration-120",
                    idx > 0 && "border-t border-neutral-150",
                    isChecked ? "bg-accent-50/50" : "hover:bg-neutral-50",
                  )}
                >
                  <input
                    type="checkbox"
                    name="templateId"
                    value={t.id}
                    checked={isChecked}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(t.id);
                      else next.delete(t.id);
                      setSelected(next);
                    }}
                    className="rounded"
                  />
                  <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
                    <span className="text-sm text-neutral-900">{t.name}</span>
                    {t.teamName ? (
                      <StatusBadge tone="neutral">
                        {t.teamSpecialty ?? t.teamName}
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral-outline">Outsourced</StatusBadge>
                    )}
                    {t.peopleRequired > 0 && (
                      <span className="text-xs text-neutral-500 tabular-nums">
                        × {t.peopleRequired} {t.peopleRequired === 1 ? "човек" : "човека"}
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-neutral-700 tabular-nums shrink-0">
                    {formatDuration(dur, t.bathroomMultiplied)}
                  </span>
                  <FieldHelp
                    title={t.name}
                    content={<TemplateDurationBreakdown t={t} />}
                  />
                </label>
              );
            })}
          </div>
        )}

        {size && templates.length > 0 && (
          <div className="flex items-center justify-between text-sm text-neutral-600 pt-1">
            <span>
              Маркирани: <span className="tabular-nums">{totals.count}</span> дейности
              {totals.count > 0 && (
                <>
                  {" "}
                  · общо ~<span className="tabular-nums">{totals.days}</span> дни
                </>
              )}
            </span>
          </div>
        )}
      </section>

      {/* Hidden default status — create defaults to draft. */}
      <input type="hidden" name="status" value="draft" />

      <div className="flex items-center gap-2 pt-2 border-t border-neutral-150">
        <Button type="submit" disabled={pending}>
          {pending ? "Създаване…" : "Създай ремонт"}
        </Button>
        <p className="text-xs text-neutral-500">
          Можете да добавите или премахнете дейности и след създаването.
        </p>
      </div>
    </form>
  );
}
