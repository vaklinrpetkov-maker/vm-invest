import type { ApartmentSize, RenovationStatus, RenovationTaskStatus } from "@prisma/client";
import type { BadgeTone } from "@/components/ui/status-badge";

// Canonical Bulgarian strings + tone mappings for renovation + task statuses.
// Per `specs/renovations.md` §3.2 + §3.5.

export const RENOVATION_STATUSES: ReadonlyArray<RenovationStatus> = [
  "draft",
  "quoted",
  "approved",
  "in_progress",
  "done",
  "cancelled",
];

export const RENOVATION_STATUS_LABELS: Record<RenovationStatus, string> = {
  draft: "Чернова",
  quoted: "Оферта",
  approved: "Одобрена",
  in_progress: "В процес",
  done: "Завършена",
  cancelled: "Отказана",
};

export const RENOVATION_STATUS_TONES: Record<RenovationStatus, BadgeTone> = {
  draft: "neutral",
  quoted: "info",
  approved: "accent",
  in_progress: "warning",
  done: "success",
  cancelled: "neutral-outline",
};

export const RENOVATION_STATUS_DEFAULT: RenovationStatus = "draft";

export function isValidRenovationStatus(v: string): v is RenovationStatus {
  return (RENOVATION_STATUSES as readonly string[]).includes(v);
}

// Task status — simpler 4-state set per spec §3.5. Renovation lifecycle is
// about project + client communication; tasks are about execution.
export const RENOVATION_TASK_STATUSES: ReadonlyArray<RenovationTaskStatus> = [
  "planned",
  "in_progress",
  "done",
  "cancelled",
];

export const RENOVATION_TASK_STATUS_LABELS: Record<RenovationTaskStatus, string> = {
  planned: "Планирана",
  in_progress: "В процес",
  done: "Завършена",
  cancelled: "Отказана",
};

export const RENOVATION_TASK_STATUS_TONES: Record<RenovationTaskStatus, BadgeTone> = {
  planned: "info",
  in_progress: "warning",
  done: "success",
  cancelled: "neutral-outline",
};

export function isValidRenovationTaskStatus(v: string): v is RenovationTaskStatus {
  return (RENOVATION_TASK_STATUSES as readonly string[]).includes(v);
}

// Pagination — matches Contacts/Properties for a consistent feel.
export const RENOVATIONS_PAGE_SIZE = 50;

// Apartment-size taxonomy — drives the activity catalog's duration columns
// and the per-renovation header. Values match the `Property.type` strings
// the company already uses (per `decisions.md` 20.05.2026).
// See `specs/renovations.md` §3.3.

export const APARTMENT_SIZES: ReadonlyArray<ApartmentSize> = [
  "studio",
  "two_room",
  "three_room",
  "four_room",
];

export const APARTMENT_SIZE_LABELS: Record<ApartmentSize, string> = {
  studio: "Едностаен",
  two_room: "Двустаен",
  three_room: "Тристаен",
  four_room: "Четиристаен",
};

export function isValidApartmentSize(v: string): v is ApartmentSize {
  return (APARTMENT_SIZES as readonly string[]).includes(v);
}

// Resolve `Property.type` (free-text in the schema) → ApartmentSize when
// it matches one of the four canonical Bulgarian labels. Returns null for
// anything else (Мезонет, Гараж, etc.) — the create modal then prompts
// the operator to pick a size manually.
export function resolveApartmentSizeFromPropertyType(
  propertyType: string | null | undefined,
): ApartmentSize | null {
  if (!propertyType) return null;
  const normalised = propertyType.trim().toLowerCase();
  for (const size of APARTMENT_SIZES) {
    if (APARTMENT_SIZE_LABELS[size].toLowerCase() === normalised) return size;
  }
  return null;
}

// Field on `ActivityTemplate` carrying the per-size duration. Lets the
// chain-load + the activity-loader UI pick the right column without a
// nested switch at every call site.
export const APARTMENT_SIZE_DURATION_FIELD: Record<
  ApartmentSize,
  "durationStudio" | "durationTwoRoom" | "durationThreeRoom" | "durationFourRoom"
> = {
  studio: "durationStudio",
  two_room: "durationTwoRoom",
  three_room: "durationThreeRoom",
  four_room: "durationFourRoom",
};
