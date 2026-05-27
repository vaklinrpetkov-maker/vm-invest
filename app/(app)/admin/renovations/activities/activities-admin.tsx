"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TBody, THead, TH, TR, TD, TableEmpty } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  createActivityTemplateAction,
  updateActivityTemplateAction,
  softDeleteActivityTemplateAction,
  reorderActivityTemplatesAction,
} from "./actions";

type TeamOption = { id: string; name: string; specialty: string | null };

type Row = {
  id: string;
  name: string;
  teamId: string | null;
  teamName: string | null;
  teamSpecialty: string | null;
  peopleRequired: number;
  bathroomMultiplied: boolean;
  durationStudio: number;
  durationTwoRoom: number;
  durationThreeRoom: number;
  durationFourRoom: number;
  sortOrder: number;
};

export function ActivitiesAdmin({
  rows,
  teams,
}: {
  rows: Row[];
  teams: TeamOption[];
}) {
  return (
    <div className="space-y-8">
      <CreateForm teams={teams} />
      <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
        Всички дейности
      </h2>
      <ActivitiesTable rows={rows} teams={teams} />
    </div>
  );
}

function teamLabel(t: TeamOption): string {
  return t.specialty ? `${t.name} (${t.specialty})` : t.name;
}

function CreateForm({ teams }: { teams: TeamOption[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createActivityTemplateAction(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Reset by reloading the form — simpler than tracking 8 controlled
      // inputs locally. The page revalidation already re-renders the table.
      const form = document.getElementById("new-activity-form") as HTMLFormElement | null;
      form?.reset();
    });
  }

  return (
    <form id="new-activity-form" action={submit} className="bg-neutral-0 rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
        Нова дейност
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <label className="text-sm font-medium text-neutral-700">Име *</label>
          <Input name="name" placeholder="напр. Гранитогрес / фаянс — баня" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-neutral-700">Екип</label>
          <select
            name="teamId"
            defaultValue=""
            className="h-8 px-3 rounded-md border border-neutral-300 bg-neutral-0 text-sm"
          >
            <option value="">— Без екип (outsourced) —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{teamLabel(t)}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-neutral-700">Хора *</label>
          <Input name="peopleRequired" type="number" min={0} step={1} defaultValue="0" required />
        </div>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <label className="text-sm font-medium text-neutral-700 inline-flex items-center gap-2">
            <input type="checkbox" name="bathroomMultiplied" className="rounded" />
            <span>Умножава се по броя бани</span>
          </label>
          <span className="text-xs text-neutral-500">
            Когато е отметнато, продължителността при зареждане се умножава по
            броя бани на имота.
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <DurationInput name="durationStudio" label="Едностаен (дни)" />
        <DurationInput name="durationTwoRoom" label="Двустаен (дни)" />
        <DurationInput name="durationThreeRoom" label="Тристаен (дни)" />
        <DurationInput name="durationFourRoom" label="Четиристаен (дни)" />
      </div>

      {error && <div className="text-sm text-danger-700">{error}</div>}
      <Button type="submit" disabled={pending}>
        {pending ? "Запис…" : "Създай дейност"}
      </Button>
    </form>
  );
}

function DurationInput({ name, label }: { name: string; label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-neutral-700">{label}</label>
      <Input name={name} type="number" min={0} step={0.5} defaultValue="0" required />
    </div>
  );
}

function ActivitiesTable({ rows, teams }: { rows: Row[]; teams: TeamOption[] }) {
  return (
    <Table>
      <THead>
        <TR hover={false}>
          <TH>Ред</TH>
          <TH>Дейност</TH>
          <TH>Екип</TH>
          <TH align="right">Хора</TH>
          <TH align="center">× бани</TH>
          <TH align="right">Едн.</TH>
          <TH align="right">Дву.</TH>
          <TH align="right">Три.</TH>
          <TH align="right">Чет.</TH>
          <TH align="right">Действия</TH>
        </TR>
      </THead>
      <TBody>
        {rows.length === 0 && <TableEmpty colSpan={10}>Няма дейности.</TableEmpty>}
        {rows.map((r, idx) => (
          <ActivityRow
            key={r.id}
            row={r}
            teams={teams}
            allIds={rows.map((x) => x.id)}
            index={idx}
          />
        ))}
      </TBody>
    </Table>
  );
}

function ActivityRow({
  row,
  teams,
  allIds,
  index,
}: {
  row: Row;
  teams: TeamOption[];
  allIds: string[];
  index: number;
}) {
  const [name, setName] = useState(row.name);
  const [bathroomMultiplied, setBathroomMultiplied] = useState(row.bathroomMultiplied);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function persist<K extends string>(field: K, value: unknown) {
    startTransition(async () => {
      setErr(null);
      const res = await updateActivityTemplateAction(row.id, { [field]: value } as Parameters<typeof updateActivityTemplateAction>[1]);
      if (!res.ok) setErr(res.error);
    });
  }

  function moveUp() {
    if (index === 0) return;
    const next = [...allIds];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    startTransition(async () => {
      setErr(null);
      const res = await reorderActivityTemplatesAction(next);
      if (!res.ok) setErr(res.error);
    });
  }

  function moveDown() {
    if (index === allIds.length - 1) return;
    const next = [...allIds];
    [next[index + 1], next[index]] = [next[index], next[index + 1]];
    startTransition(async () => {
      setErr(null);
      const res = await reorderActivityTemplatesAction(next);
      if (!res.ok) setErr(res.error);
    });
  }

  function remove() {
    if (!confirm(`Изтрий дейност „${row.name}" от каталога?`)) return;
    startTransition(async () => {
      setErr(null);
      const res = await softDeleteActivityTemplateAction(row.id);
      if (!res.ok) setErr(res.error);
    });
  }

  return (
    <TR>
      <TD muted className="font-mono text-xs">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={moveUp}
            disabled={pending || index === 0}
            className="px-1 text-neutral-500 hover:text-neutral-900 disabled:opacity-30"
            title="Премести нагоре"
          >▲</button>
          <span className="min-w-[2ch] text-right">{row.sortOrder}</span>
          <button
            type="button"
            onClick={moveDown}
            disabled={pending || index === allIds.length - 1}
            className="px-1 text-neutral-500 hover:text-neutral-900 disabled:opacity-30"
            title="Премести надолу"
          >▼</button>
        </div>
      </TD>
      <TD>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== row.name && persist("name", name)}
          disabled={pending}
        />
        {err && <div className="text-xs text-danger-700 mt-1">{err}</div>}
      </TD>
      <TD>
        <select
          value={row.teamId ?? ""}
          onChange={(e) => persist("teamId", e.target.value === "" ? null : e.target.value)}
          disabled={pending}
          className="h-8 px-2 rounded-md border border-neutral-300 bg-neutral-0 text-sm w-full"
        >
          <option value="">— Без екип —</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{teamLabel(t)}</option>
          ))}
        </select>
      </TD>
      <TD align="right">
        <NumberCell value={row.peopleRequired} step={1} onSave={(v) => persist("peopleRequired", v)} disabled={pending} />
      </TD>
      <TD align="center">
        <label className="inline-flex items-center justify-center cursor-pointer">
          <input
            type="checkbox"
            checked={bathroomMultiplied}
            onChange={(e) => {
              setBathroomMultiplied(e.target.checked);
              persist("bathroomMultiplied", e.target.checked);
            }}
            disabled={pending}
            className="rounded"
          />
        </label>
        {bathroomMultiplied && (
          <div className="mt-0.5">
            <StatusBadge tone="info">× бани</StatusBadge>
          </div>
        )}
      </TD>
      <TD align="right">
        <NumberCell value={row.durationStudio} step={0.5} onSave={(v) => persist("durationStudio", v)} disabled={pending} />
      </TD>
      <TD align="right">
        <NumberCell value={row.durationTwoRoom} step={0.5} onSave={(v) => persist("durationTwoRoom", v)} disabled={pending} />
      </TD>
      <TD align="right">
        <NumberCell value={row.durationThreeRoom} step={0.5} onSave={(v) => persist("durationThreeRoom", v)} disabled={pending} />
      </TD>
      <TD align="right">
        <NumberCell value={row.durationFourRoom} step={0.5} onSave={(v) => persist("durationFourRoom", v)} disabled={pending} />
      </TD>
      <TD align="right">
        <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={pending}>
          Изтрий
        </Button>
      </TD>
    </TR>
  );
}

function NumberCell({
  value,
  step,
  onSave,
  disabled,
}: {
  value: number;
  step: number;
  onSave: (v: number) => void;
  disabled?: boolean;
}) {
  const [local, setLocal] = useState(String(value));
  return (
    <Input
      type="number"
      min={0}
      step={step}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const parsed = Number(local);
        if (!Number.isFinite(parsed) || parsed === value) {
          setLocal(String(value));
          return;
        }
        onSave(parsed);
      }}
      disabled={disabled}
      className="text-right max-w-[100px] ml-auto"
    />
  );
}
