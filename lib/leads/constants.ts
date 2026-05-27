import type { LeadSource, LeadStatus } from "@prisma/client";

// Bulgarian labels + display tones for lead enums. Keep the enum values in
// sync with the Prisma schema.

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Нов",
  in_progress: "В процес",
  converted: "Преобразуван",
  no_progress: "Без прогрес",
};

export const LEAD_STATUS_TONES: Record<
  LeadStatus,
  "info" | "accent" | "success" | "neutral"
> = {
  new: "info",
  in_progress: "accent",
  converted: "success",
  no_progress: "neutral",
};

// Statuses the user can pick manually. `converted` is system-only (set by the
// Contracts module when a Contract references this lead).
export const LEAD_STATUS_USER_SELECTABLE: LeadStatus[] = [
  "new",
  "in_progress",
  "no_progress",
];

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  manual: "Ръчен",
  email_form: "Форма имейл",
  email_unparsed: "Имейл (за преглед)",
  phone: "Телефон",
};

export const LEAD_SOURCE_TONES: Record<
  LeadSource,
  "neutral" | "info" | "warning" | "accent"
> = {
  manual: "neutral",
  email_form: "info",
  email_unparsed: "warning",
  phone: "accent",
};

// Phase 1 only creates manual + phone leads. Email sources are produced by
// the Phase 2 parser — not user-selectable.
export const LEAD_SOURCE_USER_SELECTABLE: LeadSource[] = ["manual", "phone"];
