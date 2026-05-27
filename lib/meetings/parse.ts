import type { MeetingType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Parse + validate the meeting form. Date/time input is `datetime-local` which
// produces "YYYY-MM-DDTHH:MM" (no timezone). We interpret it as Europe/Sofia
// wall-clock and convert to UTC for storage.
//
// Europe/Sofia is UTC+2 in winter, UTC+3 in summer — we compute the offset
// for the given instant rather than hard-coding.

const VALID_TYPES = new Set([
  "office_presentation",
  "onsite_presentation",
  "contract_signing",
  "follow_up",
  "other",
]);

export type MeetingPatch = {
  leadId: string;
  startsAt: Date;
  durationMinutes: number;
  type: MeetingType;
  location: string | null;
  notes: string | null;
  assigneeIds: string[]; // always includes creator on create (added server-side)
};

type ParseErrors = Partial<
  Record<
    | "leadId"
    | "startsAt"
    | "duration"
    | "type"
    | "assignees"
    | "form",
    string
  >
>;

type ParseResult =
  | { ok: true; data: MeetingPatch }
  | { ok: false; errors: ParseErrors };

// Convert a wall-clock "YYYY-MM-DDTHH:MM" in Europe/Sofia to a UTC Date.
// Using Intl: for the given wall-clock we format it back in Sofia and measure
// the offset. Simpler alternative would be a tz library; this avoids a dep.
//
// Exported because inline-edit cells (`<InlineDateTimeCell>`) need the same
// conversion at write-time. See `app/(app)/meetings/field-actions.ts`.
export function sofiaWallClockToUtc(input: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) return null;

  // Interpret the string as UTC to get an initial candidate.
  const asUtc = new Date(`${input}:00Z`);
  if (isNaN(asUtc.getTime())) return null;

  // Compute the Sofia offset at that candidate instant.
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(asUtc);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const sofiaWall = `${map.year}-${map.month}-${map.day}T${map.hour === "24" ? "00" : map.hour}:${map.minute}:${map.second}Z`;
  const sofiaCandidate = new Date(sofiaWall);
  const offsetMs = asUtc.getTime() - sofiaCandidate.getTime();
  return new Date(asUtc.getTime() + offsetMs);
}

// Inverse of `sofiaWallClockToUtc` — format a UTC Date as a wall-clock
// `YYYY-MM-DDTHH:MM` in Europe/Sofia, the shape `<input type="datetime-local">`
// expects as its `value`. Used by the meetings table to pre-fill the
// inline-datetime cell when the user starts editing.
export function utcToSofiaWallClock(date: Date): string {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  // `hour: "2-digit"` with `hour12: false` can yield "24" at midnight on some
  // ICU builds — normalize to "00" to keep the input value valid.
  const hour = map.hour === "24" ? "00" : map.hour;
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}`;
}

export async function parseMeetingFormData(formData: FormData): Promise<ParseResult> {
  const leadId = String(formData.get("leadId") ?? "").trim();
  const startsAtRaw = String(formData.get("startsAt") ?? "").trim();
  const durationRaw = String(formData.get("duration") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const assigneeIds = formData
    .getAll("assignees")
    .map(String)
    .filter((s) => s.length > 0);

  const errors: ParseErrors = {};

  if (!leadId) errors.leadId = "Изберете лийд.";
  const startsAt = sofiaWallClockToUtc(startsAtRaw);
  if (!startsAt) errors.startsAt = "Изберете валидна дата и час.";

  const duration = Number(durationRaw);
  if (!Number.isFinite(duration) || duration < 0 || duration > 720) {
    errors.duration = "Продължителността трябва да е между 0 и 720 минути.";
  }

  if (!VALID_TYPES.has(type)) errors.type = "Невалиден тип.";

  if (assigneeIds.length === 0) {
    errors.assignees = "Добавете поне един участник.";
  }

  if (leadId) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, deletedAt: true, status: true },
    });
    if (!lead) errors.leadId = "Лийдът не съществува.";
    else if (lead.deletedAt) errors.leadId = "Лийдът е изтрит.";
    // Converted leads aren't allowed per spec — picker already excludes them
    // but someone could still send the ID via a direct form POST.
    else if (lead.status === "converted")
      errors.leadId = "Преобразуваните лийдове не приемат нови срещи.";
  }

  if (assigneeIds.length > 0) {
    const actives = await prisma.profile.findMany({
      where: { id: { in: assigneeIds }, active: true },
      select: { id: true },
    });
    if (actives.length !== assigneeIds.length) {
      errors.assignees = "Един или повече участници са неактивни.";
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      leadId,
      startsAt: startsAt!,
      durationMinutes: Math.floor(duration),
      type: type as MeetingType,
      location,
      notes,
      assigneeIds,
    },
  };
}
