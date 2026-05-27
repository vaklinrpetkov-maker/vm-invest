"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { signIn, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormField label="Имейл" htmlFor="email" required>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
        />
      </FormField>

      <FormField label="Парола" htmlFor="password" required>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </FormField>

      {state.error && <p className="text-sm text-danger-700">{state.error}</p>}

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Вход…" : "Вход"}
      </Button>

      <Link
        href="/forgot-password"
        className="text-sm text-neutral-500 hover:text-neutral-700 self-start mt-1"
      >
        Забравена парола?
      </Link>
    </form>
  );
}
