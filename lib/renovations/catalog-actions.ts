import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/auth/audit";
import type { Prisma } from "@prisma/client";

// Admin-managed catalog mutations for Teams + ActivityTemplates. All calls
// are admin-only; callers (the server-action wrappers in
// app/(app)/admin/renovations/...) enforce the role with
// `requireRole("admin")` before invoking these.
//
// See `specs/renovations.md` §9 for the admin pages, §3.6 + §3.7 for the
// model shape, and §10 for the audit taxonomy.

type ActorContext = { actorId: string };

export type CatalogMutationResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

// --- Teams ----------------------------------------------------------

type TeamInput = {
  name: string;
  specialty: string | null;
  totalPeople: number;
};

export async function createTeam(
  input: TeamInput,
  actor: ActorContext,
): Promise<CatalogMutationResult> {
  const name = input.name.trim();
  const specialty = input.specialty?.trim() || null;
  if (!name) return { ok: false, error: "Въведете име на екипа." };
  if (name.length > 80) return { ok: false, error: "Името е твърде дълго (макс. 80 символа)." };
  if (specialty && specialty.length > 80) {
    return { ok: false, error: "Специалността е твърде дълга (макс. 80 символа)." };
  }
  if (!Number.isInteger(input.totalPeople) || input.totalPeople < 0) {
    return { ok: false, error: "Броят хора трябва да е цяло неотрицателно число." };
  }

  // Uniqueness among non-deleted rows is enforced here in the application
  // layer — Prisma's partial unique indexes aren't first-class.
  const dup = await prisma.team.findFirst({
    where: { name, deletedAt: null },
    select: { id: true },
  });
  if (dup) return { ok: false, error: "Екип с такова име вече съществува." };

  const created = await prisma.team.create({
    data: {
      name,
      specialty,
      totalPeople: input.totalPeople,
      createdById: actor.actorId,
    },
    select: { id: true },
  });

  await recordAuditEvent({
    actorId: actor.actorId,
    action: "team.created",
    targetType: "team",
    targetId: created.id,
    payload: { name, specialty, totalPeople: input.totalPeople },
  });

  return { ok: true, id: created.id };
}

type TeamPatch = Partial<{
  name: string;
  specialty: string | null;
  totalPeople: number;
}>;

export async function updateTeam(
  id: string,
  patch: TeamPatch,
  actor: ActorContext,
): Promise<CatalogMutationResult> {
  const current = await prisma.team.findUnique({ where: { id } });
  if (!current) return { ok: false, error: "Екипът не е намерен." };
  if (current.deletedAt) return { ok: false, error: "Екипът е изтрит." };

  const data: Prisma.TeamUpdateInput = {};
  // Plain mutable buckets — cast to Prisma.InputJsonValue at the recordAudit
  // call site. The shape (string-keyed primitive values) is trivially JSON-
  // serialisable; the cast just satisfies Prisma's read-only typing.
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};

  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) return { ok: false, error: "Името не може да е празно." };
    if (trimmed.length > 80) return { ok: false, error: "Името е твърде дълго." };
    if (trimmed !== current.name) {
      const dup = await prisma.team.findFirst({
        where: { name: trimmed, deletedAt: null, NOT: { id } },
        select: { id: true },
      });
      if (dup) return { ok: false, error: "Екип с такова име вече съществува." };
      data.name = trimmed;
      before.name = current.name;
      after.name = trimmed;
    }
  }
  if (patch.specialty !== undefined) {
    const trimmed = patch.specialty?.trim() ?? "";
    const next = trimmed === "" ? null : trimmed;
    if (next && next.length > 80) {
      return { ok: false, error: "Специалността е твърде дълга." };
    }
    if (next !== current.specialty) {
      data.specialty = next;
      before.specialty = current.specialty;
      after.specialty = next;
    }
  }
  if (patch.totalPeople !== undefined) {
    if (!Number.isInteger(patch.totalPeople) || patch.totalPeople < 0) {
      return { ok: false, error: "Броят хора трябва да е цяло неотрицателно число." };
    }
    if (patch.totalPeople !== current.totalPeople) {
      data.totalPeople = patch.totalPeople;
      before.totalPeople = current.totalPeople;
      after.totalPeople = patch.totalPeople;
    }
  }

  if (Object.keys(data).length === 0) return { ok: true, id };

  await prisma.team.update({ where: { id }, data });
  await recordAuditEvent({
    actorId: actor.actorId,
    action: "team.updated",
    targetType: "team",
    targetId: id,
    before: before as Prisma.InputJsonValue,
    after: after as Prisma.InputJsonValue,
  });

  return { ok: true, id };
}

export async function softDeleteTeam(
  id: string,
  actor: ActorContext,
): Promise<CatalogMutationResult> {
  const current = await prisma.team.findUnique({ where: { id } });
  if (!current) return { ok: false, error: "Екипът не е намерен." };
  if (current.deletedAt) return { ok: true, id };

  // Soft-delete is non-destructive — existing templates + activities keep
  // their teamId reference and remain readable. The deleted team simply
  // disappears from the team picker on new templates.
  await prisma.team.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      deletedById: actor.actorId,
    },
  });

  await recordAuditEvent({
    actorId: actor.actorId,
    action: "team.deleted",
    targetType: "team",
    targetId: id,
    payload: { name: current.name },
  });

  return { ok: true, id };
}

// --- Activity templates -------------------------------------------

type ActivityTemplateInput = {
  name: string;
  teamId: string | null;
  peopleRequired: number;
  bathroomMultiplied: boolean;
  durationStudio: number;
  durationTwoRoom: number;
  durationThreeRoom: number;
  durationFourRoom: number;
  sortOrder?: number;
};

function validateDuration(value: unknown, label: string): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return `${label}: продължителността трябва да е неотрицателно число.`;
  }
  // Half-day granularity — multiples of 0.5.
  if (Math.round(value * 2) !== value * 2) {
    return `${label}: позволени са само цели и половин дни (стъпка 0.5).`;
  }
  return null;
}

export async function createActivityTemplate(
  input: ActivityTemplateInput,
  actor: ActorContext,
): Promise<CatalogMutationResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Въведете име на дейността." };
  if (name.length > 200) return { ok: false, error: "Името е твърде дълго (макс. 200 символа)." };
  if (!Number.isInteger(input.peopleRequired) || input.peopleRequired < 0) {
    return { ok: false, error: "Броят хора трябва да е цяло неотрицателно число." };
  }
  for (const [v, label] of [
    [input.durationStudio, "Едностаен"],
    [input.durationTwoRoom, "Двустаен"],
    [input.durationThreeRoom, "Тристаен"],
    [input.durationFourRoom, "Четиристаен"],
  ] as const) {
    const err = validateDuration(v, label);
    if (err) return { ok: false, error: err };
  }
  if (input.teamId) {
    const team = await prisma.team.findUnique({
      where: { id: input.teamId },
      select: { deletedAt: true },
    });
    if (!team || team.deletedAt) {
      return { ok: false, error: "Избраният екип не съществува." };
    }
  }

  // Default sortOrder = max + 1 if not specified, so new rows land last.
  let sortOrder = input.sortOrder;
  if (sortOrder === undefined) {
    const max = await prisma.activityTemplate.aggregate({
      _max: { sortOrder: true },
      where: { deletedAt: null },
    });
    sortOrder = (max._max.sortOrder ?? 0) + 1;
  }

  const created = await prisma.activityTemplate.create({
    data: {
      name,
      teamId: input.teamId,
      peopleRequired: input.peopleRequired,
      bathroomMultiplied: input.bathroomMultiplied,
      durationStudio: input.durationStudio,
      durationTwoRoom: input.durationTwoRoom,
      durationThreeRoom: input.durationThreeRoom,
      durationFourRoom: input.durationFourRoom,
      sortOrder,
      createdById: actor.actorId,
    },
    select: { id: true },
  });

  await recordAuditEvent({
    actorId: actor.actorId,
    action: "activity_template.created",
    targetType: "activity_template",
    targetId: created.id,
    payload: {
      name,
      teamId: input.teamId,
      peopleRequired: input.peopleRequired,
      bathroomMultiplied: input.bathroomMultiplied,
    },
  });

  return { ok: true, id: created.id };
}

type ActivityTemplatePatch = Partial<{
  name: string;
  teamId: string | null;
  peopleRequired: number;
  bathroomMultiplied: boolean;
  durationStudio: number;
  durationTwoRoom: number;
  durationThreeRoom: number;
  durationFourRoom: number;
}>;

export async function updateActivityTemplate(
  id: string,
  patch: ActivityTemplatePatch,
  actor: ActorContext,
): Promise<CatalogMutationResult> {
  const current = await prisma.activityTemplate.findUnique({ where: { id } });
  if (!current) return { ok: false, error: "Дейността не е намерена." };
  if (current.deletedAt) return { ok: false, error: "Дейността е изтрита." };

  const data: Prisma.ActivityTemplateUpdateInput = {};
  // Plain mutable buckets — cast to Prisma.InputJsonValue at the recordAudit
  // call site. The shape (string-keyed primitive values) is trivially JSON-
  // serialisable; the cast just satisfies Prisma's read-only typing.
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};

  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) return { ok: false, error: "Името не може да е празно." };
    if (trimmed.length > 200) return { ok: false, error: "Името е твърде дълго." };
    if (trimmed !== current.name) {
      data.name = trimmed;
      before.name = current.name;
      after.name = trimmed;
    }
  }
  if (patch.teamId !== undefined) {
    if (patch.teamId) {
      const team = await prisma.team.findUnique({
        where: { id: patch.teamId },
        select: { deletedAt: true },
      });
      if (!team || team.deletedAt) {
        return { ok: false, error: "Избраният екип не съществува." };
      }
    }
    if (patch.teamId !== current.teamId) {
      data.team = patch.teamId
        ? { connect: { id: patch.teamId } }
        : { disconnect: true };
      before.teamId = current.teamId;
      after.teamId = patch.teamId;
    }
  }
  if (patch.peopleRequired !== undefined) {
    if (!Number.isInteger(patch.peopleRequired) || patch.peopleRequired < 0) {
      return { ok: false, error: "Броят хора трябва да е цяло неотрицателно число." };
    }
    if (patch.peopleRequired !== current.peopleRequired) {
      data.peopleRequired = patch.peopleRequired;
      before.peopleRequired = current.peopleRequired;
      after.peopleRequired = patch.peopleRequired;
    }
  }
  if (patch.bathroomMultiplied !== undefined && patch.bathroomMultiplied !== current.bathroomMultiplied) {
    data.bathroomMultiplied = patch.bathroomMultiplied;
    before.bathroomMultiplied = current.bathroomMultiplied;
    after.bathroomMultiplied = patch.bathroomMultiplied;
  }
  for (const field of [
    "durationStudio",
    "durationTwoRoom",
    "durationThreeRoom",
    "durationFourRoom",
  ] as const) {
    const v = patch[field];
    if (v === undefined) continue;
    const err = validateDuration(v, field);
    if (err) return { ok: false, error: err };
    if (Number(current[field]) !== v) {
      data[field] = v;
      before[field] = Number(current[field]);
      after[field] = v;
    }
  }

  if (Object.keys(data).length === 0) return { ok: true, id };

  await prisma.activityTemplate.update({ where: { id }, data });
  await recordAuditEvent({
    actorId: actor.actorId,
    action: "activity_template.updated",
    targetType: "activity_template",
    targetId: id,
    before: before as Prisma.InputJsonValue,
    after: after as Prisma.InputJsonValue,
  });

  return { ok: true, id };
}

export async function softDeleteActivityTemplate(
  id: string,
  actor: ActorContext,
): Promise<CatalogMutationResult> {
  const current = await prisma.activityTemplate.findUnique({ where: { id } });
  if (!current) return { ok: false, error: "Дейността не е намерена." };
  if (current.deletedAt) return { ok: true, id };

  await prisma.activityTemplate.update({
    where: { id },
    data: { deletedAt: new Date(), deletedById: actor.actorId },
  });

  await recordAuditEvent({
    actorId: actor.actorId,
    action: "activity_template.deleted",
    targetType: "activity_template",
    targetId: id,
    payload: { name: current.name },
  });

  return { ok: true, id };
}

export async function reorderActivityTemplates(
  orderedIds: string[],
  actor: ActorContext,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (orderedIds.length === 0) return { ok: true };

  // Verify all ids exist + are non-deleted in a single round-trip.
  const found = await prisma.activityTemplate.findMany({
    where: { id: { in: orderedIds }, deletedAt: null },
    select: { id: true, sortOrder: true },
  });
  if (found.length !== orderedIds.length) {
    return { ok: false, error: "Една или повече дейности не са намерени." };
  }
  const beforeMap = new Map(found.map((r) => [r.id, r.sortOrder]));

  // Reassign sortOrder by position. Use a transaction so partial writes
  // don't leave the catalog in a half-reordered state.
  await prisma.$transaction(
    orderedIds.map((id, idx) =>
      prisma.activityTemplate.update({
        where: { id },
        data: { sortOrder: idx + 1 },
      }),
    ),
  );

  await recordAuditEvent({
    actorId: actor.actorId,
    action: "activity_template.reordered",
    targetType: "activity_template",
    payload: {
      before: orderedIds.map((id) => ({ id, sortOrder: beforeMap.get(id) })),
      after: orderedIds.map((id, idx) => ({ id, sortOrder: idx + 1 })),
    },
  });

  return { ok: true };
}
