import type { MeetingStatus, MeetingType } from "@prisma/client";

// Bulgarian labels + tone mappings for meeting enums. Meeting colors per
// specs/meetings.md §5.3: blue / green / gold / purple / grey. We reuse the
// design system's tone palette rather than literal color names so the visual
// language stays consistent with the rest of the ERP.

export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  office_presentation: "Презентация в офиса",
  onsite_presentation: "Презентация на място",
  contract_signing: "Подписване на договор",
  follow_up: "Последваща среща",
  other: "Друго",
};

// Tone mapping → design system colors (info = blue, success = green,
// accent = gold-ish, we use a purple-ish danger for follow-up, neutral for other).
export const MEETING_TYPE_TONES: Record<
  MeetingType,
  "info" | "success" | "accent" | "danger" | "neutral"
> = {
  office_presentation: "info",
  onsite_presentation: "success",
  contract_signing: "accent",
  follow_up: "danger",
  other: "neutral",
};

// Raw hex values for the calendar bar rendering (M2). Stored here alongside
// labels so everything lives in one place.
export const MEETING_TYPE_COLORS_HEX: Record<MeetingType, string> = {
  office_presentation: "#3A6B8E", // info-500
  onsite_presentation: "#5C7A2E", // success-500
  contract_signing: "#B07A1A", // accent-500
  follow_up: "#8E2D16", // danger-600
  other: "#565649", // neutral-600
};

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  upcoming: "Предстояща",
  happened: "Състояла се",
  cancelled: "Отменена",
};

export const MEETING_STATUS_TONES: Record<
  MeetingStatus,
  "info" | "success" | "neutral"
> = {
  upcoming: "info",
  happened: "success",
  cancelled: "neutral",
};

// Duration picker presets per spec §3 step 4. "custom" = user types a value.
export const DURATION_PRESETS = [15, 30, 45, 60, 90, 120] as const;

export type DurationPreset = (typeof DURATION_PRESETS)[number];

// The 30-day restore window (spec §4.2). Non-admins can restore within this;
// after the window, admin only.
export const RESTORE_WINDOW_DAYS = 30;
