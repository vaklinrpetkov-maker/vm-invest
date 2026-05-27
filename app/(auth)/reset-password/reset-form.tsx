"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { setNewPassword, type ResetState } from "./actions";

const initialState: ResetState = {};

export function ResetForm() {
  const [state, formAction, pending] = useActionState(setNewPassword, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormField
        label="Нова парола"
        htmlFor="password"
        required
        helper="Минимум 12 символа."
        error={state.error}
      >
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          autoFocus
          invalid={!!state.error}
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

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Запис…" : "Задайте нова парола"}
      </Button>
    </form>
  );
}
