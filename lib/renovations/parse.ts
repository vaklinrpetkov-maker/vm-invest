import type { ApartmentSize, RenovationStatus } from "@prisma/client";
import {
  isValidApartmentSize,
  isValidRenovationStatus,
  RENOVATION_STATUS_DEFAULT,
} from "./constants";

// FormData parser + validator for renovation create + edit.
//
// Pivot (20.05.2026 — `decisions.md`): the renovation row no longer carries
// `title` (derived `Ремонт — <building>/<unit>`) or `type` (replaced by the
// catalog of activity templates). Create flow adds `apartmentSize`,
// `bathroomCount`, and a list of selected template ids (`templateId` —
// repeated form key) that the chain-load consumes server-side.
//
// Edit flow drops `apartmentSize` + `bathroomCount` — both are baked at
// creation time; changing either would invalidate every snapshot duration.
// To "change the size" the operator deletes + recreates the renovation.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Header fields shared by create + edit.
export type RenovationHeaderPatch = {
  status: RenovationStatus;
  description: string | null;
  propertyId: string;
  requestedByContactId: string | null;
  managerId: string | null;
  plannedStartDate: Date | null;
  actualStartDate: Date | null;
  actualEndDate: Date | null;
};

// Create-only additions: scoping fields baked at creation, plus the loader's
// selected templates.
export type RenovationCreatePatch = RenovationHeaderPatch & {
  apartmentSize: ApartmentSize;
  bathroomCount: number;
  selectedTemplateIds: string[];
};

type FieldKey =
  | "status"
  | "description"
  | "propertyId"
  | "requestedByContactId"
  | "managerId"
  | "plannedStartDate"
  | "actualStartDate"
  | "actualEndDate"
  | "apartmentSize"
  | "bathroomCount"
  | "selectedTemplateIds"
  | "form";

export type RenovationFormState = {
  errors?: Partial<Record<FieldKey, string>>;
  warnings?: Partial<Record<FieldKey, string>>;
  // Set on successful create — the client uses this to navigate to the
  // new renovation's detail page.
  createdRenovationId?: string;
};

function trimOrNull(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

function parseDate(v: FormDataEntryValue | null): Date | null {
  const s = trimOrNull(v);
  if (s === null) return null;
  if (!ISO_DATE_RE.test(s)) return null;
  return new Date(`${s}T00:00:00Z`);
}

function uuidOrNull(v: FormDataEntryValue | null): string | null {
  const s = trimOrNull(v);
  if (s === null) return null;
  return UUID_RE.test(s) ? s : null;
}

function parseHeader(formData: FormData): {
  data: RenovationHeaderPatch | null;
  errors: Partial<Record<FieldKey, string>>;
  warnings: Partial<Record<FieldKey, string>>;
} {
  const statusRaw = String(formData.get("status") ?? RENOVATION_STATUS_DEFAULT);
  const status = isValidRenovationStatus(statusRaw) ? statusRaw : RENOVATION_STATUS_DEFAULT;
  const description = trimOrNull(formData.get("description"));
  const propertyId = uuidOrNull(formData.get("propertyId"));
  const requestedByContactId = uuidOrNull(formData.get("requestedByContactId"));
  const managerId = uuidOrNull(formData.get("managerId"));
  const plannedStartDate = parseDate(formData.get("plannedStartDate"));
  const actualStartDate = parseDate(formData.get("actualStartDate"));
  const actualEndDate = parseDate(formData.get("actualEndDate"));

  const errors: Partial<Record<FieldKey, string>> = {};
  const warnings: Partial<Record<FieldKey, string>> = {};

  if (description !== null && description.length > 4000) {
    errors.description = "Описанието е твърде дълго (макс. 4000 символа).";
  }
  if (propertyId === null) {
    errors.propertyId = "Изберете имот.";
  }
  if (actualStartDate !== null && actualEndDate !== null && actualEndDate < actualStartDate) {
    warnings.actualEndDate = "Реалното завършване е преди реалното начало.";
  }

  if (Object.keys(errors).length > 0) {
    return { data: null, errors, warnings };
  }

  return {
    data: {
      status,
      description,
      propertyId: propertyId as string,
      requestedByContactId,
      managerId,
      plannedStartDate,
      actualStartDate,
      actualEndDate,
    },
    errors,
    warnings,
  };
}

export type ParseCreateResult =
  | { ok: true; data: RenovationCreatePatch; warnings: RenovationFormState["warnings"] }
  | { ok: false; errors: RenovationFormState["errors"]; warnings: RenovationFormState["warnings"] };

export function parseRenovationCreateFormData(formData: FormData): ParseCreateResult {
  const header = parseHeader(formData);
  const errors = { ...header.errors };
  const warnings = { ...header.warnings };

  const sizeRaw = String(formData.get("apartmentSize") ?? "");
  const apartmentSize = isValidApartmentSize(sizeRaw) ? sizeRaw : null;
  if (apartmentSize === null) {
    errors.apartmentSize = "Изберете размер на апартамента.";
  }

  const bathroomRaw = String(formData.get("bathroomCount") ?? "1");
  const parsedBath = Number.parseInt(bathroomRaw, 10);
  const bathroomCount = Number.isFinite(parsedBath) && parsedBath >= 1 ? parsedBath : null;
  if (bathroomCount === null) {
    errors.bathroomCount = "Броят бани трябва да е положително цяло число.";
  }

  // The loader emits checkboxes named `templateId` — repeated form key.
  // FormData.getAll preserves order, which the chain-load relies on.
  const raw = formData.getAll("templateId");
  const selectedTemplateIds: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    const s = String(v).trim();
    if (UUID_RE.test(s) && !seen.has(s)) {
      seen.add(s);
      selectedTemplateIds.push(s);
    }
  }
  // Loader-selected activities are optional; an empty list creates a
  // renovation with no activities (operator can add via "+ Добави дейност"
  // on the detail page).

  if (header.data === null || apartmentSize === null || bathroomCount === null) {
    return { ok: false, errors, warnings };
  }

  return {
    ok: true,
    warnings,
    data: {
      ...header.data,
      apartmentSize,
      bathroomCount,
      selectedTemplateIds,
    },
  };
}

export type ParseEditResult =
  | { ok: true; data: RenovationHeaderPatch; warnings: RenovationFormState["warnings"] }
  | { ok: false; errors: RenovationFormState["errors"]; warnings: RenovationFormState["warnings"] };

// Edit shape is just the header — apartmentSize + bathroomCount are baked
// at creation and not editable. Title/type are derived/dropped.
export function parseRenovationEditFormData(formData: FormData): ParseEditResult {
  const header = parseHeader(formData);
  if (header.data === null) {
    return { ok: false, errors: header.errors, warnings: header.warnings };
  }
  return { ok: true, data: header.data, warnings: header.warnings };
}
