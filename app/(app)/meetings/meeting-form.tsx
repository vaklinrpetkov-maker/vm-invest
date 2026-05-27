"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { LeadPicker } from "@/components/ui/lead-picker";
import type { LeadSuggestion } from "@/lib/leads/search";
import {
  DURATION_PRESETS,
  MEETING_TYPE_LABELS,
} from "@/lib/meetings/constants";
import type { MeetingType } from "@prisma/client";

// Shared form for creating + editing a meeting. Creator is always added as an
// assignee on the server side — the multi-select here is for adding others.

export type MeetingFormState = {
  errors?: {
    leadId?: string;
    startsAt?: string;
    duration?: string;
    type?: string;
    assignees?: string;
    form?: string;
  };
};

type Option = { id: string; fullName: string };

type Props = {
  action: (prev: MeetingFormState, formData: FormData) => Promise<MeetingFormState>;
  submitLabel: string;
  pendingLabel: string;
  profiles: Option[]; // active profiles, for assignee picker
  defaultAssigneeId?: string;
  /** Pre-fill from a calendar cell click or a "+ Нова среща" button on a
   *  lead profile. Ignored when `initial` is set. */
  prefill?: { date?: string; hour?: string; lead?: LeadSuggestion };
  initial?: {
    lead: LeadSuggestion;
    startsAt: string; // ISO-like YYYY-MM-DDTHH:MM (local, Europe/Sofia)
    durationMinutes: number;
    type: MeetingType;
    location: string;
    notes: string;
    assigneeIds: string[];
  };
  fixLead?: boolean;
};

const EMPTY: MeetingFormState = {};

const SELECT_CLS =
  "h-8 px-3 rounded-lg bg-neutral-100 text-base text-neutral-900 tracking-tight hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120";

const TEXTAREA_CLS =
  "block w-full px-3 py-2 rounded-lg bg-neutral-100 text-base text-neutral-900 placeholder:text-neutral-400 tracking-tight hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120 resize-y";

const TYPE_KEYS = Object.keys(MEETING_TYPE_LABELS) as MeetingType[];

// "custom" sentinel for the duration dropdown when the user wants to type a value.
const CUSTOM = "custom";

export function MeetingForm({
  action,
  submitLabel,
  pendingLabel,
  profiles,
  defaultAssigneeId,
  prefill,
  initial,
  fixLead,
}: Props) {
  const [state, formAction, pending] = useActionState(action, EMPTY);

  const initialDuration = initial?.durationMinutes ?? 60;
  const initialIsPreset = DURATION_PRESETS.includes(
    initialDuration as (typeof DURATION_PRESETS)[number],
  );
  const [durationPreset, setDurationPreset] = useState<string>(
    initialIsPreset ? String(initialDuration) : CUSTOM,
  );
  const [customDuration, setCustomDuration] = useState<string>(
    initialIsPreset ? "" : String(initialDuration),
  );

  const initialAssignees =
    initial?.assigneeIds ?? (defaultAssigneeId ? [defaultAssigneeId] : []);
  const [assignees, setAssignees] = useState<string[]>(initialAssignees);

  // Split startsAt into date + hour + minute so we control 24h rendering
  // ourselves — the native datetime-local widget follows the OS locale and
  // can't be forced to 24h.
  //
  // Priority: initial (edit mode) > prefill (calendar-cell click) > empty.
  const initialDate = initial?.startsAt.slice(0, 10) ?? prefill?.date ?? "";
  const initialHour = initial?.startsAt.slice(11, 13) ?? prefill?.hour ?? "";
  const initialMinute = initial?.startsAt.slice(14, 16) ?? (prefill?.hour ? "00" : "");
  const [datePart, setDatePart] = useState(initialDate);
  const [hourPart, setHourPart] = useState(initialHour);
  const [minutePart, setMinutePart] = useState(initialMinute);

  const composedStartsAt =
    datePart && hourPart !== "" && minutePart !== ""
      ? `${datePart}T${hourPart}:${minutePart}`
      : "";

  const effectiveDuration =
    durationPreset === CUSTOM ? customDuration : durationPreset;

  const selectAssignees = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(e.target.selectedOptions).map((o) => o.value);
    setAssignees(values);
  };

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-2xl">
      <FormField
        label="Лийд"
        htmlFor="leadId"
        required
        error={state.errors?.leadId}
        helper={
          fixLead ? "Лийдът не може да се сменя след създаване." : undefined
        }
      >
        {fixLead && initial ? (
          <>
            <input type="hidden" name="leadId" value={initial.lead.id} />
            <div className="h-8 px-3 rounded-lg bg-neutral-50 flex items-center gap-2">
              <span className="text-base text-neutral-900 truncate">
                {initial.lead.contactName}
              </span>
              {initial.lead.firstProperty && (
                <span className="text-sm text-neutral-500 truncate">
                  {initial.lead.firstProperty}
                </span>
              )}
            </div>
          </>
        ) : (
          <LeadPicker
            name="leadId"
            required
            initial={initial?.lead ?? prefill?.lead}
          />
        )}
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Дата и час" htmlFor="startsDate" required error={state.errors?.startsAt}>
          <input type="hidden" name="startsAt" value={composedStartsAt} />
          <div className="flex items-center gap-2">
            <Input
              id="startsDate"
              type="date"
              required
              value={datePart}
              onChange={(e) => setDatePart(e.target.value)}
              invalid={!!state.errors?.startsAt}
              className="flex-1"
            />
            <select
              value={hourPart}
              onChange={(e) => setHourPart(e.target.value)}
              required
              className={`${SELECT_CLS} tabular-nums`}
              aria-label="Час"
            >
              <option value="" disabled>
                чч
              </option>
              {Array.from({ length: 24 }, (_, i) => {
                const v = String(i).padStart(2, "0");
                return (
                  <option key={v} value={v}>
                    {v}
                  </option>
                );
              })}
            </select>
            <span className="text-neutral-500">:</span>
            <select
              value={minutePart}
              onChange={(e) => setMinutePart(e.target.value)}
              required
              className={`${SELECT_CLS} tabular-nums`}
              aria-label="Минути"
            >
              <option value="" disabled>
                мм
              </option>
              {(() => {
                const opts = new Set<string>();
                for (let i = 0; i < 12; i++) opts.add(String(i * 5).padStart(2, "0"));
                // Preserve non-5-min initial values (e.g. imported/edited data).
                if (initialMinute) opts.add(initialMinute);
                return [...opts]
                  .sort()
                  .map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ));
              })()}
            </select>
          </div>
        </FormField>

        <FormField label="Продължителност" htmlFor="duration" required error={state.errors?.duration}>
          <div className="flex items-center gap-2">
            <select
              id="duration"
              value={durationPreset}
              onChange={(e) => setDurationPreset(e.target.value)}
              className={SELECT_CLS}
            >
              {DURATION_PRESETS.map((d) => (
                <option key={d} value={String(d)}>
                  {d} мин
                </option>
              ))}
              <option value={CUSTOM}>Друга…</option>
            </select>
            {durationPreset === CUSTOM && (
              <Input
                type="number"
                min={0}
                max={720}
                placeholder="мин"
                value={customDuration}
                onChange={(e) => setCustomDuration(e.target.value)}
                className="w-20"
              />
            )}
          </div>
          <input type="hidden" name="duration" value={effectiveDuration} />
        </FormField>
      </div>

      <FormField
        label="Тип"
        htmlFor="type"
        required
        error={state.errors?.type}
        help={
          <ul className="space-y-1">
            <li>
              <strong>Презентация в офиса</strong> — клиентът идва в офиса.
            </li>
            <li>
              <strong>Презентация на място</strong> — оглед на обект или среща
              на адрес на клиента.
            </li>
            <li>
              <strong>Подписване на договор</strong> — финализиране на сделка.
            </li>
            <li>
              <strong>Последваща среща</strong> — продължение на по-ранен
              разговор.
            </li>
            <li>
              <strong>Друго</strong> — нищо от горните.
            </li>
          </ul>
        }
      >
        <select
          id="type"
          name="type"
          required
          defaultValue={initial?.type ?? "other"}
          className={SELECT_CLS}
        >
          {TYPE_KEYS.map((t) => (
            <option key={t} value={t}>
              {MEETING_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </FormField>

      <FormField
        label="Локация"
        htmlFor="location"
        helper="Адрес, сграда или „в офиса“. Незадължително."
      >
        <Input
          id="location"
          name="location"
          type="text"
          autoComplete="off"
          defaultValue={initial?.location ?? ""}
        />
      </FormField>

      <FormField
        label="Участници"
        htmlFor="assignees"
        required
        error={state.errors?.assignees}
        helper="Задръжте Ctrl (Cmd на Mac) за избор на няколко. Поне един е задължителен."
      >
        <select
          id="assignees"
          name="assignees"
          multiple
          size={6}
          value={assignees}
          onChange={selectAssignees}
          className="block w-full px-3 py-2 rounded-lg bg-neutral-100 text-base text-neutral-900 tracking-tight focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120"
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Бележки" htmlFor="notes">
        <textarea
          id="notes"
          name="notes"
          rows={4}
          defaultValue={initial?.notes ?? ""}
          className={TEXTAREA_CLS}
          placeholder="Какво беше обсъдено, какво следва, контекст за екипа…"
        />
      </FormField>

      {state.errors?.form && <p className="text-sm text-danger-700">{state.errors.form}</p>}

      <Button type="submit" disabled={pending} className="mt-2 self-start">
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
