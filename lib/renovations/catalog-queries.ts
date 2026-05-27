import { prisma } from "@/lib/prisma";

// Read-side helpers for the renovation catalog. Used by:
//   - the admin pages (`/admin/renovations/teams`, `/admin/renovations/activities`)
//   - the renovation create modal's activity loader (`§5.2` of the spec)

export type TeamRow = {
  id: string;
  name: string;
  specialty: string | null;
  totalPeople: number;
  templateCount: number;
  activityCount: number;
};

// Live (non-deleted) teams, ordered by name. `templateCount` and
// `activityCount` let the admin page show how much a team is being used
// (and warn before soft-delete if it's referenced).
export async function listTeams(): Promise<TeamRow[]> {
  const rows = await prisma.team.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      specialty: true,
      totalPeople: true,
      _count: {
        select: {
          templates: { where: { deletedAt: null } },
          renovationActivities: true,
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    specialty: r.specialty,
    totalPeople: r.totalPeople,
    templateCount: r._count.templates,
    activityCount: r._count.renovationActivities,
  }));
}

// Same as `listTeams` but used for `<select>` widgets — leaner shape.
export async function listTeamOptions(): Promise<{ id: string; name: string; specialty: string | null }[]> {
  return prisma.team.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, specialty: true },
  });
}

export type ActivityTemplateRow = {
  id: string;
  name: string;
  teamId: string | null;
  teamName: string | null;
  teamSpecialty: string | null;
  peopleRequired: number;
  bathroomMultiplied: boolean;
  durationStudio: number;
  durationTwoRoom: number;
  durationThreeRoom: number;
  durationFourRoom: number;
  sortOrder: number;
};

// Live (non-deleted) activity templates in catalog order. Includes the team
// label flat on the row so the table renders without a join in JSX.
export async function listActivityTemplates(): Promise<ActivityTemplateRow[]> {
  const rows = await prisma.activityTemplate.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      teamId: true,
      peopleRequired: true,
      bathroomMultiplied: true,
      durationStudio: true,
      durationTwoRoom: true,
      durationThreeRoom: true,
      durationFourRoom: true,
      sortOrder: true,
      team: { select: { name: true, specialty: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    teamId: r.teamId,
    teamName: r.team?.name ?? null,
    teamSpecialty: r.team?.specialty ?? null,
    peopleRequired: r.peopleRequired,
    bathroomMultiplied: r.bathroomMultiplied,
    durationStudio: Number(r.durationStudio),
    durationTwoRoom: Number(r.durationTwoRoom),
    durationThreeRoom: Number(r.durationThreeRoom),
    durationFourRoom: Number(r.durationFourRoom),
    sortOrder: r.sortOrder,
  }));
}
