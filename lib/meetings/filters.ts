import type { MeetingStatus, MeetingType, Prisma } from "@prisma/client";
import {
  csvParam,
  firstParam,
  parseIsoDateParam,
  parsePageParam,
} from "@/lib/url-params";

// URL-driven filter parsing + Prisma where builder for the /meetings list.

export type MeetingSearchParams = {
  q?: string | string[];
  type?: string | string[];
  status?: string | string[];
  assignee?: string | string[];
  from?: string | string[];
  to?: string | string[];
  page?: string | string[];
};

export const MEETINGS_PAGE_SIZE = 100;

export type ParsedMeetingFilters = {
  q: string | null;
  types: MeetingType[];
  statuses: MeetingStatus[];
  // Show cancelled = true only if user explicitly asked for it. Per spec
  // §5.4 cancelled is hidden by default.
  includeCancelled: boolean;
  assignees: string[];
  from: Date | null;
  to: Date | null;
  page: number;
};

const VALID_TYPES = new Set([
  "office_presentation",
  "onsite_presentation",
  "contract_signing",
  "follow_up",
  "other",
]);
const VALID_STATUSES = new Set(["upcoming", "happened", "cancelled"]);

export function parseMeetingFilters(raw: MeetingSearchParams): ParsedMeetingFilters {
  const q = firstParam(raw.q)?.trim() || null;

  const types = csvParam(raw.type).filter((s) => VALID_TYPES.has(s)) as MeetingType[];

  const statusesFromUrl = csvParam(raw.status).filter((s) =>
    VALID_STATUSES.has(s),
  ) as MeetingStatus[];
  const includeCancelled = statusesFromUrl.includes("cancelled");
  const statuses = statusesFromUrl.length ? statusesFromUrl : [];

  return {
    q,
    types,
    statuses,
    includeCancelled,
    assignees: csvParam(raw.assignee),
    from: parseIsoDateParam(raw.from),
    to: parseIsoDateParam(raw.to),
    page: parsePageParam(raw.page),
  };
}

export function buildMeetingWhere(f: ParsedMeetingFilters): Prisma.MeetingWhereInput {
  const AND: Prisma.MeetingWhereInput[] = [];

  // Hide cancelled unless user explicitly includes it
  if (f.statuses.length === 0) {
    if (!f.includeCancelled) {
      AND.push({ status: { not: "cancelled" } });
    }
  } else {
    AND.push({ status: { in: f.statuses } });
  }

  if (f.q) {
    const q = f.q;
    AND.push({
      OR: [
        { lead: { contact: { fullName: { contains: q, mode: "insensitive" } } } },
        { location: { contains: q, mode: "insensitive" } },
        { notes: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  if (f.types.length) AND.push({ type: { in: f.types } });

  if (f.assignees.length) {
    AND.push({
      assignees: { some: { profileId: { in: f.assignees } } },
    });
  }

  if (f.from) AND.push({ startsAt: { gte: f.from } });
  if (f.to) {
    const end = new Date(f.to.getTime() + 24 * 60 * 60 * 1000);
    AND.push({ startsAt: { lt: end } });
  }

  return { AND };
}

export function serializeMeetingFilters(f: ParsedMeetingFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.types.length) p.set("type", f.types.join(","));
  if (f.statuses.length) p.set("status", f.statuses.join(","));
  else if (f.includeCancelled) p.set("status", "cancelled");
  if (f.assignees.length) p.set("assignee", f.assignees.join(","));
  if (f.from) p.set("from", f.from.toISOString().slice(0, 10));
  if (f.to) p.set("to", f.to.toISOString().slice(0, 10));
  if (f.page > 1) p.set("page", String(f.page));
  return p;
}
