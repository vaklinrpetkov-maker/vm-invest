"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

// These actions are wired directly to <form action={...}> which requires a
// Promise<void> signature. We redirect on success and throw on failure — the
// Next error boundary will surface the message. All admin-only.
//
// The admin calendar UI talks exclusively to the bulk actions below, even for
// single-day edits (start === end). One code path, one audit shape, one lock
// check — simpler than maintaining parallel single + bulk implementations.

// Hard cap to keep bulk loops bounded. A full calendar year is 366; we allow
// slightly more so admins can span a year boundary (e.g. New Year shutdown).
const BULK_MAX_DAYS = 400;

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Apply the same dayType (or clear) to every day in [startIso, endIso].
// Wired to the bulk panel in the admin calendar grid — admins use it to
// stamp e.g. a week-long holiday or a stretch of compensatory days without
// clicking each cell. Audit trail still emits one row per day.
export async function bulkUpsertCalendarDays(formData: FormData): Promise<void> {
  const actor = await requireRole("admin");
  const startIso = String(formData.get("startIso") ?? "");
  const endIso = String(formData.get("endIso") ?? "");
  const dayType = String(formData.get("dayType") ?? "");
  const holidayNameRaw = String(formData.get("holidayName") ?? "").trim();
  const holidayName = holidayNameRaw === "" ? null : holidayNameRaw;
  const skipWeekends = formData.get("skipWeekends") === "on";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startIso) || !/^\d{4}-\d{2}-\d{2}$/.test(endIso)) {
    throw new Error("Невалиден диапазон.");
  }

  let isWorking: boolean = false;
  let clearMode = false;
  if (dayType === "clear") {
    clearMode = true;
  } else if (dayType === "holiday") {
    isWorking = false;
  } else if (dayType === "working" || dayType === "compensatory") {
    isWorking = true;
  } else {
    throw new Error("Невалиден тип на деня.");
  }

  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  if (end.getTime() < start.getTime()) {
    throw new Error("Краят на диапазона е преди началото.");
  }

  const span = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (span > BULK_MAX_DAYS) {
    throw new Error(`Диапазонът надвишава ${BULK_MAX_DAYS} дни.`);
  }

  // Build the concrete list of days. (d.getUTCDay()+6)%7 → 0..6 with Mon=0.
  const days: Date[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
    const d = new Date(t);
    if (skipWeekends && ((d.getUTCDay() + 6) % 7) >= 5) continue;
    days.push(d);
  }
  if (days.length === 0) {
    // Range was non-empty but every day got filtered (e.g. 2-day weekend with
    // skipWeekends on). Nothing to do — bounce back without noise.
    revalidatePath("/admin/calendar");
    redirect(`/admin/calendar?year=${start.getUTCFullYear()}`);
  }

  // Lock check across every year the range touches. Admin has to unlock first.
  const yearsTouched = Array.from(new Set(days.map((d) => d.getUTCFullYear())));
  const lockedYears = await prisma.calendarYear.findMany({
    where: { year: { in: yearsTouched }, locked: true },
    select: { year: true },
  });
  if (lockedYears.length > 0) {
    throw new Error(
      `Заключени години: ${lockedYears.map((l) => l.year).join(", ")}. Отключете преди редакция.`,
    );
  }

  // Ensure CalendarYear rows exist for every touched year (FK target).
  for (const y of yearsTouched) {
    await prisma.calendarYear.upsert({
      where: { year: y },
      create: { year: y, uploadedById: actor.id },
      update: {},
    });
  }

  // Pre-fetch existing overrides for audit before-state.
  const existing = await prisma.calendarDay.findMany({
    where: { day: { in: days } },
  });
  const existingByIso = new Map(existing.map((o) => [toIsoDate(o.day), o]));

  // Apply day-by-day in one transaction so a mid-batch failure rolls back.
  await prisma.$transaction(async (tx) => {
    for (const d of days) {
      const iso = toIsoDate(d);
      const before = existingByIso.get(iso);
      if (clearMode) {
        if (before) {
          await tx.calendarDay.delete({ where: { day: d } });
        }
      } else {
        await tx.calendarDay.upsert({
          where: { day: d },
          create: { day: d, year: d.getUTCFullYear(), isWorking, holidayName },
          update: { isWorking, holidayName },
        });
      }
    }
  });

  // Audit log per day (outside the txn — an audit-write failure shouldn't
  // roll back the user's calendar edit).
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for") ?? null;
  const userAgent = hdrs.get("user-agent") ?? null;
  for (const d of days) {
    const iso = toIsoDate(d);
    const before = existingByIso.get(iso);
    await recordAuditEvent({
      actorId: actor.id,
      action: "absence.calendar.edit",
      targetType: "calendar_day",
      targetId: iso,
      before: before
        ? { isWorking: before.isWorking, holidayName: before.holidayName }
        : { isWorking: null, holidayName: null },
      after: clearMode
        ? { isWorking: null, holidayName: null }
        : { isWorking, holidayName },
      ip,
      userAgent,
    });
  }

  revalidatePath("/admin/calendar");
  redirect(`/admin/calendar?year=${start.getUTCFullYear()}`);
}

// Hard cap on note text — same UX intent as a short headline / disclaimer.
// Wrap-around in a 96px-wide cell starts looking miserable past ~120 chars.
const NOTE_MAX_LEN = 200;

// Apply the same note text to every day in [startIso, endIso]. If `note` is
// empty, deletes notes on each day in range. Optional skipWeekends.
export async function bulkUpsertCalendarNotes(formData: FormData): Promise<void> {
  const actor = await requireRole("admin");
  const startIso = String(formData.get("startIso") ?? "");
  const endIso = String(formData.get("endIso") ?? "");
  const noteRaw = String(formData.get("note") ?? "").trim();
  const skipWeekends = formData.get("skipWeekends") === "on";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startIso) || !/^\d{4}-\d{2}-\d{2}$/.test(endIso)) {
    throw new Error("Невалиден диапазон.");
  }
  if (noteRaw.length > NOTE_MAX_LEN) {
    throw new Error(`Бележката е твърде дълга (макс. ${NOTE_MAX_LEN} символа).`);
  }

  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  if (end.getTime() < start.getTime()) {
    throw new Error("Краят на диапазона е преди началото.");
  }

  const span = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (span > BULK_MAX_DAYS) {
    throw new Error(`Диапазонът надвишава ${BULK_MAX_DAYS} дни.`);
  }

  const days: Date[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
    const d = new Date(t);
    if (skipWeekends && ((d.getUTCDay() + 6) % 7) >= 5) continue;
    days.push(d);
  }
  if (days.length === 0) {
    revalidatePath("/admin/calendar");
    revalidatePath("/absence/calendar");
    redirect(`/admin/calendar?year=${start.getUTCFullYear()}`);
  }

  const existing = await prisma.calendarNote.findMany({
    where: { day: { in: days } },
  });
  const existingByIso = new Map(existing.map((o) => [toIsoDate(o.day), o]));

  const clearMode = noteRaw === "";

  await prisma.$transaction(async (tx) => {
    for (const d of days) {
      const iso = toIsoDate(d);
      const before = existingByIso.get(iso);
      if (clearMode) {
        if (before) await tx.calendarNote.delete({ where: { day: d } });
      } else {
        await tx.calendarNote.upsert({
          where: { day: d },
          create: { day: d, note: noteRaw },
          update: { note: noteRaw },
        });
      }
    }
  });

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for") ?? null;
  const userAgent = hdrs.get("user-agent") ?? null;
  for (const d of days) {
    const iso = toIsoDate(d);
    const before = existingByIso.get(iso);
    // Skip audit rows that would represent a no-op (clearing an empty day).
    if (clearMode && !before) continue;
    await recordAuditEvent({
      actorId: actor.id,
      action: clearMode
        ? "absence.calendar.note.delete"
        : "absence.calendar.note.update",
      targetType: "calendar_note",
      targetId: iso,
      before: before ? { note: before.note } : { note: null },
      after: clearMode ? { note: null } : { note: noteRaw },
      ip,
      userAgent,
    });
  }

  revalidatePath("/admin/calendar");
  revalidatePath("/absence/calendar");
  redirect(`/admin/calendar?year=${start.getUTCFullYear()}`);
}

