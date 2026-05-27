"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { requestPasswordReset, type ForgotState } from "./actions";

const initialState: ForgotState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  if (state.ok) {
    return (
      <div className="space-y-4">
        <p className="text-base text-neutral-700">
          Ако този имейл съществува в системата, ще получите линк за смяна на паролата в следващите минути.
        </p>
        <p className="text-sm text-neutral-500">Линкът е валиден 1 час.</p>
        <Link href="/login" className="text-base text-accent-700 hover:text-accent-800 inline-block">
          Към вход
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormField label="Имейл" htmlFor="email" required>
        <Input id="email" name="email" type="email" required autoComplete="email" autoFocus />
      </FormField>

      {state.error && <p className="text-sm text-danger-700">{state.error}</p>}

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Изпращане…" : "Изпрати линк за нова парола"}
      </Button>

      <Link href="/login" className="text-sm text-neutral-500 hover:text-neutral-700 self-start mt-1">
        Обратно към вход
      </Link>
    </form>
  );
}
