import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/auth/audit";
import { prisma } from "@/lib/prisma";
import { parsePropertiesCsv } from "@/lib/properties/csv";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Per-building CSV import. Admin-only.
//
// Request:
//   POST /api/properties/import
//   Content-Type: multipart/form-data
//   file:       <csv file>
//   buildingId: <Building.id>
//
// Behaviour:
//   1. Decode bytes (UTF-8 first, fall back to Windows-1251 on U+FFFD).
//   2. Parse + validate every row.
//   3. If any Сграда column value is present but doesn't match the selected
//      building, return 400 with line-level errors. No partial commits.
//   4. Upsert on (buildingId, name): existing rows update, new rows insert,
//      initial status-history entry written for the new rows only.
//   5. Log ONE `property.imported` audit event summarising the batch.
//
// Response JSON:
//   { ok: true,  created, updated, encoding }
//   { ok: false, errors: [{ csvLine, message }] }

type ImportOk = {
  ok: true;
  created: number;
  updated: number;
  encoding: "utf-8" | "windows-1251";
};
type ImportErr = {
  ok: false;
  errors: Array<{ csvLine: number; message: string }>;
};

export async function POST(request: NextRequest): Promise<NextResponse<ImportOk | ImportErr>> {
  const me = await requireRole("admin");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, errors: [{ csvLine: 0, message: "Невалидно тяло на заявката." }] },
      { status: 400 },
    );
  }

  const file = form.get("file");
  const buildingId = String(form.get("buildingId") ?? "");

  if (!buildingId) {
    return NextResponse.json(
      { ok: false, errors: [{ csvLine: 0, message: "Липсва buildingId." }] },
      { status: 400 },
    );
  }
  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { ok: false, errors: [{ csvLine: 0, message: "Не е избран файл." }] },
      { status: 400 },
    );
  }

  const building = await prisma.building.findUnique({
    where: { id: buildingId },
    select: { id: true, storageName: true, active: true },
  });
  if (!building) {
    return NextResponse.json(
      { ok: false, errors: [{ csvLine: 0, message: "Невалидна сграда." }] },
      { status: 400 },
    );
  }
  if (!building.active) {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ csvLine: 0, message: "Сградата е деактивирана. Активирай я преди импорт." }],
      },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parsePropertiesCsv(buffer);

  // Validate building cross-reference for every row that carries a Сграда.
  const extraErrors: ImportErr["errors"] = [];
  for (const row of parsed.rows) {
    if (row.buildingStorageName && row.buildingStorageName !== building.storageName) {
      extraErrors.push({
        csvLine: row.csvLine,
        message: `Колоната Сграда сочи към "${row.buildingStorageName}", но избраната сграда е "${building.storageName}". Промени или премахни стойността.`,
      });
    }
  }

  // Duplicate (name) detection within the upload itself — same name twice in
  // the file is a user error even if it wouldn't conflict with the DB.
  const seenNames = new Map<string, number>();
  for (const row of parsed.rows) {
    const prior = seenNames.get(row.name);
    if (prior !== undefined) {
      extraErrors.push({
        csvLine: row.csvLine,
        message: `Името "${row.name}" се повтаря (срв. ред ${prior}).`,
      });
    } else {
      seenNames.set(row.name, row.csvLine);
    }
  }

  const allErrors = [...parsed.errors, ...extraErrors].sort(
    (a, b) => a.csvLine - b.csvLine,
  );
  if (allErrors.length > 0 || parsed.rows.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        errors:
          allErrors.length > 0
            ? allErrors
            : [{ csvLine: 0, message: "Файлът не съдържа валидни редове." }],
      },
      { status: 400 },
    );
  }

  // Classify insert vs update against existing (buildingId, name) rows.
  const existing = await prisma.property.findMany({
    where: { buildingId, name: { in: parsed.rows.map((r) => r.name) } },
    select: { id: true, name: true },
  });
  const existingByName = new Map(existing.map((e) => [e.name, e.id]));

  const toInsert: Prisma.PropertyCreateManyInput[] = [];
  const toUpdate: Array<{ id: string; data: Prisma.PropertyCreateManyInput }> = [];
  for (const row of parsed.rows) {
    const payload: Prisma.PropertyCreateManyInput = {
      ...row.data,
      buildingId,
    };
    const existingId = existingByName.get(row.name);
    if (existingId) {
      toUpdate.push({ id: existingId, data: payload });
    } else {
      toInsert.push({
        ...payload,
        createdById: me.id,
        updatedById: me.id,
      });
    }
  }

  // Run inserts + updates + status-history in a single transaction so a
  // failure half-way doesn't leave Frankenstein state.
  const stamp = new Date();
  await prisma.$transaction(async (tx) => {
    if (toInsert.length > 0) {
      // createMany doesn't return IDs, so we insert and then re-fetch by name.
      await tx.property.createMany({ data: toInsert });
      const insertedRows = await tx.property.findMany({
        where: {
          buildingId,
          name: { in: toInsert.map((r) => r.name ?? "") },
        },
        select: { id: true, name: true, status: true },
      });
      const historyData = insertedRows.map((p) => ({
        propertyId: p.id,
        fromStatus: null,
        toStatus: p.status,
        note: "Импорт от CSV",
        authorId: me.id,
        at: stamp,
      }));
      if (historyData.length > 0) {
        await tx.propertyStatusHistory.createMany({ data: historyData });
      }
    }

    for (const u of toUpdate) {
      const before = await tx.property.findUnique({
        where: { id: u.id },
        select: { status: true },
      });
      await tx.property.update({
        where: { id: u.id },
        data: { ...u.data, updatedById: me.id },
      });
      // Write a status-history entry only if status actually changed.
      if (before && before.status !== u.data.status) {
        await tx.propertyStatusHistory.create({
          data: {
            propertyId: u.id,
            fromStatus: before.status,
            toStatus: u.data.status,
            note: "Импорт от CSV",
            authorId: me.id,
            at: stamp,
          },
        });
      }
    }
  });

  await recordAuditEvent({
    actorId: me.id,
    action: "property.imported",
    targetType: "building",
    targetId: buildingId,
    payload: {
      buildingStorageName: building.storageName,
      created: toInsert.length,
      updated: toUpdate.length,
      encoding: parsed.encoding,
    },
  });

  return NextResponse.json({
    ok: true,
    created: toInsert.length,
    updated: toUpdate.length,
    encoding: parsed.encoding,
  });
}
