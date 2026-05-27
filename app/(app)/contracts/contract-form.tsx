"use client";

// Shared form for creating + editing a contract (Phase A — manual flow).
// Reused by /contracts/new and /contracts/[id]/edit. The action prop comes
// pre-bound on the page side (createContract or updateContract.bind(null, id)).
//
// Layout follows the existing form conventions in the app:
//   - Top section: identity (title, buyer, contact picker)
//   - Properties multi-picker
//   - Context fields (building, salesperson, type, composition, pre/post,
//     uses credit)
//   - Money (total due)
//   - Lifecycle (status, signed_at, reminder)
//
// Bulgarian labels everywhere, errors surfaced from server-side validation
// via useActionState. Pickers are client-only — they need typeahead state.

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { formatEUR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ContactPicker } from "@/components/ui/contact-picker";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PropertyMultiPicker } from "@/components/ui/property-multi-picker";
import { useToast } from "@/components/ui/toast";
import { UserPicker } from "@/components/ui/user-picker";
import type { ContactSuggestion } from "@/lib/contacts/search";
import type { ProfileSuggestion } from "@/lib/profiles/search";
import { uploadContractAttachment } from "./attachment-actions";
import {
  CONTRACT_STATUSES,
  CONTRACT_STATUS_LABELS,
  CONTRACT_TYPES,
  CONTRACT_TYPE_LABELS,
  type ContractStatus,
  type ContractType,
} from "@/lib/contracts/constants";
import type { ContractFormState } from "@/lib/contracts/parse";
import type { PropertySuggestion } from "@/lib/properties/search";

export type ContractFormInitial = {
  title: string;
  buyerFullName: string;
  contact: ContactSuggestion | null;
  // Consultant on the deal — a Profile FK. Picker shows active users; the
  // form initial supplies the currently-assigned profile so the edit form
  // can pre-fill the picker. `null` means unassigned.
  salesperson: ProfileSuggestion | null;
  building: string;
  contractType: ContractType;
  compositionStatus: string;
  usesCredit: boolean;
  totalDueEur: string; // pre-formatted decimal as string for the input
  status: ContractStatus;
  signedAtIso: string;
  reminderDateIso: string;
  properties: PropertySuggestion[];
  // Initial percentage breakdown for the milestone-payment section. Edit
  // pages back-compute these from existing `ContractPayment.dueEur /
  // totalDueEur`; the create page passes all-empty strings. Strings (not
  // numbers) so blank stays blank in the input rather than rendering "0".
  paymentPercents: [string, string, string, string];
};

type Props = {
  action: (prev: ContractFormState, formData: FormData) => Promise<ContractFormState>;
  initial: ContractFormInitial;
  submitLabel: string;
  pendingLabel: string;
  // "create" mode shows a Files section where the user can stage uploads
  // up-front (so they don't have to make two trips through the UI to
  // create + attach). "edit" mode hides it — files on existing contracts
  // are added/removed from the detail page's Files section.
  mode: "create" | "edit";
};

const EMPTY_STATE: ContractFormState = {};

const COMPOSITION_OPTIONS = ["", "А", "А+Г/ПМ", "А+ПМ"] as const;

const SELECT_CLS =
  "h-9 px-3 rounded-lg bg-neutral-100 text-base text-neutral-900 tracking-tight hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-colors duration-120";

// Per-file ceiling matches the server-side check in attachment-actions.ts.
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export function ContractForm({ action, initial, submitLabel, pendingLabel, mode }: Props) {
  const [state, formAction, pending] = useActionState(action, EMPTY_STATE);
  const router = useRouter();
  const { error: toastError, success: toastSuccess } = useToast();

  // Files staged in the create flow. Empty in edit mode (the section isn't
  // rendered) but still declared so hooks stay consistent.
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const navigatedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // `totalDueEur` becomes a controlled input so the payment-breakdown
  // section below can react to it in real time. Percents are 4 separate
  // strings (not numbers) so blank inputs stay visibly blank instead of
  // rendering as 0.
  const [totalDueEur, setTotalDueEur] = useState(initial.totalDueEur);
  const [percents, setPercents] = useState<[string, string, string, string]>(
    initial.paymentPercents,
  );

  function addFiles(picked: FileList | null) {
    if (!picked) return;
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const f of Array.from(picked)) {
      if (f.size > MAX_FILE_BYTES) {
        rejected.push(`${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)`);
        continue;
      }
      accepted.push(f);
    }
    if (rejected.length > 0) {
      toastError(`Файлове над 25 MB: ${rejected.join(", ")}`);
    }
    if (accepted.length > 0) {
      setStagedFiles((prev) => [...prev, ...accepted]);
    }
    // Clear the input so the same file can be re-picked after a remove.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeStaged(idx: number) {
    setStagedFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  // After a successful create: upload staged files one by one, then navigate.
  // navigatedRef guards against double-fires in dev (StrictMode) or when the
  // effect re-runs.
  useEffect(() => {
    const newId = state.createdContractId;
    if (!newId || navigatedRef.current) return;
    navigatedRef.current = true;
    // Stash as a string-typed const so TS keeps the narrowed type through
    // the inner async function's closure.
    const contractId: string = newId;

    async function uploadThenNavigate() {
      if (stagedFiles.length === 0) {
        router.push(`/contracts/${contractId}`);
        return;
      }
      setUploadProgress({ current: 0, total: stagedFiles.length });
      let okCount = 0;
      const failures: string[] = [];
      for (let i = 0; i < stagedFiles.length; i++) {
        const file = stagedFiles[i];
        setUploadProgress({ current: i + 1, total: stagedFiles.length });
        const fd = new FormData();
        fd.append("contractId", contractId);
        fd.append("file", file);
        try {
          const res = await uploadContractAttachment(fd);
          if (res.ok) okCount++;
          else failures.push(`${file.name}: ${res.error}`);
        } catch (err) {
          failures.push(`${file.name}: ${(err as Error).message ?? "грешка"}`);
        }
      }
      setUploadProgress(null);
      if (okCount > 0) {
        toastSuccess(okCount === 1 ? "Файлът беше качен." : `Качени са ${okCount} файла.`);
      }
      if (failures.length > 0) {
        toastError(
          failures.length === 1
            ? `Неуспешно качване — ${failures[0]}`
            : `${failures.length} файла не са качени. Може да опитате отново от страницата на договора.`,
        );
      }
      router.push(`/contracts/${contractId}`);
    }

    void uploadThenNavigate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.createdContractId]);

  // True while either the form action OR the file uploads are running.
  const busy = pending || uploadProgress !== null;

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-3xl">
      {state.errors?.form && (
        <div className="bg-danger-50 text-danger-700 text-sm rounded-lg px-3 py-2">
          {state.errors.form}
        </div>
      )}

      <section className="bg-neutral-0 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
          Основни данни
        </h2>

        <FormField
          label="Заглавие"
          htmlFor="title"
          required
          error={state.errors?.title}
          helper="Кратко описание — например: Людмил Икономов-Царевец-ап.27, вх.А и гараж 18 и 19."
        >
          <Input
            id="title"
            name="title"
            type="text"
            defaultValue={initial.title}
            maxLength={200}
            required
            invalid={!!state.errors?.title}
          />
        </FormField>

        <FormField
          label="Купувач (име по договор)"
          htmlFor="buyerFullName"
          required
          error={state.errors?.buyerFullName}
          helper="Името, както трябва да фигурира в договора. Не се попълва автоматично от свързания контакт."
        >
          <Input
            id="buyerFullName"
            name="buyerFullName"
            type="text"
            defaultValue={initial.buyerFullName}
            required
            invalid={!!state.errors?.buyerFullName}
          />
        </FormField>

        <FormField
          label="Свържи контакт"
          htmlFor="contactId"
          error={state.errors?.contactId}
          helper="По избор — за навигация в CRM. Не променя името на купувача в договора."
        >
          <ContactPicker name="contactId" initial={initial.contact} />
        </FormField>
      </section>

      <section className="bg-neutral-0 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
          Имоти по договора
        </h2>
        <FormField
          label="Имоти"
          htmlFor="propertyIds"
          required
          error={state.errors?.propertyIds}
          helper="Един договор може да обхваща няколко имота (апартамент + паркомясто + склад)."
        >
          <PropertyMultiPicker name="propertyIds" initial={initial.properties} required />
        </FormField>
      </section>

      <section className="bg-neutral-0 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
          Контекст
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            label="Сграда"
            htmlFor="building"
            helper="Свободен текст. Често се извлича от имотите."
          >
            <Input
              id="building"
              name="building"
              type="text"
              defaultValue={initial.building}
              placeholder="напр. Царевец"
            />
          </FormField>

          <FormField
            label="Консултант на сделката"
            htmlFor="salespersonId"
            error={state.errors?.salespersonId}
            helper="Член на екипа, отговорен за сделката. Използва се за изгледи като Моите договори."
          >
            <UserPicker name="salespersonId" initial={initial.salesperson} />
          </FormField>

          <FormField label="Тип на договора" htmlFor="contractType" required error={state.errors?.contractType}>
            <select
              id="contractType"
              name="contractType"
              defaultValue={initial.contractType}
              className={SELECT_CLS}
            >
              {CONTRACT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CONTRACT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Състав" htmlFor="compositionStatus" helper="Структура на имотите по договора.">
            <select
              id="compositionStatus"
              name="compositionStatus"
              defaultValue={initial.compositionStatus}
              className={SELECT_CLS}
            >
              {COMPOSITION_OPTIONS.map((c) => (
                <option key={c || "empty"} value={c}>
                  {c === "" ? "— Без избор —" : c}
                </option>
              ))}
            </select>
          </FormField>

          {/* "Преди / След" (completion) dropdown removed — the system now
              ships well past Акт 16, so the value defaults to "След" server-
              side. The schema field stays for legacy/imported contracts. */}

          <FormField label="Кредит" htmlFor="usesCredit">
            <label className="flex items-center gap-2 text-base text-neutral-900 h-9">
              <input
                id="usesCredit"
                name="usesCredit"
                type="checkbox"
                defaultChecked={initial.usesCredit}
                className="h-4 w-4 rounded-sm bg-neutral-100 checked:bg-neutral-900 hover:bg-neutral-150 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
              />
              Купувачът ползва кредит
            </label>
          </FormField>
        </div>
      </section>

      <section className="bg-neutral-0 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
          Сума
        </h2>
        <FormField
          label="Обща стойност (EUR)"
          htmlFor="totalDueEur"
          required
          error={state.errors?.totalDueEur}
          helper="Платените и оставащите се пресмятат от модул Плащания."
        >
          <Input
            id="totalDueEur"
            name="totalDueEur"
            type="text"
            inputMode="decimal"
            value={totalDueEur}
            onChange={(e) => setTotalDueEur(e.target.value)}
            placeholder="0.00"
            className="text-right tabular-nums max-w-48"
            required
            invalid={!!state.errors?.totalDueEur}
          />
        </FormField>
      </section>

      <PaymentBreakdownSection
        totalDueEur={totalDueEur}
        percents={percents}
        onChange={(idx, value) =>
          setPercents((prev) => {
            const next = [...prev] as [string, string, string, string];
            next[idx] = value;
            return next;
          })
        }
        error={state.errors?.paymentPercents}
      />

      <section className="bg-neutral-0 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
          Статус
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label="Статус" htmlFor="status" required error={state.errors?.status}>
            <select id="status" name="status" defaultValue={initial.status} className={SELECT_CLS}>
              {CONTRACT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CONTRACT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            label="Дата на подписване"
            htmlFor="signedAt"
            error={state.errors?.signedAt}
            helper={state.warnings?.signedAt}
          >
            <Input
              id="signedAt"
              name="signedAt"
              type="date"
              defaultValue={initial.signedAtIso}
              invalid={!!state.errors?.signedAt}
            />
          </FormField>

          <FormField
            label="Дата напомняне"
            htmlFor="reminderDate"
            error={state.errors?.reminderDate}
            helper="По избор — за бъдещ преглед."
          >
            <Input
              id="reminderDate"
              name="reminderDate"
              type="date"
              defaultValue={initial.reminderDateIso}
            />
          </FormField>
        </div>
      </section>

      {/* Staged-files section — create mode only. Files picked here are
          uploaded after the contract row lands, so the user finishes the
          create flow in one pass instead of two trips through the UI. On
          edit, files are managed from the detail page's Files section. */}
      {mode === "create" && (
        <section className="bg-neutral-0 rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
            Файлове
          </h2>
          <p className="text-sm text-neutral-500">
            По избор — прикачи договорни документи и приложения. Допълнителни
            файлове могат да се качват и след създаване на договора.
          </p>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={(e) => addFiles(e.target.files)}
              className="block text-sm text-neutral-700 file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-neutral-100 file:text-sm file:font-medium hover:file:bg-neutral-150 file:cursor-pointer"
              disabled={busy}
            />
            <p className="text-xs text-neutral-500 mt-1.5">
              Максимум 25 MB на файл. Поддържат се всички формати.
            </p>
          </div>

          {stagedFiles.length > 0 && (
            <ul className="space-y-1.5">
              {stagedFiles.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-neutral-50 text-sm"
                >
                  <span className="flex-1 truncate text-neutral-900" title={f.name}>
                    {f.name}
                  </span>
                  <span className="text-neutral-500 tabular-nums text-xs">
                    {(f.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                  <button
                    type="button"
                    onClick={() => removeStaged(i)}
                    disabled={busy}
                    className="text-neutral-400 hover:text-danger-700 transition-colors duration-120 disabled:opacity-50"
                    aria-label={`Премахни ${f.name}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={busy}>
          {uploadProgress
            ? `Качване на файл ${uploadProgress.current}/${uploadProgress.total}…`
            : pending
              ? pendingLabel
              : submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ─── Payment breakdown section ───────────────────────────────────────────

const MILESTONE_LABELS: [string, string, string, string] = [
  "ПД (Подписване)",
  "Акт 14",
  "Акт 15",
  "Акт 16",
];

function PaymentBreakdownSection({
  totalDueEur,
  percents,
  onChange,
  error,
}: {
  totalDueEur: string;
  percents: [string, string, string, string];
  onChange: (idx: number, value: string) => void;
  error: string | undefined;
}) {
  // Parse the total once. Treat any non-numeric input as 0 for the
  // live-preview math — the rendered amounts will be 0 and the user sees
  // them update as they fix the total.
  const totalNum = parseLocaleNumber(totalDueEur) ?? 0;

  const pctNums = percents.map(parseLocaleNumber);
  const anyFilled = pctNums.some((p) => p !== null);
  const sumPct: number = pctNums.reduce<number>((acc, p) => acc + (p ?? 0), 0);
  const sumIsHundred = Math.abs(sumPct - 100) < 0.001;

  // Compute amounts for the live preview. Same algorithm as the server-
  // side `amountsFromPercents` so what the user sees is exactly what gets
  // written: when the sum is 100, last slot absorbs rounding; otherwise
  // each slot is independent.
  const amounts: [number | null, number | null, number | null, number | null] = anyFilled
    ? (() => {
        const pcts = pctNums.map((p) => p ?? 0) as [number, number, number, number];
        if (sumIsHundred) {
          const a1 = round2(pcts[0] * totalNum / 100);
          const a2 = round2(pcts[1] * totalNum / 100);
          const a3 = round2(pcts[2] * totalNum / 100);
          const a4 = round2(totalNum - a1 - a2 - a3);
          return [a1, a2, a3, a4];
        }
        return [
          round2(pcts[0] * totalNum / 100),
          round2(pcts[1] * totalNum / 100),
          round2(pcts[2] * totalNum / 100),
          round2(pcts[3] * totalNum / 100),
        ];
      })()
    : [null, null, null, null];

  const amountsSum: number = amounts.reduce<number>((acc, a) => acc + (a ?? 0), 0);

  return (
    <section className="bg-neutral-0 rounded-lg p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
          Разпределение по вноски
          <span className="ml-2 text-xs text-neutral-500 normal-case font-normal">
            по избор
          </span>
        </h2>
      </div>
      <p className="text-sm text-neutral-500">
        Въведете процента от общата сума за всяка вноска — сумата в евро се
        пресмята автоматично. Може да оставите празно, ако още не сте
        решили разпределението.
      </p>

      {error && (
        <div className="bg-danger-50 text-danger-700 text-sm rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="space-y-1">
        {/* Header row */}
        <div className="hidden md:grid md:grid-cols-[1fr_120px_180px] gap-3 text-xs text-neutral-500 px-2 pb-1">
          <span>Вноска</span>
          <span className="text-right">%</span>
          <span className="text-right">Сума (EUR)</span>
        </div>
        {MILESTONE_LABELS.map((label, i) => (
          <div
            key={i}
            className="grid grid-cols-1 md:grid-cols-[1fr_120px_180px] gap-3 items-center px-2 py-1.5 rounded-md hover:bg-neutral-50"
          >
            <label htmlFor={`paymentPct${i + 1}`} className="text-base text-neutral-900">
              {label}
            </label>
            <Input
              id={`paymentPct${i + 1}`}
              name={`paymentPct${i + 1}`}
              type="text"
              inputMode="decimal"
              value={percents[i]}
              onChange={(e) => onChange(i, e.target.value)}
              placeholder="0"
              className="text-right tabular-nums"
            />
            <span className="text-right tabular-nums text-neutral-900">
              {amounts[i] === null ? (
                <span className="text-neutral-300">—</span>
              ) : (
                formatEUR(amounts[i] as number)
              )}
            </span>
          </div>
        ))}
        {/* Totals row */}
        {anyFilled && (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_180px] gap-3 items-center px-2 pt-2 mt-1 border-t border-neutral-150 text-sm">
            <span className="font-medium text-neutral-700">Общо</span>
            <span
              className={cn(
                "text-right tabular-nums",
                sumIsHundred ? "text-success-700" : "text-warning-800",
              )}
              title={
                sumIsHundred
                  ? "Сборът на процентите е точно 100%."
                  : "Сборът на процентите не е 100% — записът все пак е разрешен."
              }
            >
              {sumPct.toFixed(2)}% {sumIsHundred ? "✓" : "⚠"}
            </span>
            <span className="text-right tabular-nums text-neutral-900">
              {formatEUR(amountsSum)}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

// Parse a locale-tolerant number string (BG comma decimals OR ASCII dots).
// Returns null for blank or non-numeric inputs.
function parseLocaleNumber(raw: string): number | null {
  const s = raw.trim();
  if (s.length === 0) return null;
  const cleaned = s.replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
