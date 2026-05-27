import { Prisma } from "@prisma/client";
import {
  CONTRACT_STATUSES,
  CONTRACT_TYPES,
  type ContractStatus,
  type ContractType,
} from "./constants";

// Form-data parser + validator for contract create + update. Mirrors the
// shape of lib/properties/parse.ts (discriminated union of ok/err with
// per-field error messages in Bulgarian). The server actions call this and
// return the resulting form-state to the client for re-render with errors.
//
// Scope is the manual create/edit form. Template-driven document
// generation is explicitly out of scope (see specs/contracts.md §11) —
// users prepare contract documents externally and upload them to the
// contract record via the file cell on the detail page.

export type ContractPatch = {
  title: string;
  buyerFullName: string;
  contactId: string | null;
  // FK to Profile. Hard requirement going forward — the picker enforces
  // it client-side and the action validates server-side. The legacy
  // free-text `salesperson` column on Contract is mirrored from the FK's
  // fullName in the action layer so existing text-search filters keep
  // working on rows created via the new form.
  salespersonId: string | null;
  // Optional milestone-payment breakdown as percentages — 4 entries for
  // [ПД, Акт 14, Акт 15, Акт 16]. `null` per slot means "user left it
  // blank in the form". If every slot is null, the action layer skips
  // creating/updating ContractPayment rows entirely (preserves existing
  // payment data on edit, creates no rows on a fresh contract). If at
  // least one slot is filled, the action computes amounts and upserts
  // 4 ContractPayment rows. Per-slot validation: 0-100 inclusive.
  paymentPercents: [number | null, number | null, number | null, number | null];
  building: string | null;
  contractType: ContractType;
  compositionStatus: string | null;
  preOrPost: string | null;
  usesCredit: boolean;
  totalDueEur: Prisma.Decimal;
  status: ContractStatus;
  signedAt: Date | null;
  reminderDate: Date | null;
  // Property ids — many-to-many on save.
  propertyIds: string[];
};

type FieldKey =
  | "title"
  | "buyerFullName"
  | "contactId"
  | "salespersonId"
  | "totalDueEur"
  | "status"
  | "contractType"
  | "signedAt"
  | "reminderDate"
  | "propertyIds"
  | "paymentPercents"
  | "form";

export type ContractFormState = {
  errors?: Partial<Record<FieldKey, string>>;
  warnings?: Partial<Record<FieldKey, string>>;
  // Set by `createContract` on success — the client form uses this to
  // upload any files staged in the create flow (the file picker on
  // /contracts/new) and then navigate to the new contract's detail page.
  // `updateContract` doesn't set this — it redirects directly because
  // files on existing contracts are managed from the detail page.
  createdContractId?: string;
};

type ParseResult =
  | { ok: true; data: ContractPatch; warnings: ContractFormState["warnings"] }
  | { ok: false; errors: ContractFormState["errors"]; warnings: ContractFormState["warnings"] };

function trimOrNull(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

function parseDate(v: FormDataEntryValue | null): Date | null {
  const s = trimOrNull(v);
  if (s === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T00:00:00Z`);
}

function parseDecimal(v: FormDataEntryValue | null): Prisma.Decimal | null {
  const s = trimOrNull(v);
  if (s === null) return null;
  // Accept both "12 500,50" (BG locale) and "12500.50". Normalize commas
  // → dots and strip spaces before parsing.
  const cleaned = s.replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return new Prisma.Decimal(cleaned);
}

// Parse a single percentage entry. Returns:
//   - `null` for blank input (user left this slot empty)
//   - the numeric value for a valid number (clamped to [0, 100] range gate
//     handled by the caller)
//   - the special string `"INVALID"` for non-numeric input
type ParsedPercent = number | null | "INVALID";

function parsePercent(v: FormDataEntryValue | null): ParsedPercent {
  const s = trimOrNull(v);
  if (s === null) return null;
  const cleaned = s.replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return "INVALID";
  return n;
}

function parsePaymentPercents(
  formData: FormData,
): {
  values: [number | null, number | null, number | null, number | null];
  hasInvalid: boolean;
  hasOutOfRange: boolean;
} {
  const values: [number | null, number | null, number | null, number | null] = [
    null,
    null,
    null,
    null,
  ];
  let hasInvalid = false;
  let hasOutOfRange = false;
  for (let i = 0; i < 4; i++) {
    const raw = parsePercent(formData.get(`paymentPct${i + 1}`));
    if (raw === "INVALID") {
      hasInvalid = true;
      continue;
    }
    if (raw === null) continue;
    if (raw < 0 || raw > 100) {
      hasOutOfRange = true;
      continue;
    }
    values[i] = raw;
  }
  return { values, hasInvalid, hasOutOfRange };
}

const COMPOSITION_STATUSES = ["А", "А+Г/ПМ", "А+ПМ"] as const;

export function parseContractFormData(formData: FormData): ParseResult {
  const title = String(formData.get("title") ?? "").trim();
  const buyerFullName = String(formData.get("buyerFullName") ?? "").trim();
  const contactId = trimOrNull(formData.get("contactId"));
  const salespersonId = trimOrNull(formData.get("salespersonId"));
  const building = trimOrNull(formData.get("building"));
  const parsedPercents = parsePaymentPercents(formData);
  const contractType = String(formData.get("contractType") ?? "BEZ_SMR") as ContractType;
  const compositionStatus = trimOrNull(formData.get("compositionStatus"));
  // "Преди / След" (completion) is no longer collected from the form — the
  // system ships well after Акт 16 across the company's projects, so every
  // newly created or edited contract is "След" by definition. The schema
  // column stays for legacy/imported rows; the form path hard-codes the
  // value here regardless of what the client sends.
  const preOrPost: string = "След";
  const usesCredit = String(formData.get("usesCredit") ?? "") === "on";
  const totalDueEur = parseDecimal(formData.get("totalDueEur"));
  const status = String(formData.get("status") ?? "draft") as ContractStatus;
  const signedAt = parseDate(formData.get("signedAt"));
  const reminderDate = parseDate(formData.get("reminderDate"));
  // FormData carries the repeated `propertyIds` entries — `getAll` returns
  // the array.
  const propertyIds = (formData.getAll("propertyIds") as string[])
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);

  const errors: ContractFormState["errors"] = {};
  const warnings: ContractFormState["warnings"] = {};

  if (title.length === 0) errors.title = "Заглавието е задължително.";
  if (title.length > 200) errors.title = "Заглавието е твърде дълго (макс. 200 символа).";
  if (buyerFullName.length === 0) errors.buyerFullName = "Името на купувача е задължително.";

  if (!CONTRACT_TYPES.includes(contractType)) {
    errors.contractType = "Невалиден тип на договора.";
  }
  if (!CONTRACT_STATUSES.includes(status)) {
    errors.status = "Невалиден статус.";
  }
  if (compositionStatus !== null && !COMPOSITION_STATUSES.includes(compositionStatus as (typeof COMPOSITION_STATUSES)[number])) {
    // Non-blocking — admins might add new composition combos. Warn only.
    warnings.title = `Нестандартен състав: ${compositionStatus}.`;
  }

  if (totalDueEur === null) {
    errors.totalDueEur = "Общата сума е задължителна и трябва да е валидно число.";
  } else if (totalDueEur.lt(0)) {
    errors.totalDueEur = "Общата сума не може да е отрицателна.";
  }

  if (propertyIds.length === 0) {
    errors.propertyIds = "Изберете поне един имот.";
  }

  // Payment-percent validation. Per-slot must be in [0, 100]; the sum can
  // be anything (lenient — the form shows a soft warning when ≠ 100). The
  // action layer is responsible for skipping the upsert when every slot
  // is null (user left the section blank).
  if (parsedPercents.hasInvalid) {
    errors.paymentPercents = "Невалиден процент във вноска.";
  } else if (parsedPercents.hasOutOfRange) {
    errors.paymentPercents = "Процентите по вноски трябва да са между 0 и 100.";
  }

  // Signed status pairs naturally with a signed date; warn (not block) if
  // missing so the user notices but isn't forced to backfill on legacy data.
  if (status === "signed" && signedAt === null) {
    warnings.signedAt = "Договорът е със статус Подписан, но няма дата на подписване.";
  }
  if (status !== "signed" && signedAt !== null) {
    warnings.signedAt = "Дата на подписване е попълнена, но статусът не е Подписан.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, warnings };
  }

  return {
    ok: true,
    warnings,
    data: {
      title,
      buyerFullName,
      contactId,
      salespersonId,
      building,
      contractType,
      compositionStatus,
      preOrPost,
      usesCredit,
      // totalDueEur is non-null here per the validation above; assert.
      totalDueEur: totalDueEur as Prisma.Decimal,
      status,
      signedAt,
      reminderDate,
      propertyIds,
      paymentPercents: parsedPercents.values,
    },
  };
}
