"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { bootstrapFirstAdmin, type BootstrapState } from "./actions";

const initialState: BootstrapState = {};

export function BootstrapForm() {
  const [state, formAction, pending] = useActionState(bootstrapFirstAdmin, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormField label="Пълно име" htmlFor="fullName" required error={state.errors?.fullName}>
        <Input
          id="fullName"
          name="fullName"
          type="text"
          required
          autoComplete="name"
          invalid={!!state.errors?.fullName}
        />
      </FormField>

      <FormField label="Имейл" htmlFor="email" required error={state.errors?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          invalid={!!state.errors?.email}
        />
      </FormField>

      <FormField
        label="Парола"
        htmlFor="password"
        required
        helper="Минимум 12 символа."
        error={state.errors?.password}
      >
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          invalid={!!state.errors?.password}
        />
      </FormField>

      <FormField label="Повторете паролата" htmlFor="passwordConfirm" required>
        <Input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
        />
      </FormField>

      {state.errors?.form && (
        <p className="text-sm text-danger-700">{state.errors.form}</p>
      )}

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Създаване…" : "Създай администратор"}
      </Button>
    </form>
  );
}
