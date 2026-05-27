"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldHelp } from "@/components/ui/field-help";
import { Input } from "@/components/ui/input";
import { Table, TBody, THead, TH, TR, TD, TableEmpty } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  createSectionAction,
  updateSectionAction,
  deleteSectionAction,
} from "./actions";

export type SectionRow = {
  id: string;
  labelBg: string;
  slug: string;
  sortOrder: number;
  active: boolean;
  invoiceCount: number;
};

export function InvoiceSectionsAdmin({ rows }: { rows: SectionRow[] }) {
  return (
    <div className="space-y-8">
      <CreateForm nextSortOrder={Math.max(0, ...rows.map((r) => r.sortOrder)) + 1} />
      <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
        Всички секции
      </h2>
      <SectionsTable rows={rows} />
    </div>
  );
}

function CreateForm({ nextSortOrder }: { nextSortOrder: number }) {
  const [labelBg, setLabelBg] = useState("");
  const [slug, setSlug] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createSectionAction(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLabelBg("");
      setSlug("");
    });
  }

  return (
    <form action={submit} className="bg-neutral-0 rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
        Нова секция
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Име *</label>
            <FieldHelp
              title="Име"
              content={
                <p>
                  Показва се на картичката в /invoices и в табличните изгледи.
                  Може да се преименува по всяко време, без това да засяга
                  вече качените фактури.
                </p>
              }
            />
          </div>
          <Input
            name="labelBg"
            value={labelBg}
            onChange={(e) => setLabelBg(e.target.value)}
            placeholder="напр. Маркетинг"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Системно име *</label>
            <FieldHelp
              title="Системно име"
              content={
                <p>
                  Вътрешен идентификатор — използва се в пътищата към
                  хранилището на файловете. Малки латински букви, цифри, тире
                  или долна черта. След създаване не може да се преименува,
                  защото съществуващите файлове ще се счупят.
                </p>
              }
            />
          </div>
          <Input
            name="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder="напр. marketing"
            required
          />
          <span className="text-xs text-neutral-500">
            Малки латински букви, цифри, тире, долна черта.
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-neutral-700">Подредба</label>
          <Input
            name="sortOrder"
            type="number"
            defaultValue={nextSortOrder}
            min={0}
            max={999}
          />
          <span className="text-xs text-neutral-500">
            По-малките числа са по-вляво.
          </span>
        </div>
      </div>
      {error && <div className="text-sm text-danger-700">{error}</div>}
      <Button type="submit" disabled={pending}>
        {pending ? "Запис…" : "Създай"}
      </Button>
    </form>
  );
}

function SectionsTable({ rows }: { rows: SectionRow[] }) {
  return (
    <div className="space-y-3">
      <Table>
        <THead>
          <TR hover={false}>
            <TH>Системно име</TH>
            <TH>Име</TH>
            <TH align="right">Подредба</TH>
            <TH align="right">Брой фактури</TH>
            <TH>Статус</TH>
            <TH align="right">Действия</TH>
          </TR>
        </THead>
        <TBody>
          {rows.length === 0 && <TableEmpty colSpan={6}>Няма секции.</TableEmpty>}
          {rows.map((r) => (
            <SectionRowView key={r.id} row={r} />
          ))}
        </TBody>
      </Table>
    </div>
  );
}

function SectionRowView({ row }: { row: SectionRow }) {
  const [labelBg, setLabelBg] = useState(row.labelBg);
  const [sortOrder, setSortOrder] = useState(String(row.sortOrder));
  const [active, setActive] = useState(row.active);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function saveLabel(next: string) {
    if (next === row.labelBg) return;
    startTransition(async () => {
      setErr(null);
      const res = await updateSectionAction(row.id, { labelBg: next });
      if (!res.ok) {
        setErr(res.error);
        setLabelBg(row.labelBg);
      }
    });
  }

  function saveSortOrder(next: string) {
    const n = Number.parseInt(next, 10);
    if (!Number.isFinite(n) || n === row.sortOrder) return;
    startTransition(async () => {
      setErr(null);
      const res = await updateSectionAction(row.id, { sortOrder: n });
      if (!res.ok) {
        setErr(res.error);
        setSortOrder(String(row.sortOrder));
      }
    });
  }

  function toggleActive() {
    startTransition(async () => {
      setErr(null);
      const res = await updateSectionAction(row.id, { active: !active });
      if (!res.ok) setErr(res.error);
      else setActive(!active);
    });
  }

  function remove() {
    if (!confirm(`Изтрий секция „${row.labelBg}"?`)) return;
    startTransition(async () => {
      setErr(null);
      const res = await deleteSectionAction(row.id);
      if (!res.ok) setErr(res.error);
    });
  }

  return (
    <TR>
      <TD muted className="font-mono text-sm">
        {row.slug}
      </TD>
      <TD>
        <Input
          value={labelBg}
          onChange={(e) => setLabelBg(e.target.value)}
          onBlur={(e) => saveLabel(e.target.value)}
          disabled={pending}
        />
      </TD>
      <TD align="right">
        <Input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          onBlur={(e) => saveSortOrder(e.target.value)}
          disabled={pending}
          className="w-20 text-right"
        />
      </TD>
      <TD muted numeric>
        {row.invoiceCount}
      </TD>
      <TD>
        <StatusBadge tone={active ? "success" : "neutral"}>
          {active ? "Активна" : "Неактивна"}
        </StatusBadge>
      </TD>
      <TD align="right">
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <Button type="button" variant="ghost" size="sm" onClick={toggleActive} disabled={pending}>
            {active ? "Деактивирай" : "Активирай"}
          </Button>
          {row.invoiceCount === 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={pending}>
              Изтрий
            </Button>
          )}
        </div>
        {err && <div className="text-xs text-danger-700 mt-1">{err}</div>}
      </TD>
    </TR>
  );
}
