"use client";

import Link from "next/link";
import type { Route } from "next";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ingestForTesting, type IngestState } from "./actions";

const INITIAL: IngestState = {};

function OutcomeCard({ state }: { state: IngestState }) {
  if (state.error) {
    return (
      <div className="rounded-lg bg-danger-50 text-danger-700 p-3 text-sm">
        {state.error}
      </div>
    );
  }
  if (!state.outcome) return null;

  const o = state.outcome;

  if (o.kind === "created") {
    return (
      <div className="rounded-lg bg-success-50 text-success-700 p-3 space-y-1 text-sm">
        <p className="font-medium">Създаден лийд</p>
        <p>
          Match confidence:{" "}
          <span className="font-mono">{o.matchConfidence ?? "—"}</span>
        </p>
        <div className="flex items-center gap-2">
          <Link
            href={`/leads/${o.leadId}` as Route}
            className="underline hover:text-success-500"
          >
            Отвори лийда
          </Link>
          <span className="text-success-500">·</span>
          <Link
            href={`/contacts/${o.contactId}` as Route}
            className="underline hover:text-success-500"
          >
            Отвори контакта
          </Link>
        </div>
      </div>
    );
  }

  if (o.kind === "created_unparsed") {
    return (
      <div className="rounded-lg bg-warning-50 text-warning-800 p-3 space-y-1 text-sm">
        <p className="font-medium">Създаден лийд за триаж (парсването не успя)</p>
        <p>
          Код на грешката: <span className="font-mono">{o.error}</span>
        </p>
        <Link
          href={`/leads/${o.leadId}` as Route}
          className="underline hover:text-warning-800"
        >
          Отвори лийда
        </Link>
      </div>
    );
  }

  if (o.kind === "skipped_duplicate") {
    return (
      <div className="rounded-lg bg-neutral-100 text-neutral-700 p-3 space-y-1 text-sm">
        <p className="font-medium">Пропуснат — дубликат по Message-ID</p>
        <Link
          href={`/leads/${o.existingLeadId}` as Route}
          className="underline hover:text-neutral-900"
        >
          Отвори съществуващия лийд
        </Link>
      </div>
    );
  }

  if (o.kind === "skipped_not_form") {
    return (
      <div className="rounded-lg bg-neutral-100 text-neutral-700 p-3 text-sm">
        Пропуснат — това не е форма (причина:{" "}
        <span className="font-mono">{o.reason}</span>).
      </div>
    );
  }

  return null;
}

export function IngestForm() {
  const [state, formAction, pending] = useActionState(ingestForTesting, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label htmlFor="raw" className="text-sm font-medium text-neutral-700">
        Суров имейл (.eml съдържание — с хедъри и тяло)
      </label>
      <textarea
        id="raw"
        name="raw"
        rows={18}
        spellCheck={false}
        className="block w-full px-3 py-2 rounded-lg bg-neutral-100 text-sm text-neutral-900 font-mono placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120 resize-y"
        placeholder={`Return-Path: <noreply@vminvest.bg>\nFrom: <noreply@vminvest.bg>\nSubject: =?UTF-8?Q?[vminvest.bg]=20...?=\nDate: ...\nMessage-ID: <...>\nContent-Type: multipart/alternative; boundary="..."\n\n--...\nContent-Type: text/plain; charset=UTF-8\n\nПроект:\nДобруджа\n\n...`}
      />
      <div className="flex items-center justify-between">
        <OutcomeCard state={state} />
        <Button type="submit" disabled={pending}>
          {pending ? "Обработка…" : "Пусни през парсъра"}
        </Button>
      </div>
    </form>
  );
}
