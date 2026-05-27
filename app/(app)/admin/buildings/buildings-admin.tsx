"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldHelp } from "@/components/ui/field-help";
import { Input } from "@/components/ui/input";
import { Table, TBody, THead, TH, TR, TD, TableEmpty } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  createBuildingAction,
  updateBuildingAction,
  deleteBuildingAction,
} from "./actions";

type Row = {
  id: string;
  storageName: string;
  displayName: string;
  complex: string | null;
  active: boolean;
  propertyCount: number;
};

export function BuildingsAdmin({ rows, complexSuggestions }: { rows: Row[]; complexSuggestions: string[] }) {
  return (
    <div className="space-y-8">
      <CreateForm suggestions={complexSuggestions} />
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
          Всички сгради
        </h2>
        <a href="/api/properties/template" download>
          <Button type="button" variant="ghost" size="sm">
            Свали CSV шаблон
          </Button>
        </a>
      </div>
      <BuildingsTable rows={rows} suggestions={complexSuggestions} />
    </div>
  );
}

function CreateForm({ suggestions }: { suggestions: string[] }) {
  const [storageName, setStorageName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [complex, setComplex] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createBuildingAction(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setStorageName("");
      setDisplayName("");
      setComplex("");
    });
  }

  return (
    <form
      action={submit}
      className="bg-neutral-0 rounded-xl p-5 space-y-4"
    >
      <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
        Нова сграда
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Системно име *</label>
            <FieldHelp
              title="Системно име"
              content={
                <p>
                  Вътрешен идентификатор — използва се в пътищата към файловото
                  хранилище и при CSV импорт. Главни латински/кирилски букви и
                  долна черта, без интервали. След създаване не може да се
                  преименува, защото съществуващите файлове и линкове ще се
                  счупят.
                </p>
              }
            />
          </div>
          <Input
            name="storageName"
            value={storageName}
            onChange={(e) => setStorageName(e.target.value.toUpperCase())}
            placeholder="напр. НОВА_СГРАДА"
            required
          />
          <span className="text-xs text-neutral-500">Главни букви, без интервали.</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Име за показване *</label>
            <FieldHelp
              title="Име за показване"
              content={
                <p>
                  Името, което виждат потребителите — в таблици, филтри и
                  падащи менюта. Може да се преименува по всяко време, без
                  това да засяга вече качените файлове или съществуващите
                  имоти.
                </p>
              }
            />
          </div>
          <Input
            name="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="напр. Нова сграда"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <label className="text-sm font-medium text-neutral-700">Комплекс</label>
            <FieldHelp
              title="Комплекс"
              content={
                <p>
                  По избор — групира няколко свързани сгради под общо име
                  (напр. комплекс „Царевец“ съдържа Сграда А, Б и В).
                  Навигаторът в /properties групира сградите по комплекс,
                  за да се вижда подредено на едно място.
                </p>
              }
            />
          </div>
          <Input
            name="complex"
            value={complex}
            onChange={(e) => setComplex(e.target.value)}
            placeholder="(по избор)"
            list="complex-suggestions"
          />
          <datalist id="complex-suggestions">
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
      </div>
      {error && <div className="text-sm text-danger-700">{error}</div>}
      <Button type="submit" disabled={pending}>
        {pending ? "Запис…" : "Създай"}
      </Button>
    </form>
  );
}

function BuildingsTable({ rows, suggestions }: { rows: Row[]; suggestions: string[] }) {
  return (
    <div className="space-y-3">
      <Table>
        <THead>
          <TR hover={false}>
            <TH>Системно име</TH>
            <TH>Име (показване)</TH>
            <TH>Комплекс</TH>
            <TH align="right">Брой имоти</TH>
            <TH>Статус</TH>
            <TH align="right">Действия</TH>
          </TR>
        </THead>
        <TBody>
          {rows.length === 0 && <TableEmpty colSpan={6}>Няма сгради.</TableEmpty>}
          {rows.map((r) => (
            <BuildingRow key={r.id} row={r} suggestions={suggestions} />
          ))}
        </TBody>
      </Table>
    </div>
  );
}

function BuildingRow({ row, suggestions }: { row: Row; suggestions: string[] }) {
  const [displayName, setDisplayName] = useState(row.displayName);
  const [complex, setComplex] = useState(row.complex ?? "");
  const [active, setActive] = useState(row.active);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  function saveDisplay(next: string) {
    if (next === row.displayName) return;
    startTransition(async () => {
      setErr(null);
      const res = await updateBuildingAction(row.id, { displayName: next });
      if (!res.ok) {
        setErr(res.error);
        setDisplayName(row.displayName);
      }
    });
  }

  function saveComplex(next: string) {
    const norm = next.trim() === "" ? null : next.trim();
    if (norm === row.complex) return;
    startTransition(async () => {
      setErr(null);
      const res = await updateBuildingAction(row.id, { complex: norm });
      if (!res.ok) {
        setErr(res.error);
        setComplex(row.complex ?? "");
      }
    });
  }

  function toggleActive() {
    startTransition(async () => {
      setErr(null);
      const res = await updateBuildingAction(row.id, { active: !active });
      if (!res.ok) {
        setErr(res.error);
      } else {
        setActive(!active);
      }
    });
  }

  function remove() {
    if (!confirm(`Изтрий сграда „${row.displayName}"?`)) return;
    startTransition(async () => {
      setErr(null);
      const res = await deleteBuildingAction(row.id);
      if (!res.ok) setErr(res.error);
    });
  }

  return (
    <TR>
      <TD muted className="font-mono text-sm">{row.storageName}</TD>
      <TD>
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          onBlur={(e) => saveDisplay(e.target.value)}
          disabled={pending}
        />
      </TD>
      <TD>
        <Input
          value={complex}
          onChange={(e) => setComplex(e.target.value)}
          onBlur={(e) => saveComplex(e.target.value)}
          disabled={pending}
          list={`complex-suggestions-${row.id}`}
          placeholder="—"
        />
        <datalist id={`complex-suggestions-${row.id}`}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </TD>
      <TD muted numeric>{row.propertyCount}</TD>
      <TD>
        <StatusBadge tone={active ? "success" : "neutral"}>
          {active ? "Активна" : "Неактивна"}
        </StatusBadge>
      </TD>
      <TD align="right">
        <div className="flex items-center justify-end gap-2 flex-wrap">
          {row.propertyCount > 0 && (
            <a
              href={`/api/properties/export?building=${row.id}`}
              className="text-sm text-neutral-600 hover:text-neutral-900 underline-offset-2 hover:underline"
              title="Изтегли CSV с всички имоти в сградата."
            >
              Експорт
            </a>
          )}
          <button
            type="button"
            onClick={() => setImporting(true)}
            disabled={pending || !active}
            title={
              active
                ? "Качи CSV с имоти — създава нови и обновява съществуващите по име."
                : "Активирай сградата, за да импортираш."
            }
            className="text-sm text-neutral-600 hover:text-neutral-900 underline-offset-2 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Импорт
          </button>
          <Button type="button" variant="ghost" size="sm" onClick={toggleActive} disabled={pending}>
            {active ? "Деактивирай" : "Активирай"}
          </Button>
          {row.propertyCount === 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={pending}>
              Изтрий
            </Button>
          )}
        </div>
        {err && <div className="text-xs text-danger-700 mt-1">{err}</div>}
        {importing && (
          <ImportModal
            building={row}
            onClose={() => setImporting(false)}
          />
        )}
      </TD>
    </TR>
  );
}

// ─── Import modal ─────────────────────────────────────────────────────────

type ImportSuccess = { ok: true; created: number; updated: number; encoding: string };
type ImportFailure = { ok: false; errors: Array<{ csvLine: number; message: string }> };
type ImportResponse = ImportSuccess | ImportFailure;

function ImportModal({ building, onClose }: { building: Row; onClose: () => void }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function submit() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setSubmitError("Избери CSV файл.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("buildingId", building.id);
      const res = await fetch("/api/properties/import", { method: "POST", body: fd });
      const json = (await res.json()) as ImportResponse;
      setResult(json);
      if (json.ok) {
        // Refresh so the row's propertyCount + navigator counts update.
        router.refresh();
      }
    } catch (err) {
      setSubmitError((err as Error).message || "Грешка при качването.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-modal bg-neutral-900/40 flex items-start justify-center pt-20 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="bg-neutral-0 rounded-xl p-6 w-full max-w-lg shadow-popover space-y-4"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium">Импорт на имоти</h2>
            <p className="text-sm text-neutral-600">
              Към сграда <strong>{building.displayName}</strong>. Дублиращи се имена ще обновят
              съществуващите имоти; новите се създават.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-neutral-500 hover:text-neutral-900 transition-colors duration-120 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {!result?.ok && (
          <div className="space-y-3">
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">CSV файл</span>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  setFilename(e.target.files?.[0]?.name ?? null);
                  setSubmitError(null);
                }}
                className="mt-1 block w-full text-sm text-neutral-700 file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-neutral-100 file:text-sm file:font-medium hover:file:bg-neutral-150"
              />
            </label>
            <div className="text-xs text-neutral-500 space-y-1">
              <p>
                Форматът е същият като{" "}
                <a
                  href="/api/properties/template"
                  download
                  className="underline hover:text-neutral-700"
                >
                  шаблона
                </a>
                . Приемаме UTF-8 и Windows-1251. Колоната <code>Сграда</code> е по избор; ако е
                попълнена, трябва да съвпада с избраната.
              </p>
            </div>
            {submitError && <div className="text-sm text-danger-700">{submitError}</div>}
          </div>
        )}

        {result?.ok && (
          <div className="space-y-2 bg-success-50 rounded-lg p-4">
            <p className="text-base text-success-700 font-medium">Импортът е успешен.</p>
            <p className="text-sm text-neutral-700">
              Създадени: <strong>{result.created}</strong>. Обновени: <strong>{result.updated}</strong>.
              Кодиране: <span className="font-mono">{result.encoding}</span>.
            </p>
          </div>
        )}

        {result && !result.ok && result.errors && (
          <div className="space-y-2 bg-danger-50 rounded-lg p-4 max-h-60 overflow-y-auto">
            <p className="text-base text-danger-700 font-medium">
              Импортът е отхвърлен. Открихме {result.errors.length}{" "}
              {result.errors.length === 1 ? "грешка" : "грешки"} — поправи файла и опитай отново.
            </p>
            <ul className="text-sm text-neutral-800 space-y-1">
              {result.errors.map((e, i) => (
                <li key={i}>
                  <span className="font-mono text-neutral-500">ред {e.csvLine}:</span> {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            {result?.ok ? "Затвори" : "Отказ"}
          </Button>
          {!result?.ok && (
            <Button type="button" onClick={submit} disabled={submitting || !filename}>
              {submitting ? "Качване…" : "Качи"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
