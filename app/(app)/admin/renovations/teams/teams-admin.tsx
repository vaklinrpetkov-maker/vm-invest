"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TBody, THead, TH, TR, TD, TableEmpty } from "@/components/ui/table";
import {
  createTeamAction,
  updateTeamAction,
  softDeleteTeamAction,
} from "./actions";

type Row = {
  id: string;
  name: string;
  specialty: string | null;
  totalPeople: number;
  templateCount: number;
  activityCount: number;
};

export function TeamsAdmin({ rows }: { rows: Row[] }) {
  return (
    <div className="space-y-8">
      <CreateForm />
      <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
        Всички екипи
      </h2>
      <TeamsTable rows={rows} />
    </div>
  );
}

function CreateForm() {
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [totalPeople, setTotalPeople] = useState("0");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createTeamAction(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setName("");
      setSpecialty("");
      setTotalPeople("0");
    });
  }

  return (
    <form action={submit} className="bg-neutral-0 rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
        Нов екип
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-neutral-700">Име *</label>
          <Input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="напр. Team 1"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-neutral-700">Специалност</label>
          <Input
            name="specialty"
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            placeholder="напр. Шпакловка и боя"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-neutral-700">Общо хора *</label>
          <Input
            name="totalPeople"
            type="number"
            min={0}
            step={1}
            value={totalPeople}
            onChange={(e) => setTotalPeople(e.target.value)}
            required
          />
        </div>
      </div>
      {error && <div className="text-sm text-danger-700">{error}</div>}
      <Button type="submit" disabled={pending}>
        {pending ? "Запис…" : "Създай екип"}
      </Button>
    </form>
  );
}

function TeamsTable({ rows }: { rows: Row[] }) {
  return (
    <Table>
      <THead>
        <TR hover={false}>
          <TH>Име</TH>
          <TH>Специалност</TH>
          <TH align="right">Общо хора</TH>
          <TH align="right">Дейности в каталога</TH>
          <TH align="right">Заредени дейности</TH>
          <TH align="right">Действия</TH>
        </TR>
      </THead>
      <TBody>
        {rows.length === 0 && <TableEmpty colSpan={6}>Няма екипи.</TableEmpty>}
        {rows.map((r) => <TeamRow key={r.id} row={r} />)}
      </TBody>
    </Table>
  );
}

function TeamRow({ row }: { row: Row }) {
  const [name, setName] = useState(row.name);
  const [specialty, setSpecialty] = useState(row.specialty ?? "");
  const [totalPeople, setTotalPeople] = useState(String(row.totalPeople));
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function saveName(next: string) {
    if (next === row.name) return;
    startTransition(async () => {
      setErr(null);
      const res = await updateTeamAction(row.id, { name: next });
      if (!res.ok) {
        setErr(res.error);
        setName(row.name);
      }
    });
  }

  function saveSpecialty(next: string) {
    const norm = next.trim() === "" ? null : next.trim();
    if (norm === row.specialty) return;
    startTransition(async () => {
      setErr(null);
      const res = await updateTeamAction(row.id, { specialty: norm });
      if (!res.ok) {
        setErr(res.error);
        setSpecialty(row.specialty ?? "");
      }
    });
  }

  function saveTotalPeople(next: string) {
    const parsed = Number.parseInt(next, 10);
    if (!Number.isFinite(parsed) || parsed === row.totalPeople) {
      setTotalPeople(String(row.totalPeople));
      return;
    }
    startTransition(async () => {
      setErr(null);
      const res = await updateTeamAction(row.id, { totalPeople: parsed });
      if (!res.ok) {
        setErr(res.error);
        setTotalPeople(String(row.totalPeople));
      }
    });
  }

  function remove() {
    const inUse = row.templateCount + row.activityCount;
    const warn = inUse > 0
      ? `Екипът се използва в ${row.templateCount} дейности от каталога и ${row.activityCount} заредени дейности. Те ще запазят препратката си, но екипът ще изчезне от падащите менюта.\n\nПродължи?`
      : `Изтрий екип „${row.name}"?`;
    if (!confirm(warn)) return;
    startTransition(async () => {
      setErr(null);
      const res = await softDeleteTeamAction(row.id);
      if (!res.ok) setErr(res.error);
    });
  }

  return (
    <TR>
      <TD>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={(e) => saveName(e.target.value)}
          disabled={pending}
        />
        {err && <div className="text-xs text-danger-700 mt-1">{err}</div>}
      </TD>
      <TD>
        <Input
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
          onBlur={(e) => saveSpecialty(e.target.value)}
          disabled={pending}
          placeholder="—"
        />
      </TD>
      <TD align="right">
        <Input
          type="number"
          min={0}
          step={1}
          value={totalPeople}
          onChange={(e) => setTotalPeople(e.target.value)}
          onBlur={(e) => saveTotalPeople(e.target.value)}
          disabled={pending}
          className="text-right max-w-[120px] ml-auto"
        />
      </TD>
      <TD muted numeric>{row.templateCount}</TD>
      <TD muted numeric>{row.activityCount}</TD>
      <TD align="right">
        <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={pending}>
          Изтрий
        </Button>
      </TD>
    </TR>
  );
}
