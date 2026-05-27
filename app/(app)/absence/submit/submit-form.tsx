"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { countWorkingDays } from "@/lib/absence/working-days";
import { submitAbsence, type SubmitState } from "./actions";

type Category = {
  code: string;
  labelBg: string;
  allowsHalfDay: boolean;
  requiresDocument: boolean;
};

const initialState: SubmitState = {};

export function SubmitForm({ categories }: { categories: Category[] }) {
  const [state, formAction, pending] = useActionState(submitAbsence, initialState);
  const [categoryCode, setCategoryCode] = useState(categories[0]?.code ?? "PAID");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startHalf, setStartHalf] = useState(false);
  const [endHalf, setEndHalf] = useState(false);

  const category = categories.find((c) => c.code === categoryCode);
  const allowsHalfDay = category?.allowsHalfDay ?? false;

  const workingDays = useMemo(() => {
    if (!startDate || !endDate) return null;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    return countWorkingDays({
      start,
      end,
      startHalf: allowsHalfDay && startHalf,
      endHalf: allowsHalfDay && endHalf,
    });
  }, [startDate, endDate, startHalf, endHalf, allowsHalfDay]);

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-lg">
      <FormField
        label="Тип отсъствие"
        htmlFor="categoryCode"
        required
        error={state.errors?.categoryCode}
        help={
          <p>
            Категорията определя как се отчита заявката — платен годишен,
            болничен, неплатен, обучение, друго. Само платеният годишен
            намалява баланса горе на страницата; болничният изисква документ;
            неплатеният не намалява нищо, но се записва в календара. Питай
            мениджъра си ако не си сигурен коя да избереш.
          </p>
        }
      >
        <select
          id="categoryCode"
          name="categoryCode"
          required
          value={categoryCode}
          onChange={(e) => setCategoryCode(e.target.value)}
          className="h-8 px-3 rounded-lg bg-neutral-100 text-base text-neutral-900 tracking-tight hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120"
        >
          {categories.map((c) => (
            <option key={c.code} value={c.code}>
              {c.labelBg}
            </option>
          ))}
        </select>
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="От дата" htmlFor="startDate" required error={state.errors?.startDate}>
          <Input
            id="startDate"
            name="startDate"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </FormField>
        <FormField label="До дата" htmlFor="endDate" required error={state.errors?.endDate}>
          <Input
            id="endDate"
            name="endDate"
            type="date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </FormField>
      </div>

      {allowsHalfDay && (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-base text-neutral-700">
            <input
              type="checkbox"
              name="startHalf"
              checked={startHalf}
              onChange={(e) => setStartHalf(e.target.checked)}
              className="h-4 w-4 rounded-sm bg-neutral-100 checked:bg-neutral-900 hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120"
            />
            Половин ден (първи ден)
          </label>
          <label className="flex items-center gap-2 text-base text-neutral-700">
            <input
              type="checkbox"
              name="endHalf"
              checked={endHalf}
              onChange={(e) => setEndHalf(e.target.checked)}
              className="h-4 w-4 rounded-sm bg-neutral-100 checked:bg-neutral-900 hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120"
            />
            Половин ден (последен ден)
          </label>
        </div>
      )}

      <FormField
        label="Бележки"
        htmlFor="notes"
        helper="Незадължително. Кратко обяснение за одобряващия."
      >
        <textarea
          id="notes"
          name="notes"
          rows={3}
          className="block w-full px-3 py-2 rounded-lg bg-neutral-100 text-base text-neutral-900 placeholder:text-neutral-400 tracking-tight hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120 resize-y"
        />
      </FormField>

      {workingDays !== null && (
        <div className="rounded-lg bg-neutral-100 px-3 py-2.5 text-base text-neutral-700">
          Работни дни:{" "}
          <span className="font-medium text-neutral-900 tabular-nums">{workingDays}</span>
          <span className="text-neutral-500 text-sm ml-2">
            (изчислено локално, окончателно се потвърждава от сървъра)
          </span>
        </div>
      )}

      {state.errors?.form && <p className="text-sm text-danger-700">{state.errors.form}</p>}

      {category?.requiresDocument && (
        <p className="text-sm text-neutral-500">
          Качването на документ (снимка на подписана бланка) ще е налично в следваща версия.
        </p>
      )}

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Изпращане…" : "Изпрати заявка"}
      </Button>
    </form>
  );
}
