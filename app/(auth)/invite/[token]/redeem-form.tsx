"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { redeemInvite, type RedeemState } from "./actions";

const initialState: RedeemState = {};

export function RedeemForm({ token, email }: { token: string; email: string }) {
  const [state, formAction, pending] = useActionState(redeemInvite, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      <FormField label="Имейл" htmlFor="email">
        <Input id="email" type="email" value={email} readOnly />
      </FormField>

      <FormField
        label="Пълно име"
        htmlFor="fullName"
        required
        error={state.errors?.fullName}
      >
        <Input
          id="fullName"
          name="fullName"
          type="text"
          required
          autoComplete="name"
          invalid={!!state.errors?.fullName}
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

      {state.errors?.form && <p className="text-sm text-danger-700">{state.errors.form}</p>}

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Създаване…" : "Задайте парола и влезте"}
      </Button>
    </form>
  );
}
