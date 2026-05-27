import type { ApartmentSize } from "@prisma/client";
import { APARTMENT_SIZE_DURATION_FIELD } from "./constants";

// Chain-load helper: given a renovation's start date + selected activity
// templates (in their catalog order) + the renovation's apartment size +
// bathroom count, produce the list of activity inserts with computed
// startDate / endDate / durationDays. Pure function — no DB calls — so it
// can be unit-tested + used both by the create action AND the "Преподреди
// по сегашния ред" rechain button on the detail page.
//
// Per `specs/renovations.md` §5.2 step 3:
//   - first activity starts at renovation.plannedStartDate
//   - subsequent: startDate = previous.endDate + 1 day
//   - endDate = startDate + durationDays - 1 (raw calendar days; weekend
//     awareness is deferred per §14)
//   - bathroom-multiplied templates: durationDays multiplied by bathroomCount

export type ChainLoadTemplate = {
  id: string;
  name: string;
  teamId: string | null;
  peopleRequired: number;
  bathroomMultiplied: boolean;
  durationStudio: number;
  durationTwoRoom: number;
  durationThreeRoom: number;
  durationFourRoom: number;
  sortOrder: number;
};

export type ChainLoadedActivity = {
  templateId: string;
  name: string;
  teamId: string | null;
  peopleRequired: number;
  durationDays: number;
  startDate: Date;
  endDate: Date;
  sortOrder: number;
};

// Days are calendar days. Half-day durations are allowed; the `endDate`
// of an N-day activity is `startDate + N - 1` (inclusive). For half-day
// values we round the endDate to the same day (0.5 + 0.5 = 1 day total,
// rounded inclusively to one day on the Gantt). Stored value stays 0.5.
function addCalendarDays(start: Date, durationDays: number): Date {
  const end = new Date(start.getTime());
  // Math.max(1, ...) — even half-day activities occupy one calendar slot.
  const wholeDays = Math.max(1, Math.ceil(durationDays));
  end.setUTCDate(end.getUTCDate() + wholeDays - 1);
  return end;
}

function nextDay(d: Date): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + 1);
  return out;
}

export function chainLoadActivities(args: {
  plannedStartDate: Date;
  apartmentSize: ApartmentSize;
  bathroomCount: number;
  templates: ChainLoadTemplate[]; // assumed sorted by sortOrder ascending
}): ChainLoadedActivity[] {
  const durationField = APARTMENT_SIZE_DURATION_FIELD[args.apartmentSize];
  const out: ChainLoadedActivity[] = [];
  let cursor = new Date(args.plannedStartDate.getTime());

  // Re-sort defensively in case the caller forgot. Stable order over
  // (sortOrder, id) so concurrent ties are deterministic.
  const sorted = [...args.templates].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.id.localeCompare(b.id);
  });

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    const baseDuration = Number(t[durationField]);
    const duration = t.bathroomMultiplied
      ? baseDuration * Math.max(1, args.bathroomCount)
      : baseDuration;
    const startDate = new Date(cursor.getTime());
    const endDate = addCalendarDays(startDate, duration);

    out.push({
      templateId: t.id,
      name: t.name,
      teamId: t.teamId,
      peopleRequired: t.peopleRequired,
      durationDays: duration,
      startDate,
      endDate,
      // sortOrder mirrors the catalog so the renovation's order matches
      // the loader checklist order at load time. Re-numbered 1..N so gaps
      // in the catalog (from deletions) don't bleed into the renovation.
      sortOrder: i + 1,
    });

    cursor = nextDay(endDate);
  }

  return out;
}

// Returns the cached `plannedEndDate` for a renovation given its current
// activities. Caller (server action) persists this onto the renovation row
// after every activity write. Null when there are no activities or none
// have an endDate set.
export function computePlannedEndDate(
  activities: ReadonlyArray<{ endDate: Date | null; status: string }>,
): Date | null {
  let max: Date | null = null;
  for (const a of activities) {
    if (a.status === "cancelled") continue;
    if (!a.endDate) continue;
    if (max === null || a.endDate.getTime() > max.getTime()) {
      max = a.endDate;
    }
  }
  return max;
}
