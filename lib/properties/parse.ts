import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isValidPropertyStatus,
  isValidPropertyType,
  PROPERTY_STATUS_DEFAULT,
} from "./constants";
import { parseSellerInput } from "./sellers-normalize";

// Form-data parser + validator for create + update. Mirrors
// lib/contacts/parse.ts in shape (ok/err union, Bulgarian error messages,
// optional warnings). Server actions call this; invalid input returns as a
// form state so the client can re-render with the errors in place.

export type PropertyPatch = {
  buildingId: string;
  name: string;
  status: string;
  type: string;
  entrance: string | null;
  floor: number | null;
  description: string | null;
  // Free-text list of legal entities on the deed. Form input is a single
  // text field — `parseSellerInput` splits comma-separated values and
  // applies canonical-name normalization. Empty array allowed.
  sellers: string[];
  expectedPriceEur: Prisma.Decimal | null;
  priceEur: Prisma.Decimal | null;
  yardTerracePriceEur: Prisma.Decimal | null;
  totalAreaM2: Prisma.Decimal | null;
  commonPartsM2: Prisma.Decimal | null;
  netAreaM2: Prisma.Decimal | null;
  idealPartsCoef: Prisma.Decimal | null;
  bathroomCount: number | null;
  yardM2: Prisma.Decimal | null;
  terraceM2: Prisma.Decimal | null;
  landM2: Prisma.Decimal | null;
  landPct: Prisma.Decimal | null;
  yardPct: Prisma.Decimal | null;
  contractLabel: string | null;
  buyerLabel: string | null;
  hasCredit: boolean | null;
};

type FieldKey =
  | "buildingId"
  | "name"
  | "status"
  | "type"
  | "floor"
  | "bathroomCount"
  | "priceEur"
  | "expectedPriceEur"
  | "form";

export type PropertyFormState = {
  errors?: Partial<Record<FieldKey, string>>;
  warnings?: Partial<Record<FieldKey, string>>;
};

type ParseResult =
  | { ok: true; data: PropertyPatch; warnings: PropertyFormState["warnings"] }
  | { ok: false; errors: PropertyFormState["errors"]; warnings: PropertyFormState["warnings"] };

type ParseContext = {
  // Optional — when editing, pass the current property id so the duplicate
  // check excludes it.
  excludeId?: string;
  // When true, legacy free-text fields (buyerLabel, contractLabel, hasCredit)
  // are accepted; otherwise they're ignored (users never fill them on the
  // create form — only migration + admin-backdoor tools should touch them).
  includeLegacyFields?: boolean;
};

function trimOrNull(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function parseNumOrNull(v: FormDataEntryValue | null): number | null {
  if (v === null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseDecimalOrNull(v: FormDataEntryValue | null): Prisma.Decimal | null {
  const n = parseNumOrNull(v);
  if (n === null) return null;
  return new Prisma.Decimal(n);
}

export async function parsePropertyFormData(
  formData: FormData,
  ctx: ParseContext = {},
): Promise<ParseResult> {
  const buildingId = String(formData.get("buildingId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim() || PROPERTY_STATUS_DEFAULT;
  const type = String(formData.get("type") ?? "").trim();
  const entrance = trimOrNull(formData.get("entrance"));
  const floor = parseNumOrNull(formData.get("floor"));
  const description = trimOrNull(formData.get("description"));
  // Single form field "sellers" carrying comma-separated raw text. The
  // normalizer turns "ВМИнвест, Пулев" into ["VMInvest", "Pulev Invest Group"].
  const sellers = parseSellerInput(String(formData.get("sellers") ?? ""));

  const expectedPriceEur = parseDecimalOrNull(formData.get("expectedPriceEur"));
  const priceEur = parseDecimalOrNull(formData.get("priceEur"));
  const yardTerracePriceEur = parseDecimalOrNull(formData.get("yardTerracePriceEur"));
  const totalAreaM2 = parseDecimalOrNull(formData.get("totalAreaM2"));
  const commonPartsM2 = parseDecimalOrNull(formData.get("commonPartsM2"));
  const netAreaM2 = parseDecimalOrNull(formData.get("netAreaM2"));
  const idealPartsCoef = parseDecimalOrNull(formData.get("idealPartsCoef"));
  const bathroomCount = parseNumOrNull(formData.get("bathroomCount"));
  const yardM2 = parseDecimalOrNull(formData.get("yardM2"));
  const terraceM2 = parseDecimalOrNull(formData.get("terraceM2"));
  const landM2 = parseDecimalOrNull(formData.get("landM2"));
  const landPct = parseDecimalOrNull(formData.get("landPct"));
  const yardPct = parseDecimalOrNull(formData.get("yardPct"));

  const contractLabel = ctx.includeLegacyFields ? trimOrNull(formData.get("contractLabel")) : null;
  const buyerLabel = ctx.includeLegacyFields ? trimOrNull(formData.get("buyerLabel")) : null;
  const hasCreditRaw = ctx.includeLegacyFields ? trimOrNull(formData.get("hasCredit")) : null;
  const hasCredit =
    hasCreditRaw === null ? null : hasCreditRaw === "true" ? true : hasCreditRaw === "false" ? false : null;

  const errors: PropertyFormState["errors"] = {};
  const warnings: PropertyFormState["warnings"] = {};

  // Required fields + canonical-value validation.
  if (!buildingId) {
    errors.buildingId = "Изберете сграда.";
  } else {
    const building = await prisma.building.findUnique({
      where: { id: buildingId },
      select: { id: true, active: true, displayName: true },
    });
    if (!building) errors.buildingId = "Невалидна сграда.";
    else if (!building.active) errors.buildingId = "Тази сграда е деактивирана.";
  }

  if (name.length < 1) errors.name = "Въведете име.";

  if (!isValidPropertyStatus(status)) errors.status = "Невалиден статус.";
  if (!isValidPropertyType(type)) errors.type = "Невалиден тип.";

  // Range guards per §6.
  if (floor !== null && (floor < -3 || floor > 20)) {
    errors.floor = "Етажът трябва да е между -3 и 20.";
  }
  if (bathroomCount !== null && (bathroomCount < 0 || bathroomCount > 10)) {
    errors.bathroomCount = "Брой бани трябва да е между 0 и 10.";
  }

  // Soft warning: price well above expected — non-blocking.
  if (priceEur && expectedPriceEur && priceEur.gt(expectedPriceEur.mul(1.2))) {
    warnings.priceEur = "Цената е значително по-висока от очакваната. Провери.";
  }

  // Duplicate (buildingId, name) guard — §5.1.
  if (buildingId && name && !errors.buildingId && !errors.name) {
    const duplicate = await prisma.property.findFirst({
      where: {
        buildingId,
        name,
        deletedAt: null,
        ...(ctx.excludeId ? { id: { not: ctx.excludeId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      errors.name = "Имот с това име вече съществува в тази сграда.";
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, warnings };
  }

  return {
    ok: true,
    warnings,
    data: {
      buildingId,
      name,
      status,
      type,
      entrance,
      floor,
      description,
      sellers,
      expectedPriceEur,
      priceEur,
      yardTerracePriceEur,
      totalAreaM2,
      commonPartsM2,
      netAreaM2,
      idealPartsCoef,
      bathroomCount,
      yardM2,
      terraceM2,
      landM2,
      landPct,
      yardPct,
      contractLabel,
      buyerLabel,
      hasCredit,
    },
  };
}
