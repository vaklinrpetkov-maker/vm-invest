import { prisma } from "@/lib/prisma";

// Cross-portfolio team-capacity check for the renovations module. See
// `specs/renovations.md` §8.
//
// Model:
//   - For each `(date D, team T)` pair, the load is the SUM of
//     `peopleRequired` across all non-cancelled `RenovationActivity` rows
//     whose `[startDate, endDate]` window covers D AND whose parent
//     renovation is non-cancelled + non-deleted.
//   - An overage day for team T is any D where `load(D, T) > T.totalPeople`.
//   - The "any-team-over" set is the union of overage days across all teams.
//
// Implementation is on-demand: one SQL pass fetches the active activities
// touching the window + the team capacity table, then in-memory aggregation
// produces the per-team per-day load map + the overage set. No precomputed
// table; the data volume is small enough (single company, ~30 active
// activities at peak) that the query is cheap.

const DAY_MS = 24 * 60 * 60 * 1000;

export type CapacityResult = {
  // teamId → ISO-day → load (people occupied). Only contains days in the
  // requested window with non-zero load — sparse map, callers default to 0.
  loadByTeamDay: Map<string, Map<string, number>>;
  // teamId → team.totalPeople (capacity). Includes every team referenced by
  // an activity in the window OR explicitly requested via `requiredTeamIds`.
  capacityByTeam: Map<string, number>;
  // teamId → team.name (for display). Same membership as `capacityByTeam`.
  teamLabel: Map<string, { name: string; specialty: string | null }>;
  // ISO-day strings where AT LEAST ONE team is over capacity.
  overageDays: Set<string>;
  // ISO-day strings where the SPECIFIED team is over capacity. Convenience
  // accessor — useful for highlighting per-team strips on the detail page.
  // Returns the empty set for unknown team ids.
  overageDaysFor(teamId: string): Set<string>;
};

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Iterate every ISO-day in `[from, to]` inclusive.
function* eachDayIso(from: Date, to: Date): Generator<string> {
  let cursor = utcMidnight(from).getTime();
  const stop = utcMidnight(to).getTime();
  while (cursor <= stop) {
    yield isoDay(new Date(cursor));
    cursor += DAY_MS;
  }
}

// Fetches the inputs + computes the capacity result over `[windowStart,
// windowEnd]` (both inclusive). Optional `requiredTeamIds` ensures those
// teams' capacities are included even if no activity touches them in the
// window (the detail-page strip renders one row per referenced team — pass
// the renovation's team set so empty days still render with their capacity
// number).
export async function computeCapacity(args: {
  windowStart: Date;
  windowEnd: Date;
  requiredTeamIds?: ReadonlyArray<string>;
}): Promise<CapacityResult> {
  const winStart = utcMidnight(args.windowStart);
  const winEnd = utcMidnight(args.windowEnd);

  // Pull every active activity that overlaps the window. The two indexes on
  // `(teamId, startDate)` + `(teamId, endDate)` keep this cheap even with
  // hundreds of activities. Overlap = activity.startDate <= windowEnd AND
  // activity.endDate >= windowStart.
  const activities = await prisma.renovationActivity.findMany({
    where: {
      status: { notIn: ["cancelled"] },
      renovation: {
        status: { notIn: ["cancelled"] },
        deletedAt: null,
      },
      startDate: { lte: winEnd },
      endDate: { gte: winStart },
      teamId: { not: null },
    },
    select: {
      teamId: true,
      peopleRequired: true,
      startDate: true,
      endDate: true,
    },
  });

  // Pull all non-deleted teams — needed for the capacity threshold + the
  // strip labels. Cheap (small table).
  const teams = await prisma.team.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, specialty: true, totalPeople: true },
  });

  const capacityByTeam = new Map<string, number>();
  const teamLabel = new Map<string, { name: string; specialty: string | null }>();
  for (const t of teams) {
    capacityByTeam.set(t.id, t.totalPeople);
    teamLabel.set(t.id, { name: t.name, specialty: t.specialty });
  }

  // Aggregate load per team per day.
  const loadByTeamDay = new Map<string, Map<string, number>>();
  for (const a of activities) {
    if (!a.teamId || !a.startDate || !a.endDate) continue;
    const from = a.startDate < winStart ? winStart : a.startDate;
    const to = a.endDate > winEnd ? winEnd : a.endDate;
    let bucket = loadByTeamDay.get(a.teamId);
    if (!bucket) {
      bucket = new Map<string, number>();
      loadByTeamDay.set(a.teamId, bucket);
    }
    for (const day of eachDayIso(from, to)) {
      bucket.set(day, (bucket.get(day) ?? 0) + a.peopleRequired);
    }
  }

  // Ensure required-team ids appear in capacityByTeam + teamLabel even if no
  // activity references them.
  for (const id of args.requiredTeamIds ?? []) {
    if (!capacityByTeam.has(id)) {
      // Team was soft-deleted but is still referenced. Render with 0
      // capacity — every load value will show as overage which is the right
      // signal ("this team no longer exists").
      capacityByTeam.set(id, 0);
      teamLabel.set(id, { name: "—", specialty: null });
    }
  }

  // Compute overage sets — per-team + global union.
  const overageDays = new Set<string>();
  const overageByTeam = new Map<string, Set<string>>();
  for (const [teamId, dayMap] of loadByTeamDay.entries()) {
    const cap = capacityByTeam.get(teamId) ?? 0;
    const overSet = new Set<string>();
    for (const [day, load] of dayMap.entries()) {
      if (load > cap) {
        overSet.add(day);
        overageDays.add(day);
      }
    }
    if (overSet.size > 0) overageByTeam.set(teamId, overSet);
  }

  return {
    loadByTeamDay,
    capacityByTeam,
    teamLabel,
    overageDays,
    overageDaysFor(teamId: string): Set<string> {
      return overageByTeam.get(teamId) ?? new Set();
    },
  };
}

// "Worst overage" summary for the per-renovation list chip (spec §5.1 #7).
// Walks a renovation's activities against an already-computed `capacity`
// result and finds the team-day where THIS renovation contributes to the
// largest overage. Pure helper — no DB calls; runs inside the page's
// transformer over the rows it just received.
//
// Returns `null` when:
//   - the renovation has no dated activities, OR
//   - none of this renovation's team-days exceed capacity
//     (in which case the list chip renders "OK" — the caller picks the
//     "OK" vs empty distinction based on the renovation's status).
//
// We only count overage on team-days where THIS renovation's activities
// run; otherwise every renovation alive during a crunch period would chip
// red, defeating the column's purpose as a triage signal.
export function computeWorstOverageForRenovation(
  activities: ReadonlyArray<{
    teamId: string | null;
    startDate: Date | null;
    endDate: Date | null;
    status: string;
  }>,
  capacity: CapacityResult,
): { teamName: string; over: number } | null {
  let bestOver = 0;
  let bestTeamId: string | null = null;

  for (const a of activities) {
    if (a.status === "cancelled") continue;
    if (!a.teamId) continue; // outsourced — no capacity contribution
    if (!a.startDate || !a.endDate) continue;
    const dayMap = capacity.loadByTeamDay.get(a.teamId);
    if (!dayMap) continue;
    const cap = capacity.capacityByTeam.get(a.teamId) ?? 0;

    for (const day of eachDayIso(a.startDate, a.endDate)) {
      const load = dayMap.get(day) ?? 0;
      const over = load - cap;
      if (over <= 0) continue;
      if (over > bestOver) {
        bestOver = over;
        bestTeamId = a.teamId;
      } else if (over === bestOver && bestTeamId !== null) {
        // Tie-break alphabetically on team display label so the chip is
        // deterministic across renders. Comparing on labels (not ids) so
        // the user-visible behaviour matches user expectation.
        const currentLabel = capacity.teamLabel.get(a.teamId);
        const incumbentLabel = capacity.teamLabel.get(bestTeamId);
        const currentText = currentLabel?.specialty ?? currentLabel?.name ?? "";
        const incumbentText = incumbentLabel?.specialty ?? incumbentLabel?.name ?? "";
        if (currentText.localeCompare(incumbentText, "bg-BG") < 0) {
          bestTeamId = a.teamId;
        }
      }
    }
  }

  if (bestOver === 0 || bestTeamId === null) return null;
  const label = capacity.teamLabel.get(bestTeamId);
  return {
    teamName: label?.specialty ?? label?.name ?? "—",
    over: bestOver,
  };
}

// Convenience for the KPI tile: count of overage days in the next 90 days
// from today (inclusive). Skips weekend awareness — same calendar-day model
// the rest of the module uses.
export async function countCapacityOverageDaysNext90(): Promise<number> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 89 * DAY_MS);
  const result = await computeCapacity({ windowStart: start, windowEnd: end });
  return result.overageDays.size;
}
