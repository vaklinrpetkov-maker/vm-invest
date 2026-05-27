"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { sendInvite, type SendInviteState } from "./actions";

const initialState: SendInviteState = {};

export function InviteForm() {
  const [state, formAction, pending] = useActionState(sendInvite, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col sm:flex-row sm:items-end gap-3 max-w-2xl"
    >
      <FormField
        label="Имейл"
        htmlFor="invite-email"
        required
        error={state.errors?.email}
        className="flex-1"
      >
        <Input
          id="invite-email"
          name="email"
          type="email"
          required
          autoComplete="off"
          placeholder="ime@vminvest.bg"
          invalid={!!state.errors?.email}
        />
      </FormField>

      <FormField label="Роля" htmlFor="invite-role" required error={state.errors?.role}>
        <select
          id="invite-role"
          name="role"
          required
          defaultValue="user"
          className="block h-8 px-3 rounded-lg bg-neutral-100 text-base text-neutral-900 tracking-tight hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120"
        >
          <option value="user">Потребител</option>
          <option value="manager">Мениджър</option>
          <option value="admin">Администратор</option>
        </select>
      </FormField>

      <Button type="submit" disabled={pending}>
        {pending ? "Изпращане…" : "Изпрати покана"}
      </Button>

      {state.errors?.form && (
        <p className="text-sm text-danger-700 sm:ml-2">{state.errors.form}</p>
      )}
      {state.ok && state.message && (
        <p className="text-sm text-success-700 sm:ml-2">{state.message}</p>
      )}
    </form>
  );
}
