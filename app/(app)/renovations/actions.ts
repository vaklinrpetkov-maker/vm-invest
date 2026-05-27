"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import type { Prisma, RenovationStatus, RenovationTaskStatus } from "@prisma/client";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  autoStampDatesFor,
} from "@/lib/renovations/queries";
import {
  isValidRenovationStatus,
  isValidRenovationTaskStatus,
} from "@/lib/renovations/constants";
import {
  chainLoadActivities,
  computePlannedEndDate,
  type ChainLoadTemplate,
} from "@/lib/renovations/chain-load";
import {
  parseRenovationCreateFormData,
  parseRenovationEditFormData,
  type RenovationFormState,
} from "@/lib/renovations/parse";
import {
  canCreateRenovation,
  canDeleteRenovation,
  canEditRenovation,
} from "@/lib/renovations/permissions";

// Server actions for /renovations. Rewritten 20.05.2026 for the template-
// driven activity model:
//   - createRenovation seeds RenovationActivity rows via chain-load.
//   - The detail page uses per-activity inline setters in place of the old
//     RenovationTask setters.
//   - Renovation.plannedEndDate is recomputed + cached on every write that
//     could affect it (chain-load, activity date edit, activity delete,
//     activity status change to/from cancelled, rechain).
//
// Old task actions are gone. RenovationTask rows from before the pivot
// remain in the DB but no UI surfaces them; cleanup in Round 5.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type AuditAction =
  | "renovation.created"
  | "renovation.updated"
  | "renovation.field.updated"
  | "renovation.deleted"
  | "renovation.status_changed"
  | "renovation.activity.created"
  | "renovation.activity.updated"
  | "renovation.activity.status_changed"
  | "renovation.activity.deleted"
  | "renovation.activity.reordered"
  | "renovation.activity.rechained";

async function logEvent(args: {
  actorId: string;
  action: AuditAction;
  targetId: string;
  targetType: "renovation" | "renovation_activity";
  payload?: Prisma.InputJsonValue;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}): Promise<void> {
  const hdrs = await headers();
  await recordAuditEvent({
    actorId: args.actorId,
    action: args.action,
    targetType: args.targetType,
    targetId: args.targetId,
    payload: args.payload,
    before: args.before,
    after: args.after,
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });
}

// Recompute + cache `Renovation.plannedEndDate` from its activities. Called
// after every write that could affect the value. Cheap query — one
// findMany scoped to the renovation, one update. No-op when the cached
// value already matches.
async function recomputePlannedEndDate(
  tx: Prisma.TransactionClient,
  renovationId: string,
): Promise<void> {
  const activities = await tx.renovationActivity.findMany({
    where: { renovationId },
    select: { endDate: true, status: true },
  });
  const next = computePlannedEndDate(activities);
  await tx.renovation.update({
    where: { id: renovationId },
    data: { plannedEndDate: next },
  });
}

// ─── Create ───────────────────────────────────────────────────────────────

export async function createRenovation(
  _prev: RenovationFormState,
  formData: FormData,
): Promise<RenovationFormState> {
  const me = await requireProfile();
  if (!canCreateRenovation(me.role)) {
    return { errors: { form: "Нямате достъп до създаването на ремонт." } };
  }
  const parsed = parseRenovationCreateFormData(formData);
  if (!parsed.ok) return { errors: parsed.errors, warnings: parsed.warnings };

  // Verify the property exists.
  const property = await prisma.property.findUnique({
    where: { id: parsed.data.propertyId },
    select: { id: true, deletedAt: true },
  });
  if (!property || property.deletedAt !== null) {
    return { errors: { propertyId: "Имотът не съществува." } };
  }

  // Resolve the selected templates in catalog order so the chain-load
  // produces a sensible default sequence even if the operator ticked
  // checkboxes in a different order.
  const templates: ChainLoadTemplate[] = parsed.data.selectedTemplateIds.length
    ? (await prisma.activityTemplate.findMany({
        where: {
          id: { in: parsed.data.selectedTemplateIds },
          deletedAt: null,
        },
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
        },
      })).map((t) => ({
        id: t.id,
        name: t.name,
        teamId: t.teamId,
        peopleRequired: t.peopleRequired,
        bathroomMultiplied: t.bathroomMultiplied,
        durationStudio: Number(t.durationStudio),
        durationTwoRoom: Number(t.durationTwoRoom),
        durationThreeRoom: Number(t.durationThreeRoom),
        durationFourRoom: Number(t.durationFourRoom),
        sortOrder: t.sortOrder,
      }))
    : [];

  // Chain-load only runs if the user supplied a start date AND selected at
  // least one activity. Otherwise we create an empty renovation; operator
  // can add activities + set the start date later.
  const chainLoaded = parsed.data.plannedStartDate && templates.length > 0
    ? chainLoadActivities({
        plannedStartDate: parsed.data.plannedStartDate,
        apartmentSize: parsed.data.apartmentSize,
        bathroomCount: parsed.data.bathroomCount,
        templates,
      })
    : [];

  // managerId defaults to the creator on insert (spec §3.1).
  const managerId = parsed.data.managerId ?? me.id;

  const created = await prisma.$transaction(async (tx) => {
    const r = await tx.renovation.create({
      data: {
        status: parsed.data.status,
        description: parsed.data.description,
        propertyId: parsed.data.propertyId,
        apartmentSize: parsed.data.apartmentSize,
        bathroomCount: parsed.data.bathroomCount,
        requestedByContactId: parsed.data.requestedByContactId,
        managerId,
        plannedStartDate: parsed.data.plannedStartDate,
        // plannedEndDate set after the chain-load below.
        actualStartDate: parsed.data.actualStartDate,
        actualEndDate: parsed.data.actualEndDate,
        createdById: me.id,
      },
    });

    if (chainLoaded.length > 0) {
      await tx.renovationActivity.createMany({
        data: chainLoaded.map((a) => ({
          renovationId: r.id,
          templateId: a.templateId,
          name: a.name,
          teamId: a.teamId,
          peopleRequired: a.peopleRequired,
          durationDays: a.durationDays,
          startDate: a.startDate,
          endDate: a.endDate,
          sortOrder: a.sortOrder,
          createdById: me.id,
        })),
      });
      await recomputePlannedEndDate(tx, r.id);
    }

    // Seed the status-history with the initial transition.
    await tx.renovationStatusHistory.create({
      data: {
        renovationId: r.id,
        fromStatus: null,
        toStatus: r.status,
        authorId: me.id,
        note: "Създаване на ремонт",
      },
    });

    return r;
  });

  await logEvent({
    actorId: me.id,
    action: "renovation.created",
    targetType: "renovation",
    targetId: created.id,
    payload: {
      propertyId: created.propertyId,
      status: created.status,
      apartmentSize: created.apartmentSize,
      bathroomCount: created.bathroomCount,
      activityCount: chainLoaded.length,
    },
  });

  revalidatePath("/renovations");
  revalidatePath(`/properties/${parsed.data.propertyId}`);
  if (parsed.data.requestedByContactId) {
    revalidatePath(`/contacts/${parsed.data.requestedByContactId}`);
  }
  return { createdRenovationId: created.id };
}

// ─── Update (full-form edit) ──────────────────────────────────────────────
// apartmentSize + bathroomCount are NOT editable post-create — see parse.ts.
// The edit form covers status / description / manager / requestedBy /
// dates only.

export async function updateRenovation(
  renovationId: string,
  _prev: RenovationFormState,
  formData: FormData,
): Promise<RenovationFormState> {
  const me = await requireProfile();
  if (!UUID_RE.test(renovationId)) {
    return { errors: { form: "Невалиден ремонт." } };
  }
  const existing = await prisma.renovation.findUnique({
    where: { id: renovationId },
  });
  if (!existing || existing.deletedAt !== null) {
    return { errors: { form: "Ремонтът не е намерен." } };
  }
  if (!canEditRenovation(me.role, existing.managerId, me.id)) {
    return { errors: { form: "Нямате достъп до редактирането на този ремонт." } };
  }

  const parsed = parseRenovationEditFormData(formData);
  if (!parsed.ok) return { errors: parsed.errors, warnings: parsed.warnings };

  const property = await prisma.property.findUnique({
    where: { id: parsed.data.propertyId },
    select: { id: true, deletedAt: true },
  });
  if (!property || property.deletedAt !== null) {
    return { errors: { propertyId: "Имотът не съществува." } };
  }

  const statusChanged = existing.status !== parsed.data.status;

  const updated = await prisma.$transaction(async (tx) => {
    const stamps = statusChanged
      ? autoStampDatesFor(parsed.data.status, {
          actualStartDate: existing.actualStartDate,
          actualEndDate: existing.actualEndDate,
        })
      : {};

    const r = await tx.renovation.update({
      where: { id: renovationId },
      data: {
        status: parsed.data.status,
        description: parsed.data.description,
        propertyId: parsed.data.propertyId,
        requestedByContactId: parsed.data.requestedByContactId,
        managerId: parsed.data.managerId,
        plannedStartDate: parsed.data.plannedStartDate,
        actualStartDate: parsed.data.actualStartDate ?? stamps.actualStartDate ?? null,
        actualEndDate: parsed.data.actualEndDate ?? stamps.actualEndDate ?? null,
      },
    });
    if (statusChanged) {
      await tx.renovationStatusHistory.create({
        data: {
          renovationId: r.id,
          fromStatus: existing.status,
          toStatus: r.status,
          authorId: me.id,
        },
      });
    }
    return r;
  });

  await logEvent({
    actorId: me.id,
    action: "renovation.updated",
    targetType: "renovation",
    targetId: renovationId,
    before: { status: existing.status },
    after: { status: updated.status },
  });
  if (statusChanged) {
    await logEvent({
      actorId: me.id,
      action: "renovation.status_changed",
      targetType: "renovation",
      targetId: renovationId,
      payload: { from: existing.status, to: updated.status },
    });
  }

  revalidatePath("/renovations");
  revalidatePath(`/renovations/${renovationId}`);
  revalidatePath(`/properties/${updated.propertyId}`);
  if (updated.requestedByContactId) {
    revalidatePath(`/contacts/${updated.requestedByContactId}`);
  }
  redirect(`/renovations/${renovationId}` as Route);
}

// ─── Soft-delete ──────────────────────────────────────────────────────────

export async function deleteRenovation(formData: FormData): Promise<void> {
  const me = await requireProfile();
  if (!canDeleteRenovation(me.role)) return;
  const id = String(formData.get("renovationId") ?? "");
  if (!UUID_RE.test(id)) return;

  const existing = await prisma.renovation.findUnique({ where: { id } });
  if (!existing || existing.deletedAt !== null) return;

  await prisma.renovation.update({
    where: { id },
    data: { deletedAt: new Date(), deletedById: me.id },
  });

  await logEvent({
    actorId: me.id,
    action: "renovation.deleted",
    targetType: "renovation",
    targetId: id,
    payload: { propertyId: existing.propertyId },
  });

  revalidatePath("/renovations");
  revalidatePath(`/properties/${existing.propertyId}`);
  if (existing.requestedByContactId) {
    revalidatePath(`/contacts/${existing.requestedByContactId}`);
  }
  redirect("/renovations" as Route);
}

// ─── Status change (inline action) ────────────────────────────────────────

export type SetStatusResult = { ok: true } | { ok: false; error: string };

export async function setRenovationStatus(
  renovationId: string,
  newStatus: RenovationStatus,
): Promise<SetStatusResult> {
  const me = await requireProfile();
  if (!UUID_RE.test(renovationId)) {
    return { ok: false, error: "Невалиден ремонт." };
  }
  if (!isValidRenovationStatus(newStatus)) {
    return { ok: false, error: "Невалиден статус." };
  }
  const existing = await prisma.renovation.findUnique({
    where: { id: renovationId },
    select: {
      id: true,
      status: true,
      managerId: true,
      propertyId: true,
      requestedByContactId: true,
      actualStartDate: true,
      actualEndDate: true,
      deletedAt: true,
    },
  });
  if (!existing || existing.deletedAt !== null) {
    return { ok: false, error: "Ремонтът не е намерен." };
  }
  if (!canEditRenovation(me.role, existing.managerId, me.id)) {
    return { ok: false, error: "Нямате право да променяте този ремонт." };
  }
  if (existing.status === newStatus) return { ok: true };

  const stamps = autoStampDatesFor(newStatus, {
    actualStartDate: existing.actualStartDate,
    actualEndDate: existing.actualEndDate,
  });

  await prisma.$transaction(async (tx) => {
    await tx.renovation.update({
      where: { id: renovationId },
      data: { status: newStatus, ...stamps },
    });
    await tx.renovationStatusHistory.create({
      data: {
        renovationId,
        fromStatus: existing.status,
        toStatus: newStatus,
        authorId: me.id,
      },
    });
  });

  await logEvent({
    actorId: me.id,
    action: "renovation.status_changed",
    targetType: "renovation",
    targetId: renovationId,
    payload: { from: existing.status, to: newStatus },
  });

  revalidatePath("/renovations");
  revalidatePath(`/renovations/${renovationId}`);
  revalidatePath(`/properties/${existing.propertyId}`);
  if (existing.requestedByContactId) {
    revalidatePath(`/contacts/${existing.requestedByContactId}`);
  }
  return { ok: true };
}

// ─── Per-field renovation setters (R7 inline edits on detail page) ────────
//
// Three date setters for the detail page's Dates panel — `plannedStartDate`
// (user input; does NOT auto-rechain activities per spec §6.2), plus
// `actualStartDate` / `actualEndDate` (user override; would otherwise be
// auto-stamped on status transitions per §3.1). Each emits one
// `renovation.field.updated` audit event with `{ field, before, after }` —
// same shape as `contact.field.updated`, `tasks.field.updated`.
//
// `plannedEndDate` is derived (MAX(activity.endDate)) — no setter exposed;
// the detail page renders it with a 🔒 ReadOnlyBadge.

type RenovationDateField = "plannedStartDate" | "actualStartDate" | "actualEndDate";

async function loadRenovationAndGate(
  renovationId: string,
): Promise<
  | {
      ok: true;
      actorId: string;
      existing: {
        id: string;
        managerId: string | null;
        propertyId: string;
        requestedByContactId: string | null;
        plannedStartDate: Date | null;
        actualStartDate: Date | null;
        actualEndDate: Date | null;
      };
    }
  | { ok: false; error: string }
> {
  const me = await requireProfile();
  if (!UUID_RE.test(renovationId)) {
    return { ok: false, error: "Невалиден ремонт." };
  }
  const existing = await prisma.renovation.findUnique({
    where: { id: renovationId },
    select: {
      id: true,
      managerId: true,
      propertyId: true,
      requestedByContactId: true,
      plannedStartDate: true,
      actualStartDate: true,
      actualEndDate: true,
      deletedAt: true,
    },
  });
  if (!existing || existing.deletedAt !== null) {
    return { ok: false, error: "Ремонтът не е намерен." };
  }
  if (!canEditRenovation(me.role, existing.managerId, me.id)) {
    return { ok: false, error: "Нямате право да редактирате този ремонт." };
  }
  return {
    ok: true,
    actorId: me.id,
    existing: {
      id: existing.id,
      managerId: existing.managerId,
      propertyId: existing.propertyId,
      requestedByContactId: existing.requestedByContactId,
      plannedStartDate: existing.plannedStartDate,
      actualStartDate: existing.actualStartDate,
      actualEndDate: existing.actualEndDate,
    },
  };
}

async function setRenovationDateField(
  renovationId: string,
  field: RenovationDateField,
  newIso: string | null,
): Promise<SetStatusResult> {
  const gate = await loadRenovationAndGate(renovationId);
  if (!gate.ok) return gate;

  let next: Date | null = null;
  if (newIso !== null && newIso.length > 0) {
    if (!ISO_DATE_RE.test(newIso)) {
      return { ok: false, error: "Невалидна дата." };
    }
    next = new Date(`${newIso}T00:00:00Z`);
    if (Number.isNaN(next.getTime())) {
      return { ok: false, error: "Невалидна дата." };
    }
  }

  const beforeIso =
    gate.existing[field] !== null
      ? gate.existing[field]!.toISOString().slice(0, 10)
      : null;
  const nextIso = next ? next.toISOString().slice(0, 10) : null;
  if (beforeIso === nextIso) return { ok: true };

  await prisma.renovation.update({
    where: { id: renovationId },
    data: { [field]: next },
  });

  await logEvent({
    actorId: gate.actorId,
    action: "renovation.field.updated",
    targetType: "renovation",
    targetId: renovationId,
    payload: { field } as Prisma.InputJsonValue,
    before: { [field]: beforeIso } as Prisma.InputJsonValue,
    after: { [field]: nextIso } as Prisma.InputJsonValue,
  });

  revalidatePath("/renovations");
  revalidatePath(`/renovations/${renovationId}`);
  revalidatePath(`/properties/${gate.existing.propertyId}`);
  if (gate.existing.requestedByContactId) {
    revalidatePath(`/contacts/${gate.existing.requestedByContactId}`);
  }
  return { ok: true };
}

export async function setRenovationPlannedStartDate(
  renovationId: string,
  newIso: string | null,
): Promise<SetStatusResult> {
  return setRenovationDateField(renovationId, "plannedStartDate", newIso);
}

export async function setRenovationActualStartDate(
  renovationId: string,
  newIso: string | null,
): Promise<SetStatusResult> {
  return setRenovationDateField(renovationId, "actualStartDate", newIso);
}

export async function setRenovationActualEndDate(
  renovationId: string,
  newIso: string | null,
): Promise<SetStatusResult> {
  return setRenovationDateField(renovationId, "actualEndDate", newIso);
}

// Inline edit of the responsible manager from the list table or any other
// surface that wires an <InlinePersonCell>. Same gate as the other per-
// field setters; emits `renovation.field.updated` with the before/after
// profile ids + names so the audit log surfaces the human-readable change.
export async function setRenovationManager(
  renovationId: string,
  newManagerId: string | null,
): Promise<SetStatusResult> {
  const gate = await loadRenovationAndGate(renovationId);
  if (!gate.ok) return gate;
  if (newManagerId !== null && !UUID_RE.test(newManagerId)) {
    return { ok: false, error: "Невалиден отговорник." };
  }
  if (gate.existing.managerId === newManagerId) return { ok: true };

  // Resolve before/after labels for the audit payload — single profile
  // lookup since the before-id is already on the gate result.
  const ids = [gate.existing.managerId, newManagerId].filter(
    (id): id is string => id !== null,
  );
  const profiles = ids.length
    ? await prisma.profile.findMany({
        where: { id: { in: ids } },
        select: { id: true, fullName: true, active: true },
      })
    : [];
  const beforeProfile = profiles.find((p) => p.id === gate.existing.managerId) ?? null;
  const afterProfile = profiles.find((p) => p.id === newManagerId) ?? null;
  if (newManagerId !== null && !afterProfile) {
    return { ok: false, error: "Отговорникът не съществува." };
  }

  await prisma.renovation.update({
    where: { id: renovationId },
    data: { managerId: newManagerId },
  });

  await logEvent({
    actorId: gate.actorId,
    action: "renovation.field.updated",
    targetType: "renovation",
    targetId: renovationId,
    payload: { field: "managerId" } as Prisma.InputJsonValue,
    before: {
      managerId: gate.existing.managerId,
      managerName: beforeProfile?.fullName ?? null,
    } as Prisma.InputJsonValue,
    after: {
      managerId: newManagerId,
      managerName: afterProfile?.fullName ?? null,
    } as Prisma.InputJsonValue,
  });

  revalidatePath("/renovations");
  revalidatePath(`/renovations/${renovationId}`);
  return { ok: true };
}

// ─── Activity CRUD ────────────────────────────────────────────────────────

export type ActivityResult = { ok: true } | { ok: false; error: string };

// Shared gate for all activity mutations — admin / manager / renovation
// manager. There's no per-activity assignee (locked spec §7), so the gate
// is purely per-renovation.
async function loadActivityAndGate(activityId: string): Promise<
  | {
      ok: true;
      existing: {
        id: string;
        renovationId: string;
        name: string;
        teamId: string | null;
        peopleRequired: number;
        durationDays: number;
        startDate: Date | null;
        endDate: Date | null;
        status: RenovationTaskStatus;
        sortOrder: number;
      };
      actorId: string;
    }
  | { ok: false; error: string }
> {
  const me = await requireProfile();
  if (!UUID_RE.test(activityId)) return { ok: false, error: "Невалидна дейност." };
  const existing = await prisma.renovationActivity.findUnique({
    where: { id: activityId },
    include: {
      renovation: { select: { managerId: true, deletedAt: true } },
    },
  });
  if (!existing || existing.renovation.deletedAt !== null) {
    return { ok: false, error: "Дейността не е намерена." };
  }
  if (!canEditRenovation(me.role, existing.renovation.managerId, me.id)) {
    return { ok: false, error: "Нямате право да редактирате тази дейност." };
  }
  return {
    ok: true,
    actorId: me.id,
    existing: {
      id: existing.id,
      renovationId: existing.renovationId,
      name: existing.name,
      teamId: existing.teamId,
      peopleRequired: existing.peopleRequired,
      durationDays: Number(existing.durationDays),
      startDate: existing.startDate,
      endDate: existing.endDate,
      status: existing.status,
      sortOrder: existing.sortOrder,
    },
  };
}

async function logActivityFieldChange(
  actorId: string,
  activityId: string,
  renovationId: string,
  field: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  await logEvent({
    actorId,
    action: "renovation.activity.updated",
    targetType: "renovation_activity",
    targetId: activityId,
    payload: { field, renovationId } as Prisma.InputJsonValue,
    before: { [field]: (before ?? null) as never } as never,
    after: { [field]: (after ?? null) as never } as never,
  });
}

export async function setRenovationActivityName(
  activityId: string,
  newValue: string | null,
): Promise<ActivityResult> {
  const gate = await loadActivityAndGate(activityId);
  if (!gate.ok) return gate;
  const trimmed = (newValue ?? "").trim();
  if (trimmed.length === 0) return { ok: false, error: "Името е задължително." };
  if (trimmed.length > 200) return { ok: false, error: "Името е твърде дълго." };
  if (gate.existing.name === trimmed) return { ok: true };

  await prisma.renovationActivity.update({
    where: { id: activityId },
    data: { name: trimmed },
  });
  await logActivityFieldChange(
    gate.actorId,
    activityId,
    gate.existing.renovationId,
    "name",
    gate.existing.name,
    trimmed,
  );

  revalidatePath(`/renovations/${gate.existing.renovationId}`);
  return { ok: true };
}

export async function setRenovationActivityPeopleRequired(
  activityId: string,
  newValue: number | null,
): Promise<ActivityResult> {
  const gate = await loadActivityAndGate(activityId);
  if (!gate.ok) return gate;
  const v = Number(newValue);
  if (!Number.isInteger(v) || v < 0) {
    return { ok: false, error: "Броят хора трябва да е цяло неотрицателно число." };
  }
  if (gate.existing.peopleRequired === v) return { ok: true };

  await prisma.renovationActivity.update({
    where: { id: activityId },
    data: { peopleRequired: v },
  });
  await logActivityFieldChange(
    gate.actorId,
    activityId,
    gate.existing.renovationId,
    "peopleRequired",
    gate.existing.peopleRequired,
    v,
  );

  revalidatePath(`/renovations/${gate.existing.renovationId}`);
  return { ok: true };
}

export async function setRenovationActivityDurationDays(
  activityId: string,
  newValue: number | null,
): Promise<ActivityResult> {
  const gate = await loadActivityAndGate(activityId);
  if (!gate.ok) return gate;
  const v = Number(newValue);
  if (!Number.isFinite(v) || v < 0) {
    return { ok: false, error: "Продължителността трябва да е неотрицателна." };
  }
  if (Math.round(v * 2) !== v * 2) {
    return { ok: false, error: "Позволени са само цели и половин дни (стъпка 0.5)." };
  }
  if (gate.existing.durationDays === v) return { ok: true };

  await prisma.renovationActivity.update({
    where: { id: activityId },
    data: { durationDays: v },
  });
  await logActivityFieldChange(
    gate.actorId,
    activityId,
    gate.existing.renovationId,
    "durationDays",
    gate.existing.durationDays,
    v,
  );

  revalidatePath(`/renovations/${gate.existing.renovationId}`);
  return { ok: true };
}

async function setActivityDateField(
  activityId: string,
  fieldName: "startDate" | "endDate",
  newIso: string | null,
): Promise<ActivityResult> {
  const gate = await loadActivityAndGate(activityId);
  if (!gate.ok) return gate;

  let next: Date | null = null;
  if (newIso !== null && newIso.length > 0) {
    if (!ISO_DATE_RE.test(newIso)) {
      return { ok: false, error: "Невалидна дата." };
    }
    next = new Date(`${newIso}T00:00:00Z`);
    if (Number.isNaN(next.getTime())) {
      return { ok: false, error: "Невалидна дата." };
    }
  }

  const beforeIso =
    gate.existing[fieldName] !== null
      ? gate.existing[fieldName]!.toISOString().slice(0, 10)
      : null;
  const nextIso = next ? next.toISOString().slice(0, 10) : null;
  if (beforeIso === nextIso) return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.renovationActivity.update({
      where: { id: activityId },
      data: { [fieldName]: next },
    });
    // endDate change always shifts the renovation's cached plannedEndDate.
    if (fieldName === "endDate") {
      await recomputePlannedEndDate(tx, gate.existing.renovationId);
    }
  });
  await logActivityFieldChange(
    gate.actorId,
    activityId,
    gate.existing.renovationId,
    fieldName,
    beforeIso,
    nextIso,
  );

  revalidatePath(`/renovations/${gate.existing.renovationId}`);
  revalidatePath("/renovations");
  return { ok: true };
}

export async function setRenovationActivityStartDate(
  activityId: string,
  newIso: string | null,
): Promise<ActivityResult> {
  return setActivityDateField(activityId, "startDate", newIso);
}

export async function setRenovationActivityEndDate(
  activityId: string,
  newIso: string | null,
): Promise<ActivityResult> {
  return setActivityDateField(activityId, "endDate", newIso);
}

export async function setRenovationActivityStatus(
  activityId: string,
  newStatus: RenovationTaskStatus,
): Promise<ActivityResult> {
  const gate = await loadActivityAndGate(activityId);
  if (!gate.ok) return gate;
  if (!isValidRenovationTaskStatus(newStatus)) {
    return { ok: false, error: "Невалиден статус." };
  }
  if (gate.existing.status === newStatus) return { ok: true };

  // Cancelled rows drop out of the plannedEndDate computation — recompute
  // when status crosses the cancelled boundary in either direction.
  const cancelledBoundary =
    gate.existing.status === "cancelled" || newStatus === "cancelled";

  await prisma.$transaction(async (tx) => {
    await tx.renovationActivity.update({
      where: { id: activityId },
      data: { status: newStatus },
    });
    if (cancelledBoundary) {
      await recomputePlannedEndDate(tx, gate.existing.renovationId);
    }
  });

  await logEvent({
    actorId: gate.actorId,
    action: "renovation.activity.status_changed",
    targetType: "renovation_activity",
    targetId: activityId,
    payload: {
      from: gate.existing.status,
      to: newStatus,
      renovationId: gate.existing.renovationId,
    },
  });

  revalidatePath(`/renovations/${gate.existing.renovationId}`);
  revalidatePath("/renovations");
  return { ok: true };
}

export async function deleteRenovationActivity(
  activityId: string,
): Promise<ActivityResult> {
  const gate = await loadActivityAndGate(activityId);
  if (!gate.ok) return gate;

  await prisma.$transaction(async (tx) => {
    await tx.renovationActivity.delete({ where: { id: activityId } });
    await recomputePlannedEndDate(tx, gate.existing.renovationId);
  });

  await logEvent({
    actorId: gate.actorId,
    action: "renovation.activity.deleted",
    targetType: "renovation_activity",
    targetId: activityId,
    payload: {
      name: gate.existing.name,
      renovationId: gate.existing.renovationId,
    },
  });

  revalidatePath(`/renovations/${gate.existing.renovationId}`);
  revalidatePath("/renovations");
  return { ok: true };
}

// "+ Добави дейност" on the renovation detail page — accepts a list of
// template ids and appends them at the end of the existing activity list,
// chain-loading from the previous last activity's endDate (or the
// renovation's plannedStartDate when there are no activities yet).
export async function addRenovationActivities(
  renovationId: string,
  templateIds: string[],
): Promise<ActivityResult> {
  const me = await requireProfile();
  if (!UUID_RE.test(renovationId)) return { ok: false, error: "Невалиден ремонт." };
  const r = await prisma.renovation.findUnique({
    where: { id: renovationId },
    select: {
      managerId: true,
      deletedAt: true,
      apartmentSize: true,
      bathroomCount: true,
      plannedStartDate: true,
    },
  });
  if (!r || r.deletedAt !== null) return { ok: false, error: "Ремонтът не е намерен." };
  if (!canEditRenovation(me.role, r.managerId, me.id)) {
    return { ok: false, error: "Нямате право да добавяте дейности." };
  }
  if (!r.apartmentSize) {
    return {
      ok: false,
      error: "Ремонтът няма зададен размер на апартамент. Редактирайте го преди да добавите дейности.",
    };
  }

  const ids = templateIds
    .filter((id) => typeof id === "string" && UUID_RE.test(id))
    // dedupe + preserve order
    .filter((id, idx, arr) => arr.indexOf(id) === idx);
  if (ids.length === 0) return { ok: false, error: "Изберете поне една дейност." };

  // Exclude templates already loaded on this renovation (strict one-of-each).
  const already = await prisma.renovationActivity.findMany({
    where: { renovationId, templateId: { in: ids } },
    select: { templateId: true },
  });
  const alreadySet = new Set(already.map((a) => a.templateId).filter(Boolean) as string[]);
  const fresh = ids.filter((id) => !alreadySet.has(id));
  if (fresh.length === 0) {
    return { ok: false, error: "Всички избрани дейности вече са заредени." };
  }

  const templates = (await prisma.activityTemplate.findMany({
    where: { id: { in: fresh }, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  })).map((t) => ({
    id: t.id,
    name: t.name,
    teamId: t.teamId,
    peopleRequired: t.peopleRequired,
    bathroomMultiplied: t.bathroomMultiplied,
    durationStudio: Number(t.durationStudio),
    durationTwoRoom: Number(t.durationTwoRoom),
    durationThreeRoom: Number(t.durationThreeRoom),
    durationFourRoom: Number(t.durationFourRoom),
    sortOrder: t.sortOrder,
  }));

  // Anchor the new activities at the last existing endDate + 1 day, or at
  // the renovation's plannedStartDate when there are none yet.
  const last = await prisma.renovationActivity.findFirst({
    where: { renovationId },
    orderBy: [{ sortOrder: "desc" }],
    select: { endDate: true, sortOrder: true },
  });
  const anchor = last?.endDate
    ? new Date(last.endDate.getTime() + 24 * 60 * 60 * 1000)
    : r.plannedStartDate ?? new Date();
  const startingSortOrder = (last?.sortOrder ?? 0) + 1;

  const loaded = chainLoadActivities({
    plannedStartDate: anchor,
    apartmentSize: r.apartmentSize,
    bathroomCount: r.bathroomCount ?? 1,
    templates,
  }).map((a, i) => ({
    ...a,
    sortOrder: startingSortOrder + i,
  }));

  await prisma.$transaction(async (tx) => {
    await tx.renovationActivity.createMany({
      data: loaded.map((a) => ({
        renovationId,
        templateId: a.templateId,
        name: a.name,
        teamId: a.teamId,
        peopleRequired: a.peopleRequired,
        durationDays: a.durationDays,
        startDate: a.startDate,
        endDate: a.endDate,
        sortOrder: a.sortOrder,
        createdById: me.id,
      })),
    });
    await recomputePlannedEndDate(tx, renovationId);
  });

  for (const a of loaded) {
    await logEvent({
      actorId: me.id,
      action: "renovation.activity.created",
      targetType: "renovation_activity",
      // The createMany above doesn't return ids; log against the renovation
      // since the individual activity ids aren't known here. Audit can
      // reconstruct via the `payload.templateId`.
      targetId: renovationId,
      payload: {
        renovationId,
        templateId: a.templateId,
        name: a.name,
        sortOrder: a.sortOrder,
      },
    });
  }

  revalidatePath(`/renovations/${renovationId}`);
  revalidatePath("/renovations");
  return { ok: true };
}

// Drag-reorder: client posts the desired final order of activity ids.
// Validates that every id belongs to the same renovation, then re-numbers
// sortOrder = 1..N in that order. No date recomputation — reordering does
// not auto-rechain (the operator hits "Преподреди по сегашния ред"
// explicitly when they want that).
export async function reorderRenovationActivities(
  renovationId: string,
  orderedIds: string[],
): Promise<ActivityResult> {
  const me = await requireProfile();
  if (!UUID_RE.test(renovationId)) return { ok: false, error: "Невалиден ремонт." };
  const r = await prisma.renovation.findUnique({
    where: { id: renovationId },
    select: { managerId: true, deletedAt: true },
  });
  if (!r || r.deletedAt !== null) return { ok: false, error: "Ремонтът не е намерен." };
  if (!canEditRenovation(me.role, r.managerId, me.id)) {
    return { ok: false, error: "Нямате право да пренареждате дейностите." };
  }

  if (orderedIds.length === 0) return { ok: true };
  const found = await prisma.renovationActivity.findMany({
    where: { id: { in: orderedIds }, renovationId },
    select: { id: true, sortOrder: true },
  });
  if (found.length !== orderedIds.length) {
    return { ok: false, error: "Една или повече дейности не са намерени." };
  }
  const beforeMap = new Map(found.map((a) => [a.id, a.sortOrder]));

  await prisma.$transaction(
    orderedIds.map((id, idx) =>
      prisma.renovationActivity.update({
        where: { id },
        data: { sortOrder: idx + 1 },
      }),
    ),
  );

  await logEvent({
    actorId: me.id,
    action: "renovation.activity.reordered",
    targetType: "renovation",
    targetId: renovationId,
    payload: {
      before: orderedIds.map((id) => ({ id, sortOrder: beforeMap.get(id) })),
      after: orderedIds.map((id, idx) => ({ id, sortOrder: idx + 1 })),
    },
  });

  revalidatePath(`/renovations/${renovationId}`);
  return { ok: true };
}

// "Преподреди по сегашния ред" — rechain start/end dates from the
// renovation's plannedStartDate using each activity's current sortOrder
// and its current durationDays. Status is preserved; cancelled activities
// are skipped (still occupy a row, but no dates change for them).
export async function rechainRenovationActivities(
  renovationId: string,
): Promise<ActivityResult> {
  const me = await requireProfile();
  if (!UUID_RE.test(renovationId)) return { ok: false, error: "Невалиден ремонт." };
  const r = await prisma.renovation.findUnique({
    where: { id: renovationId },
    select: {
      managerId: true,
      deletedAt: true,
      plannedStartDate: true,
    },
  });
  if (!r || r.deletedAt !== null) return { ok: false, error: "Ремонтът не е намерен." };
  if (!canEditRenovation(me.role, r.managerId, me.id)) {
    return { ok: false, error: "Нямате право да пренареждате дейностите." };
  }
  if (!r.plannedStartDate) {
    return {
      ok: false,
      error: "Ремонтът няма зададено планирано начало. Задайте го преди да пренаредите датите.",
    };
  }

  const activities = await prisma.renovationActivity.findMany({
    where: { renovationId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      durationDays: true,
      status: true,
      sortOrder: true,
    },
  });

  // Walk in sortOrder; cancelled rows keep their existing dates (we skip
  // them in the chain). For active rows, set start = cursor, end = start +
  // durationDays - 1, cursor = end + 1.
  const updates: { id: string; startDate: Date; endDate: Date }[] = [];
  let cursor = new Date(r.plannedStartDate.getTime());
  const oneDayMs = 24 * 60 * 60 * 1000;

  for (const a of activities) {
    if (a.status === "cancelled") continue;
    const duration = Number(a.durationDays);
    const wholeDays = Math.max(1, Math.ceil(duration));
    const startDate = new Date(cursor.getTime());
    const endDate = new Date(cursor.getTime() + (wholeDays - 1) * oneDayMs);
    updates.push({ id: a.id, startDate, endDate });
    cursor = new Date(endDate.getTime() + oneDayMs);
  }

  const earliestStart = updates[0]?.startDate ?? null;
  const latestEnd = updates[updates.length - 1]?.endDate ?? null;

  await prisma.$transaction(async (tx) => {
    for (const u of updates) {
      await tx.renovationActivity.update({
        where: { id: u.id },
        data: { startDate: u.startDate, endDate: u.endDate },
      });
    }
    await recomputePlannedEndDate(tx, renovationId);
  });

  await logEvent({
    actorId: me.id,
    action: "renovation.activity.rechained",
    targetType: "renovation",
    targetId: renovationId,
    payload: {
      count: updates.length,
      fromDate: earliestStart?.toISOString().slice(0, 10) ?? null,
      toDate: latestEnd?.toISOString().slice(0, 10) ?? null,
    },
  });

  revalidatePath(`/renovations/${renovationId}`);
  revalidatePath("/renovations");
  return { ok: true };
}
