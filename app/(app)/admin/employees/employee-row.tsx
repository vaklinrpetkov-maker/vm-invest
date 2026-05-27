"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { TR, TD } from "@/components/ui/table";
import { updateEmployee, type UpdateEmployeeResult } from "./actions";

type Option = { id: string; fullName: string };

type Props = {
  employee: {
    id: string;
    fullName: string;
    email: string;
    managerId: string | null;
    annualDays: string;
    carryoverDays: string;
    hireDate: string | null; // ISO YYYY-MM-DD or null
  };
  candidates: Option[];
};

function toIsoDate(d: Date | string | null): string {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export function EmployeeRow({ employee, candidates }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [managerId, setManagerId] = useState(employee.managerId ?? "");
  const [annualDays, setAnnualDays] = useState(employee.annualDays);
  const [carryoverDays, setCarryoverDays] = useState(employee.carryoverDays);
  const [hireDate, setHireDate] = useState(toIsoDate(employee.hireDate));

  const dirty =
    managerId !== (employee.managerId ?? "") ||
    annualDays !== employee.annualDays ||
    carryoverDays !== employee.carryoverDays ||
    hireDate !== toIsoDate(employee.hireDate);

  const save = () => {
    const fd = new FormData();
    fd.set("employeeId", employee.id);
    fd.set("managerId", managerId);
    fd.set("annualDays", annualDays);
    fd.set("carryoverDays", carryoverDays);
    fd.set("hireDate", hireDate);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result: UpdateEmployeeResult = await updateEmployee(fd);
      if (result.ok) {
        setSaved(true);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <TR>
      <TD>
        <div className="text-neutral-900">{employee.fullName}</div>
        <div className="text-sm text-neutral-500">{employee.email}</div>
      </TD>
      <TD>
        <select
          value={managerId}
          onChange={(e) => setManagerId(e.target.value)}
          disabled={pending}
          className="h-7 w-full px-2.5 rounded-md bg-neutral-100 text-base text-neutral-900 hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40 disabled:bg-neutral-50 disabled:text-neutral-400 transition-colors duration-120"
        >
          <option value="">— няма —</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.fullName}
            </option>
          ))}
        </select>
      </TD>
      <TD>
        <input
          type="number"
          min={0}
          max={60}
          step={0.5}
          value={annualDays}
          onChange={(e) => setAnnualDays(e.target.value)}
          disabled={pending}
          className="h-7 w-20 px-2.5 rounded-md bg-neutral-100 text-right text-base text-neutral-900 tabular-nums hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40 disabled:bg-neutral-50 disabled:text-neutral-400 transition-colors duration-120"
        />
      </TD>
      <TD>
        <input
          type="number"
          min={0}
          max={10}
          step={0.5}
          value={carryoverDays}
          onChange={(e) => setCarryoverDays(e.target.value)}
          disabled={pending}
          className="h-7 w-20 px-2.5 rounded-md bg-neutral-100 text-right text-base text-neutral-900 tabular-nums hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40 disabled:bg-neutral-50 disabled:text-neutral-400 transition-colors duration-120"
        />
      </TD>
      <TD>
        <input
          type="date"
          value={hireDate}
          onChange={(e) => setHireDate(e.target.value)}
          disabled={pending}
          className="h-7 px-2.5 rounded-md bg-neutral-100 text-base text-neutral-900 tabular-nums hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40 disabled:bg-neutral-50 disabled:text-neutral-400 transition-colors duration-120"
        />
      </TD>
      <TD align="right">
        <div className="flex items-center justify-end gap-2">
          {error && <span className="text-sm text-danger-700">{error}</span>}
          {saved && !dirty && <span className="text-sm text-success-700">Запазено</span>}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending || !dirty}
            onClick={save}
          >
            {pending ? "Запис…" : "Запази"}
          </Button>
        </div>
      </TD>
    </TR>
  );
}
