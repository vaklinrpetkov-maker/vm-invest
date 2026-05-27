import type { BadgeTone } from "@/components/ui/status-badge";

// Canonical Bulgarian strings for Property.status and Property.type. Stored
// as-is in the DB. Admins can add/rename via a future config screen; for now
// the lists are hardcoded in sync with specs/properties.md §3.4 and §3.5.

export const PROPERTY_STATUSES = [
  "Продаден Нот. Акт",
  "Свободен",
  "Предварителен договор",
  "Обезщетение",
  "Запазен",
  "Депозит",
  "Отложена продажба",
  "Отказал се",
] as const;

export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export const PROPERTY_STATUS_DEFAULT: PropertyStatus = "Свободен";

// Design-system tone mapping per specs/properties.md §3.4.
export const PROPERTY_STATUS_TONES: Record<PropertyStatus, BadgeTone> = {
  "Продаден Нот. Акт":     "neutral",
  "Свободен":              "success",
  "Предварителен договор": "accent",
  "Обезщетение":           "info",
  "Запазен":               "warning-soft",
  "Депозит":               "warning",
  "Отложена продажба":     "neutral-outline",
  "Отказал се":            "danger",
};

export function isValidPropertyStatus(v: string): v is PropertyStatus {
  return (PROPERTY_STATUSES as readonly string[]).includes(v);
}

export const PROPERTY_TYPES = [
  "Гараж",
  "Друго",
  "Двустаен",
  "Тристаен",
  "ВПМ",
  "ПМ",
  "Едностаен",
  "Мазе",
  "Четиристаен",
  "Апартамент",
  "Склад",
  "Офис",
  "Многостаен",
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_TYPE_DEFAULT: PropertyType = "Друго";

export function isValidPropertyType(v: string): v is PropertyType {
  return (PROPERTY_TYPES as readonly string[]).includes(v);
}

// Pagination — matches the Contacts page size for a consistent "feel".
export const PROPERTIES_PAGE_SIZE = 100;

// Entrance values are free strings in the CSV (`А`/`Б`/`В`/`Г`/`Д`/`Е`/`Не`).
// Not strictly validated; just used for the filter bar's multi-select.
export const PROPERTY_ENTRANCE_SUGGESTIONS = ["А", "Б", "В", "Г", "Д", "Е", "Не"] as const;
