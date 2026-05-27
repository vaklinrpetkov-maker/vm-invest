"use client";

// Shared form for create + edit of Tasks. Uses the form-state pattern (a
// `useActionState` hook) the rest of the codebase uses for invite / contact
// edits — see `app/(app)/contacts/contact-form.tsx` for the precedent.
//
// Status defaults to `todo` on create and is read-only on the form (the
// inline-status-cell on the list/detail page is the canonical edit path
// for status). Owner uses the existing <ContactPicker>-style server-driven
// list of active profiles passed in as `owners`.

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TaskFormState } from "./actions";

type Props = {
  mode: "create" | "edit";
  initial?: {
    title?: string;
    description?: string | null;
    dueDateIso?: string | null; // YYYY-MM-DD
    ownerId?: string | null;
  };
  owners: ReadonlyArray<{ id: string; fullName: string }>;
  action: (
    prev: TaskFormState,
    formData: FormData,
  ) => Promise<TaskFormState>;
};

export function TaskForm({ mode, initial, owners, action }: Props) {
  const [state, formAction, pending] = useActionState<TaskFormState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="title" className="text-sm font-medium text-neutral-700 mb-1.5 block">
          Заглавие *
        </label>
        <Input
          id="title"
          name="title"
          type="text"
          required
          defaultValue={initial?.title ?? ""}
          maxLength={200}
          placeholder="напр. Обади се на Иван за договора"
          invalid={!!state.errors?.title}
          autoFocus={mode === "create"}
        />
        {state.errors?.title && (
          <p className="text-sm text-danger-700 mt-1">{state.errors.title}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="description"
          className="text-sm font-medium text-neutral-700 mb-1.5 block"
        >
          Описание
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={initial?.description ?? ""}
          placeholder="Подробности, контекст, връзки..."
          className="block w-full rounded-lg bg-neutral-100 hover:bg-neutral-150 px-3 py-2 text-base text-neutral-900 placeholder:text-neutral-400 tracking-tight transition-colors duration-120 focus:outline-none focus:ring-2 focus:ring-accent-500/40 resize-y"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="dueDate"
            className="text-sm font-medium text-neutral-700 mb-1.5 block"
          >
            Краен срок
          </label>
          <Input
            id="dueDate"
            name="dueDate"
            type="date"
            defaultValue={initial?.dueDateIso ?? ""}
            invalid={!!state.errors?.dueDate}
          />
          {state.errors?.dueDate && (
            <p className="text-sm text-danger-700 mt-1">{state.errors.dueDate}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="ownerId"
            className="text-sm font-medium text-neutral-700 mb-1.5 block"
          >
            Отговорник
          </label>
          <select
            id="ownerId"
            name="ownerId"
            defaultValue={initial?.ownerId ?? ""}
            className="block w-full h-8 px-3 rounded-lg bg-neutral-100 hover:bg-neutral-150 text-base text-neutral-900 transition-colors duration-120 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
          >
            <option value="">— Без отговорник</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.fullName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {state.errors?.form && (
        <p className="text-sm text-danger-700">{state.errors.form}</p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending
            ? mode === "create"
              ? "Създаване…"
              : "Запазване…"
            : mode === "create"
              ? "Създай задача"
              : "Запази"}
        </Button>
      </div>
    </form>
  );
}
