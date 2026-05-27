import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/auth/audit";

// Building CRUD used by /admin/buildings. All calls admin-only; callers
// enforce the role with requireRole("admin") before invoking.

type BuildingInput = {
  storageName: string;
  displayName: string;
  complex: string | null;
};

type ActorContext = {
  actorId: string | null;
};

export type BuildingMutationResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createBuilding(
  input: BuildingInput,
  actor: ActorContext,
): Promise<BuildingMutationResult> {
  const storageName = input.storageName.trim();
  const displayName = input.displayName.trim();
  const complex = input.complex?.trim() || null;

  if (!storageName) return { ok: false, error: "Въведете системно име." };
  if (!displayName) return { ok: false, error: "Въведете име за показване." };

  const existing = await prisma.building.findUnique({
    where: { storageName },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: "Сграда с това системно име вече съществува." };
  }

  const created = await prisma.building.create({
    data: { storageName, displayName, complex, active: true },
  });

  await recordAuditEvent({
    actorId: actor.actorId,
    action: "building.created",
    targetType: "building",
    targetId: created.id,
    payload: { storageName, displayName, complex },
  });

  return { ok: true, id: created.id };
}

type BuildingPatch = Partial<{
  displayName: string;
  complex: string | null;
  active: boolean;
}>;

export async function updateBuilding(
  id: string,
  patch: BuildingPatch,
  actor: ActorContext,
): Promise<BuildingMutationResult> {
  const current = await prisma.building.findUnique({ where: { id } });
  if (!current) return { ok: false, error: "Сградата не е намерена." };

  const data: BuildingPatch = {};
  if (patch.displayName !== undefined) {
    const trimmed = patch.displayName.trim();
    if (!trimmed) return { ok: false, error: "Името не може да е празно." };
    data.displayName = trimmed;
  }
  if (patch.complex !== undefined) {
    const trimmed = patch.complex?.trim() ?? "";
    data.complex = trimmed === "" ? null : trimmed;
  }
  if (patch.active !== undefined) data.active = patch.active;

  if (Object.keys(data).length === 0) return { ok: true, id };

  const updated = await prisma.building.update({ where: { id }, data });

  const isDeactivation = patch.active === false && current.active;
  const isReactivation = patch.active === true && !current.active;

  await recordAuditEvent({
    actorId: actor.actorId,
    action: isDeactivation ? "building.deactivated" : "building.updated",
    targetType: "building",
    targetId: id,
    before: {
      displayName: current.displayName,
      complex: current.complex,
      active: current.active,
    },
    after: {
      displayName: updated.displayName,
      complex: updated.complex,
      active: updated.active,
      ...(isReactivation ? { reactivated: true } : {}),
    },
  });

  return { ok: true, id };
}

// Hard delete — allowed only when no Property references the building.
// Admins are expected to deactivate instead in normal use.
export async function deleteBuilding(
  id: string,
  actor: ActorContext,
): Promise<BuildingMutationResult> {
  const current = await prisma.building.findUnique({
    where: { id },
    include: { _count: { select: { properties: true } } },
  });
  if (!current) return { ok: false, error: "Сградата не е намерена." };
  if (current._count.properties > 0) {
    return {
      ok: false,
      error: "Сградата не може да бъде изтрита, защото има свързани имоти. Ако искаш да я скриеш, деактивирай я.",
    };
  }

  await prisma.building.delete({ where: { id } });

  await recordAuditEvent({
    actorId: actor.actorId,
    action: "building.deleted",
    targetType: "building",
    targetId: id,
    payload: {
      storageName: current.storageName,
      displayName: current.displayName,
      complex: current.complex,
    },
  });

  return { ok: true, id };
}
