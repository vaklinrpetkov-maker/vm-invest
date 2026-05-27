// Seeds the renovation catalog: 7 teams + 29 activity templates from the
// workbook `files/Renovations Gantt Chart Activities and Resources/
// VM Home – дейности и време по обекти в дни-3.xlsx`. See
// `specs/renovations.md` §3.6.2 + §3.7 for the source table and locked
// decisions, and `specs/decisions.md` 20.05.2026 for the pivot rationale.
//
// Idempotent: keyed by `Team.name` and `ActivityTemplate.name`. Re-running
// updates the row's `peopleRequired` / durations / sortOrder / team to
// match this file's values, so corrections to the catalog can be applied
// by editing this script + re-running.
//
// Run with:
//   npm run renovations:seed-catalog

import { prisma } from "@/lib/prisma";

// First admin profile is used as the `createdById` for every seeded row.
// The catalog is owned by the company; per the spec the catalog admin
// page is admin-gated. Failing loudly here is correct — there must be at
// least one admin in the system before the catalog can be seeded.
async function getSeedActorId(): Promise<string> {
  const admin = await prisma.profile.findFirst({
    where: { role: "admin" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!admin) {
    throw new Error(
      "No admin profile found. Invite at least one admin user before seeding the renovation catalog.",
    );
  }
  return admin.id;
}

// --- Teams ----------------------------------------------------------

type TeamSeed = {
  name: string;
  specialty: string;
  totalPeople: number;
};

const TEAMS: TeamSeed[] = [
  { name: "Team 1", specialty: "Шпакловка и боя", totalPeople: 4 },
  { name: "Team 2", specialty: "Ламинат", totalPeople: 2 },
  { name: "Team 3", specialty: "Гранитогрес", totalPeople: 6 },
  { name: "Team 4", specialty: "Електро", totalPeople: 2 },
  { name: "Team 5", specialty: "ВиК", totalPeople: 3 },
  { name: "Team 6", specialty: "Санитария", totalPeople: 3 },
  { name: "Team 7", specialty: "Картонаджия", totalPeople: 2 },
];

// --- Activity templates ----------------------------------------------

// `team` is the seed team's `name` (or null for outsourced).
// Durations are in days, half-day granularity allowed.
type ActivitySeed = {
  sortOrder: number;
  name: string;
  team: string | null;
  peopleRequired: number;
  bathroomMultiplied: boolean;
  durationStudio: number;
  durationTwoRoom: number;
  durationThreeRoom: number;
  durationFourRoom: number;
};

const ACTIVITIES: ActivitySeed[] = [
  { sortOrder:  1, name: "Подготовка на обекта",                          team: null,       peopleRequired: 0, bathroomMultiplied: false, durationStudio: 1,   durationTwoRoom: 1,   durationThreeRoom: 1,   durationFourRoom: 1   },
  { sortOrder:  2, name: "Саморазлична замазка (при нужда)",              team: "Team 1",   peopleRequired: 1, bathroomMultiplied: false, durationStudio: 1,   durationTwoRoom: 1,   durationThreeRoom: 1,   durationFourRoom: 1   },
  { sortOrder:  3, name: "Монтаж гранитогрес — помещения",                team: "Team 3",   peopleRequired: 2, bathroomMultiplied: false, durationStudio: 3,   durationTwoRoom: 3,   durationThreeRoom: 4,   durationFourRoom: 5   },
  { sortOrder:  4, name: "Промени по ел. инсталация",                     team: "Team 4",   peopleRequired: 1, bathroomMultiplied: false, durationStudio: 2,   durationTwoRoom: 2,   durationThreeRoom: 2,   durationFourRoom: 3   },
  { sortOrder:  5, name: "Разводка бойлер",                               team: "Team 4",   peopleRequired: 1, bathroomMultiplied: false, durationStudio: 1,   durationTwoRoom: 1,   durationThreeRoom: 1,   durationFourRoom: 1   },
  { sortOrder:  6, name: "Промени по инсталация газ",                     team: null,       peopleRequired: 0, bathroomMultiplied: false, durationStudio: 2,   durationTwoRoom: 2,   durationThreeRoom: 2,   durationFourRoom: 2   },
  { sortOrder:  7, name: "Окачен таван — помещения, подготовка",          team: "Team 7",   peopleRequired: 1, bathroomMultiplied: false, durationStudio: 0.5, durationTwoRoom: 0.5, durationThreeRoom: 1,   durationFourRoom: 1   },
  { sortOrder:  8, name: "Хидроизолация баня",                            team: "Team 3",   peopleRequired: 1, bathroomMultiplied: true,  durationStudio: 1,   durationTwoRoom: 1,   durationThreeRoom: 1,   durationFourRoom: 1   },
  { sortOrder:  9, name: "Гипсокартон структура — баня",                  team: "Team 7",   peopleRequired: 1, bathroomMultiplied: false, durationStudio: 0.5, durationTwoRoom: 0.5, durationThreeRoom: 1,   durationFourRoom: 1   },
  { sortOrder: 10, name: "Окачен таван баня",                             team: "Team 7",   peopleRequired: 1, bathroomMultiplied: true,  durationStudio: 1,   durationTwoRoom: 1,   durationThreeRoom: 1,   durationFourRoom: 1   },
  { sortOrder: 11, name: "Монтаж структура баня",                         team: "Team 5",   peopleRequired: 1, bathroomMultiplied: true,  durationStudio: 1,   durationTwoRoom: 1,   durationThreeRoom: 2,   durationFourRoom: 2   },
  { sortOrder: 12, name: "Фина шпакловка и шкурене",                      team: "Team 1",   peopleRequired: 1, bathroomMultiplied: false, durationStudio: 2,   durationTwoRoom: 3,   durationThreeRoom: 3,   durationFourRoom: 4   },
  { sortOrder: 13, name: "Грунд",                                         team: "Team 1",   peopleRequired: 1, bathroomMultiplied: false, durationStudio: 0.5, durationTwoRoom: 0.5, durationThreeRoom: 0.5, durationFourRoom: 0.5 },
  { sortOrder: 14, name: "Латекс — 1-ва ръка",                            team: "Team 1",   peopleRequired: 1, bathroomMultiplied: false, durationStudio: 1,   durationTwoRoom: 2,   durationThreeRoom: 3,   durationFourRoom: 4   },
  { sortOrder: 15, name: "Гранитогрес / фаянс — баня",                    team: "Team 3",   peopleRequired: 2, bathroomMultiplied: true,  durationStudio: 8,   durationTwoRoom: 8,   durationThreeRoom: 12,  durationFourRoom: 12  },
  { sortOrder: 16, name: "Сифони монтаж",                                 team: "Team 3",   peopleRequired: 1, bathroomMultiplied: false, durationStudio: 1,   durationTwoRoom: 1,   durationThreeRoom: 1,   durationFourRoom: 1   },
  { sortOrder: 17, name: "Монтаж врата/и — баня",                         team: null,       peopleRequired: 0, bathroomMultiplied: true,  durationStudio: 1,   durationTwoRoom: 1,   durationThreeRoom: 2,   durationFourRoom: 2   },
  { sortOrder: 18, name: "Латекс — 2-ра ръка",                            team: "Team 1",   peopleRequired: 1, bathroomMultiplied: false, durationStudio: 1,   durationTwoRoom: 1,   durationThreeRoom: 2,   durationFourRoom: 2   },
  { sortOrder: 19, name: "Ламиниран паркет и первази",                    team: "Team 2",   peopleRequired: 0, bathroomMultiplied: false, durationStudio: 2,   durationTwoRoom: 2,   durationThreeRoom: 3,   durationFourRoom: 3   },
  { sortOrder: 20, name: "Монтаж интериорни врати",                       team: null,       peopleRequired: 0, bathroomMultiplied: false, durationStudio: 1,   durationTwoRoom: 1,   durationThreeRoom: 1,   durationFourRoom: 1   },
  { sortOrder: 21, name: "Монтаж санитария",                              team: "Team 6",   peopleRequired: 1, bathroomMultiplied: false, durationStudio: 1,   durationTwoRoom: 1,   durationThreeRoom: 2,   durationFourRoom: 2   },
  { sortOrder: 22, name: "Монтаж подпрозоречен камък",                    team: "Team 3",   peopleRequired: 1, bathroomMultiplied: false, durationStudio: 0.5, durationTwoRoom: 0.5, durationThreeRoom: 0.5, durationFourRoom: 0.5 },
  { sortOrder: 23, name: "Монтаж климатици",                              team: null,       peopleRequired: 0, bathroomMultiplied: false, durationStudio: 1,   durationTwoRoom: 1,   durationThreeRoom: 1,   durationFourRoom: 1   },
  { sortOrder: 24, name: "Монтаж газово котле и радиатори",               team: null,       peopleRequired: 0, bathroomMultiplied: false, durationStudio: 2,   durationTwoRoom: 2,   durationThreeRoom: 3,   durationFourRoom: 3   },
  { sortOrder: 25, name: "Монтаж бойлер",                                 team: "Team 5",   peopleRequired: 0, bathroomMultiplied: false, durationStudio: 1,   durationTwoRoom: 1,   durationThreeRoom: 1,   durationFourRoom: 1   },
  { sortOrder: 26, name: "Монтаж комарници",                              team: null,       peopleRequired: 0, bathroomMultiplied: false, durationStudio: 0.5, durationTwoRoom: 0.5, durationThreeRoom: 0.5, durationFourRoom: 0.5 },
  { sortOrder: 27, name: "Монтаж на ел. консумативи",                     team: "Team 4",   peopleRequired: 1, bathroomMultiplied: false, durationStudio: 1,   durationTwoRoom: 1,   durationThreeRoom: 1,   durationFourRoom: 1   },
  { sortOrder: 28, name: "Други допълнения",                              team: null,       peopleRequired: 0, bathroomMultiplied: false, durationStudio: 1,   durationTwoRoom: 1,   durationThreeRoom: 1,   durationFourRoom: 1   },
  { sortOrder: 29, name: "Финално почистване",                            team: null,       peopleRequired: 0, bathroomMultiplied: false, durationStudio: 1,   durationTwoRoom: 1,   durationThreeRoom: 2,   durationFourRoom: 2   },
];

async function main() {
  const actorId = await getSeedActorId();

  // Teams ----------------------------------------------------------
  console.log("Seeding teams...");
  const teamIdsByName = new Map<string, string>();
  for (const t of TEAMS) {
    // Find a non-deleted row by name; if it exists, update; else create.
    const existing = await prisma.team.findFirst({
      where: { name: t.name, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      await prisma.team.update({
        where: { id: existing.id },
        data: {
          specialty: t.specialty,
          totalPeople: t.totalPeople,
        },
      });
      teamIdsByName.set(t.name, existing.id);
      console.log(`  · updated ${t.name} (${t.specialty}, ${t.totalPeople})`);
    } else {
      const created = await prisma.team.create({
        data: {
          name: t.name,
          specialty: t.specialty,
          totalPeople: t.totalPeople,
          createdById: actorId,
        },
        select: { id: true },
      });
      teamIdsByName.set(t.name, created.id);
      console.log(`  + created ${t.name} (${t.specialty}, ${t.totalPeople})`);
    }
  }

  // Activity templates --------------------------------------------
  console.log("\nSeeding activity templates...");
  for (const a of ACTIVITIES) {
    const teamId = a.team ? teamIdsByName.get(a.team) ?? null : null;
    if (a.team && !teamId) {
      throw new Error(`Activity "${a.name}" references unknown team "${a.team}"`);
    }
    const existing = await prisma.activityTemplate.findFirst({
      where: { name: a.name, deletedAt: null },
      select: { id: true },
    });
    const data = {
      name: a.name,
      teamId,
      peopleRequired: a.peopleRequired,
      bathroomMultiplied: a.bathroomMultiplied,
      durationStudio: a.durationStudio,
      durationTwoRoom: a.durationTwoRoom,
      durationThreeRoom: a.durationThreeRoom,
      durationFourRoom: a.durationFourRoom,
      sortOrder: a.sortOrder,
    };
    if (existing) {
      await prisma.activityTemplate.update({ where: { id: existing.id }, data });
      console.log(`  · updated [${a.sortOrder}] ${a.name}`);
    } else {
      await prisma.activityTemplate.create({
        data: { ...data, createdById: actorId },
      });
      console.log(`  + created [${a.sortOrder}] ${a.name}`);
    }
  }

  console.log("\nDone.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
