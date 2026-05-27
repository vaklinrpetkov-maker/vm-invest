"use client";

import Link from "next/link";
import type { Route } from "next";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { findPotentialDuplicates, type DuplicateMatch } from "./duplicate-actions";

// Shared fields for create + edit. "building" and "properties" are intentionally
// absent — per specs/contacts.md §5.1 they propagate from Contracts, not from
// the contact form itself.

export type ContactFormValues = {
  fullName: string;
  type: string;
  phone: string;
  email: string;
  birthDate: string; // YYYY-MM-DD or ""
  egn: string;
  address: string;
  ownerId: string;
  notes: string;
};

export type ContactFormState = {
  errors?: Partial<Record<keyof ContactFormValues | "form", string>>;
  warnings?: Partial<Record<keyof ContactFormValues, string>>;
};

type Option = { id: string; fullName: string };

type Props = {
  action: (prev: ContactFormState, formData: FormData) => Promise<ContactFormState>;
  initial?: Partial<ContactFormValues>;
  submitLabel: string;
  pendingLabel: string;
  types: readonly string[];
  owners: Option[];
  /** When editing, exclude the current contact from duplicate checks. */
  excludeId?: string;
};

const EMPTY: ContactFormState = {};

const SELECT_CLS =
  "h-8 px-3 rounded-lg bg-neutral-100 text-base text-neutral-900 tracking-tight hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120";

const TEXTAREA_CLS =
  "block w-full px-3 py-2 rounded-lg bg-neutral-100 text-base text-neutral-900 placeholder:text-neutral-400 tracking-tight hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120 resize-y";

export function ContactForm({
  action,
  initial,
  submitLabel,
  pendingLabel,
  types,
  owners,
  excludeId,
}: Props) {
  const [state, formAction, pending] = useActionState(action, EMPTY);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [, startCheck] = useTransition();

  const checkDuplicates = (field: "phone" | "email" | "egn", value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setDuplicates([]);
      return;
    }
    startCheck(async () => {
      const matches = await findPotentialDuplicates({
        [field]: trimmed,
        excludeId: excludeId ?? null,
      });
      setDuplicates(matches);
    });
  };

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-2xl">
      <FormField label="Име" htmlFor="fullName" required error={state.errors?.fullName}>
        <Input
          id="fullName"
          name="fullName"
          type="text"
          required
          autoFocus
          autoComplete="off"
          defaultValue={initial?.fullName ?? ""}
          invalid={!!state.errors?.fullName}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Тип" htmlFor="type" required error={state.errors?.type}>
          <select
            id="type"
            name="type"
            required
            defaultValue={initial?.type ?? ""}
            className={SELECT_CLS}
          >
            <option value="" disabled>
              Изберете тип…
            </option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Отговорник" htmlFor="ownerId">
          <select
            id="ownerId"
            name="ownerId"
            defaultValue={initial?.ownerId ?? ""}
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
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Телефон" htmlFor="phone" error={state.errors?.phone}>
          <Input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="off"
            placeholder="+359..."
            defaultValue={initial?.phone ?? ""}
            invalid={!!state.errors?.phone}
            onBlur={(e) => checkDuplicates("phone", e.target.value)}
          />
        </FormField>
        <FormField label="Имейл" htmlFor="email" error={state.errors?.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="off"
            defaultValue={initial?.email ?? ""}
            invalid={!!state.errors?.email}
            onBlur={(e) => checkDuplicates("email", e.target.value)}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="ЕГН / ЕИК"
          htmlFor="egn"
          helper="10 цифри за ЕГН или 9 за ЕИК."
          error={state.errors?.egn ?? state.warnings?.egn}
          help={
            <>
              <p className="mb-1.5">
                <strong>ЕГН</strong> — Единен граждански номер на физическо
                лице. 10 цифри, кодира рождена дата + контролна цифра.
              </p>
              <p>
                <strong>ЕИК</strong> — Единен идентификационен код на
                юридическо лице (фирма). 9 цифри, издава се от Търговския
                регистър.
              </p>
              <p className="mt-1.5 text-neutral-500">
                Невалидна контролна сума на ЕГН не блокира запис — записва се
                като предупреждение.
              </p>
            </>
          }
        >
          <Input
            id="egn"
            name="egn"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={initial?.egn ?? ""}
            invalid={!!state.errors?.egn}
            onBlur={(e) => checkDuplicates("egn", e.target.value)}
          />
        </FormField>
        <FormField label="Дата на раждане" htmlFor="birthDate" error={state.errors?.birthDate}>
          <Input
            id="birthDate"
            name="birthDate"
            type="date"
            defaultValue={initial?.birthDate ?? ""}
            invalid={!!state.errors?.birthDate}
          />
        </FormField>
      </div>

      <FormField label="Адрес" htmlFor="address">
        <textarea
          id="address"
          name="address"
          rows={2}
          defaultValue={initial?.address ?? ""}
          className={TEXTAREA_CLS}
        />
      </FormField>

      <FormField label="Допълнителни бележки" htmlFor="notes">
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={initial?.notes ?? ""}
          className={TEXTAREA_CLS}
        />
      </FormField>

      {duplicates.length > 0 && (
        <div className="rounded-lg bg-warning-50 border border-warning-100 p-3 text-sm text-warning-800 space-y-1">
          <p className="font-medium">Възможен дубликат:</p>
          <ul className="space-y-0.5">
            {duplicates.map((d) => (
              <li key={d.id} className="flex items-center gap-2">
                <Link
                  href={`/contacts/${d.id}` as Route}
                  className="underline hover:text-warning-800"
                >
                  {d.fullName}
                </Link>
                <span className="text-warning-800/70">
                  {[d.phone, d.email, d.egn].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-warning-800/80">
            Ако това е същият контакт, отворете съществуващия. Иначе продължете.
          </p>
        </div>
      )}

      {state.errors?.form && <p className="text-sm text-danger-700">{state.errors.form}</p>}

      <Button type="submit" disabled={pending} className="mt-2 self-start">
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
