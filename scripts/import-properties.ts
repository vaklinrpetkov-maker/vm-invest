// CSV seed import for the Properties module.
// Usage:  npm run properties:import
//
// Reads files/Properties/all-properties.csv (Windows-1251, 2,158 rows, 27
// columns — see specs/properties.md §7.1 for the encoding verification) and,
// in order:
//
//   1. Upserts 20 Building rows with curated displayName + complex assignments
//      (per specs/properties.md §3.3 and §3.3.1).
//   2. Upserts Property rows by (buildingId, name). One CSV row has blank
//      Status and blank Type — it becomes Свободен + Друго with a
//      `property.seed_flagged` audit event.
//   3. Writes the initial PropertyStatusHistory row per property
//      (null → status, note "Мигриран от CSV") — only if the property had no
//      history rows before (idempotent).
//   4. Reconciles Contact.buildings[] → Contact.buildingId. Clears МТМ /
//      ЦИТ / Манастирски ливади with audit notes per §3.3.2.
//
// Idempotent: safe to re-run. Contact reconciliation skips contacts whose
// `buildingId` is already set.
//
// After this script runs cleanly, run Migration B (a follow-up db push) to
// drop Contact.buildings[]. That's the "one-deploy" requirement from §3.3.2.
//
// End-of-run output prints per-building, per-status, and per-type counts that
// match §7.3 of Properties.md, plus contact-reconciliation stats.

import { parse } from "csv-parse/sync";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { parseSellerInput } from "@/lib/properties/sellers-normalize";

const prisma = new PrismaClient();

// ─── Canonical maps from specs/properties.md §3.3 and §3.3.1 ─────────────────

const BUILDING_DISPLAY_NAMES: Record<string, string> = {
  АСЕНЕВЦИ: "Асеневци",
  БИТОЛЯ: "Битоля",
  ВЕЛЕКА: "Велека",
  ВП_МТМ: "ВП МТМ",
  ДОБРУДЖА: "Добруджа",
  МАКЕДОНИЯ: "Македония",
  МИЗИЯ: "Мизия",
  ОХРИД: "Охрид",
  ПЛИСКА: "Плиска",
  ПРЕСЛАВ: "Преслав",
  ПРЕСПА: "Преспа",
  СВЕТЛА: "Светла",
  СЕРДИКА: "Сердика",
  СРЕДЕЦ: "Средец",
  СУТЕРЕН_ОБЩ: "Сутерен (общ)",
  ТРАКИЯ: "Тракия",
  ТРАПЕЗИЦА: "Трапезица",
  ТРИАДИЦА: "Триадица",
  ЦАРЕВЕЦ: "Царевец",
  ШИПКА: "Шипка",
};

const COMPLEX_PP = "ПП (Плиска — Преслав)";
const COMPLEX_TSIT = "ЦИТ (Царевец — Трапезица)";
const COMPLEX_SERDIKA = "Сердика";
const COMPLEX_MTM = "МТМ (Мизия — Тракия — Македония)";

const BUILDING_COMPLEX: Record<string, string | null> = {
  ПЛИСКА: COMPLEX_PP,
  ПРЕСЛАВ: COMPLEX_PP,
  ЦАРЕВЕЦ: COMPLEX_TSIT,
  ТРАПЕЗИЦА: COMPLEX_TSIT,
  СУТЕРЕН_ОБЩ: COMPLEX_TSIT,
  СЕРДИКА: COMPLEX_SERDIKA,
  МИЗИЯ: COMPLEX_MTM,
  ТРАКИЯ: COMPLEX_MTM,
  МАКЕДОНИЯ: COMPLEX_MTM,
  ВП_МТМ: COMPLEX_MTM,
};

// Column positions in the CSV (1-indexed in comments for clarity).
const COL_BUILDING = 0; // Сграда
const COL_NAME = 1; // Name
const COL_STATUS = 2; // Статус
const COL_ENTRANCE = 3; // Вход
const COL_FLOOR = 4; // Етаж
const COL_TYPE = 5; // Тип
const COL_DESCRIPTION = 6; // Описание
const COL_SELLER = 7; // Продавач
const COL_EXPECTED_PRICE_EUR = 8; // Очаквана цена (EUR)
const COL_PRICE_EUR = 9; // Цена (EUR)
const COL_YARD_TERRACE_EUR = 10; // Цена двор/тераса (EUR)
const COL_TOTAL_AREA = 11; // Квадратура общо
const COL_COMMON_PARTS = 12; // Общи части
const COL_NET_AREA = 13; // Чиста площ
const COL_IDEAL_COEF = 14; // Коеф. ид.ч
const COL_BATHROOMS = 15; // Брой бани
const COL_YARD_M2 = 16; // Двор, м2
const COL_TERRACE_M2 = 17; // Тераси, м2
const COL_LAND_M2 = 18; // Земя, м2
const COL_LAND_PCT = 19; // Земя, %
const COL_YARD_PCT = 20; // Двор, %
const COL_CONTRACTS = 21; // ДОГОВОРИ
const COL_CREDIT = 22; // Кредит
const COL_BUYER = 23; // Купувач
const COL_PRICE_BGN_ORIG = 24; // Цена (BGN, оригинал)
const COL_EXPECTED_PRICE_BGN_ORIG = 25; // Очаквана цена (BGN, оригинал)
const COL_YARD_TERRACE_BGN_ORIG = 26; // Цена двор/тераса (BGN, оригинал)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function orNull(s: string | undefined): string | null {
  if (s === undefined) return null;
  const v = s.trim();
  return v.length ? v : null;
}

function parseIntOrNull(s: string | undefined): number | null {
  const v = orNull(s);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

function parseIntFloorOrNull(s: string | undefined): number | null {
  // Floor column sometimes has non-integer garbage; accept integers only.
  return parseIntOrNull(s);
}

function parseDecimalOrNull(s: string | undefined): Prisma.Decimal | null {
  const v = orNull(s);
  if (v === null) return null;
  // Replace any comma decimals just in case the CSV mixes formats.
  const normalized = v.replace(/,/g, ".");
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return new Prisma.Decimal(normalized);
}

function parseBoolOrNull(s: string | undefined): boolean | null {
  const v = orNull(s);
  if (v === null) return null;
  const upper = v.toUpperCase();
  if (upper === "TRUE") return true;
  if (upper === "FALSE") return false;
  return null;
}

async function recordFlag(
  propertyId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      actorId: null,
      action: "property.seed_flagged",
      targetType: "property",
      targetId: propertyId,
      payload: payload as Prisma.InputJsonValue,
    },
  });
}

async function recordContactMigration(
  contactId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      actorId: null,
      action: "contact.building_migrated",
      targetType: "contact",
      targetId: contactId,
      payload: payload as Prisma.InputJsonValue,
    },
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const filePath = resolve(process.cwd(), "files/Properties/all-properties.csv");
  // File is Windows-1251 — see Properties.md §7.1. Read as bytes then decode
  // explicitly; `readFileSync(path, "utf-8")` would replace every Cyrillic
  // byte with U+FFFD and silently corrupt building names.
  const bytes = readFileSync(filePath);
  const raw = new TextDecoder("windows-1251").decode(bytes);

  const rows = parse(raw, {
    columns: false,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_quotes: true,
    relax_column_count: true,
  }) as string[][];

  // Drop header row
  const header = rows[0];
  const dataRows = rows.slice(1);
  console.log(`Loaded ${dataRows.length} data rows from ${filePath}`);
  console.log(`Header column count: ${header?.length ?? 0}`);

  // ─── Step 1: Buildings ─────────────────────────────────────────────────
  const distinctBuildings = new Set<string>();
  for (const r of dataRows) {
    const name = orNull(r[COL_BUILDING]);
    if (name) distinctBuildings.add(name);
  }
  console.log(`\n=== Buildings ===`);
  console.log(`Distinct building storage names in CSV: ${distinctBuildings.size}`);

  const buildingIdByStorageName = new Map<string, string>();
  for (const storageName of distinctBuildings) {
    const displayName = BUILDING_DISPLAY_NAMES[storageName] ?? storageName;
    const complex = BUILDING_COMPLEX[storageName] ?? null;
    const upserted = await prisma.building.upsert({
      where: { storageName },
      create: { storageName, displayName, complex, active: true },
      update: { displayName, complex }, // keep `active` as-is on re-runs
    });
    buildingIdByStorageName.set(storageName, upserted.id);
  }
  console.log(`Upserted ${buildingIdByStorageName.size} buildings.`);

  // ─── Step 2 + 3: Properties (+ initial status history) ────────────────
  //
  // Optimisation: build the full list in memory first, then split into
  // create-vs-update lots based on a single bulk pre-fetch. Use createMany
  // for the bulk insert path (the overwhelmingly common first-run case) so
  // we avoid N × round-trips. The upsert path still exists for re-runs.

  const migrationStamp = new Date();
  const parsedRows: Array<{
    buildingId: string;
    data: Prisma.PropertyCreateManyInput;
    wasFlagged: boolean;
    csvLineNumber: number;
    raw: { status: string | null; type: string | null };
  }> = [];
  let skippedRows = 0;

  for (let idx = 0; idx < dataRows.length; idx++) {
    const r = dataRows[idx];
    const buildingName = orNull(r[COL_BUILDING]);
    const name = orNull(r[COL_NAME]);
    const rawStatus = orNull(r[COL_STATUS]);
    const rawType = orNull(r[COL_TYPE]);

    if (!buildingName || !name) {
      skippedRows += 1;
      continue;
    }
    const buildingId = buildingIdByStorageName.get(buildingName);
    if (!buildingId) {
      skippedRows += 1;
      continue;
    }

    const status = rawStatus ?? "Свободен";
    const type = rawType ?? "Друго";
    const wasFlagged = rawStatus === null || rawType === null;

    parsedRows.push({
      buildingId,
      data: {
        buildingId,
        name,
        status,
        type,
        entrance: orNull(r[COL_ENTRANCE]),
        floor: parseIntFloorOrNull(r[COL_FLOOR]),
        description: orNull(r[COL_DESCRIPTION]),
        // Comma-split + canonicalise on import so the array column lands
        // clean. See lib/properties/sellers-normalize.ts.
        sellers: parseSellerInput(r[COL_SELLER] ?? null),
        expectedPriceEur: parseDecimalOrNull(r[COL_EXPECTED_PRICE_EUR]),
        priceEur: parseDecimalOrNull(r[COL_PRICE_EUR]),
        yardTerracePriceEur: parseDecimalOrNull(r[COL_YARD_TERRACE_EUR]),
        totalAreaM2: parseDecimalOrNull(r[COL_TOTAL_AREA]),
        commonPartsM2: parseDecimalOrNull(r[COL_COMMON_PARTS]),
        netAreaM2: parseDecimalOrNull(r[COL_NET_AREA]),
        idealPartsCoef: parseDecimalOrNull(r[COL_IDEAL_COEF]),
        bathroomCount: parseIntOrNull(r[COL_BATHROOMS]),
        yardM2: parseDecimalOrNull(r[COL_YARD_M2]),
        terraceM2: parseDecimalOrNull(r[COL_TERRACE_M2]),
        landM2: parseDecimalOrNull(r[COL_LAND_M2]),
        landPct: parseDecimalOrNull(r[COL_LAND_PCT]),
        yardPct: parseDecimalOrNull(r[COL_YARD_PCT]),
        contractLabel: orNull(r[COL_CONTRACTS]),
        buyerLabel: orNull(r[COL_BUYER]),
        hasCredit: parseBoolOrNull(r[COL_CREDIT]),
        priceBgnOriginal: parseDecimalOrNull(r[COL_PRICE_BGN_ORIG]),
        expectedPriceBgnOriginal: parseDecimalOrNull(r[COL_EXPECTED_PRICE_BGN_ORIG]),
        yardTerracePriceBgnOriginal: parseDecimalOrNull(r[COL_YARD_TERRACE_BGN_ORIG]),
        createdAt: migrationStamp,
      },
      wasFlagged,
      csvLineNumber: idx + 2,
      raw: { status: rawStatus, type: rawType },
    });
  }

  // Pre-fetch existing rows keyed by (buildingId, name) so we can classify
  // insert vs update without N round-trips.
  const existingRows = await prisma.property.findMany({
    select: { id: true, buildingId: true, name: true },
  });
  const existingKey = (b: string, n: string) => `${b}|||${n}`;
  const existingMap = new Map(existingRows.map((r) => [existingKey(r.buildingId, r.name), r.id]));

  const toInsert: Prisma.PropertyCreateManyInput[] = [];
  const toUpdate: Array<{ id: string; data: Prisma.PropertyCreateManyInput }> = [];
  for (const p of parsedRows) {
    const key = existingKey(p.buildingId, p.data.name!);
    const existingId = existingMap.get(key);
    if (existingId) {
      toUpdate.push({ id: existingId, data: p.data });
    } else {
      toInsert.push(p.data);
    }
  }

  console.log(`Planned: ${toInsert.length} inserts, ${toUpdate.length} updates`);

  // Bulk insert — one round trip. Batches of 500 to stay well under any
  // single-statement parameter limits.
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const chunk = toInsert.slice(i, i + BATCH);
    const res = await prisma.property.createMany({ data: chunk, skipDuplicates: true });
    inserted += res.count;
    console.log(`  inserted batch ${i / BATCH + 1}: ${res.count} rows`);
  }

  // Updates — Prisma has no bulk-update-with-different-values primitive, so
  // run them sequentially. In re-runs this is the slow path; first run has
  // zero updates so it's free.
  let updated = 0;
  for (const u of toUpdate) {
    await prisma.property.update({ where: { id: u.id }, data: u.data });
    updated += 1;
    if (updated % 200 === 0) console.log(`  updated ${updated} rows`);
  }

  console.log(`\n=== Properties ===`);
  console.log(`Created: ${inserted}, Updated: ${updated}, Skipped: ${skippedRows}`);

  // Resolve all property IDs now that inserts landed, so we can flag + write
  // history rows in bulk.
  const allProps = await prisma.property.findMany({
    select: { id: true, buildingId: true, name: true, status: true },
  });
  const idByKey = new Map(allProps.map((p) => [existingKey(p.buildingId, p.name), p.id]));

  // Status history — one row per property, but only if none exists yet.
  const existingHistory = await prisma.propertyStatusHistory.findMany({
    select: { propertyId: true },
    distinct: ["propertyId"],
  });
  const haveHistory = new Set(existingHistory.map((h) => h.propertyId));

  const historyRows: Prisma.PropertyStatusHistoryCreateManyInput[] = [];
  for (const p of allProps) {
    if (haveHistory.has(p.id)) continue;
    historyRows.push({
      propertyId: p.id,
      fromStatus: null,
      toStatus: p.status,
      note: "Мигриран от CSV",
      authorId: null,
      at: migrationStamp,
    });
  }
  if (historyRows.length > 0) {
    for (let i = 0; i < historyRows.length; i += BATCH) {
      const chunk = historyRows.slice(i, i + BATCH);
      await prisma.propertyStatusHistory.createMany({ data: chunk });
    }
    console.log(`Wrote ${historyRows.length} initial status history rows.`);
  } else {
    console.log(`All properties already have status history — skipped.`);
  }

  // Audit flag rows for the blank-status/blank-type CSV row(s).
  let flaggedRows = 0;
  for (const p of parsedRows) {
    if (!p.wasFlagged) continue;
    const propertyId = idByKey.get(existingKey(p.buildingId, p.data.name!));
    if (!propertyId) continue;
    await recordFlag(propertyId, {
      reason: "blank_status_or_type_in_csv",
      csvLineNumber: p.csvLineNumber,
      raw: {
        status: p.raw.status,
        type: p.raw.type,
        building: p.buildingId,
        name: p.data.name,
      },
    });
    flaggedRows += 1;
  }
  console.log(`Flagged rows (blank status/type): ${flaggedRows}`);

  // Compatibility aliases so the rest of the script reads smoothly.
  const createdProperties = inserted;
  const updatedProperties = updated;
  void createdProperties;
  void updatedProperties;

  console.log(`\n=== Properties ===`);
  console.log(
    `Created: ${createdProperties}, Updated: ${updatedProperties}, Skipped: ${skippedRows}, Flagged: ${flaggedRows}`,
  );

  // ─── Step 4: Contact reconciliation ────────────────────────────────────
  console.log(`\n=== Contact reconciliation ===`);

  // Build a display-name lookup (case-insensitive) and a storage-name lookup.
  const buildings = await prisma.building.findMany({
    select: { id: true, storageName: true, displayName: true },
  });
  const byDisplayLower = new Map<string, string>();
  const byStorageLower = new Map<string, string>();
  for (const b of buildings) {
    byDisplayLower.set(b.displayName.toLowerCase(), b.id);
    byStorageLower.set(b.storageName.toLowerCase(), b.id);
  }

  function resolveBuildingId(value: string): string | null {
    const lower = value.toLowerCase();
    return byDisplayLower.get(lower) ?? byStorageLower.get(lower) ?? null;
  }

  // Contacts whose legacy `buildings[]` still carry data. This uses a raw
  // query so TypeScript doesn't complain after Migration B drops the column —
  // the query returns zero rows in that world and the reconciliation skips.
  // Before Migration B, this matches contacts that still need FK assignment.
  let contactsWithLegacy: Array<{ id: string; buildings: string[]; fullName: string }> = [];
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; buildings: string[]; fullName: string }>>(
      `SELECT id, buildings, full_name AS "fullName"
       FROM contacts
       WHERE building_id IS NULL
         AND array_length(buildings, 1) IS NOT NULL
         AND array_length(buildings, 1) > 0`,
    );
    contactsWithLegacy = rows;
  } catch (err) {
    // Column `buildings` no longer exists (post-Migration B) → zero work here.
    console.log(
      `  (skipping contact reconciliation — \`buildings\` column dropped: ${(err as Error).message})`,
    );
  }

  let contactsMatched = 0;
  let contactsClearedComplex = 0;
  let contactsClearedNonVmi = 0;
  let contactsAmbiguous = 0;
  let contactsNoMatch = 0;

  for (const c of contactsWithLegacy) {
    const raw = c.buildings.map((x) => x.trim()).filter((x) => x.length > 0);
    if (raw.length === 0) continue;

    // Special-case legacy complex / non-vminvest tags before ordinary matching.
    // These are handled at the *presence* level — if the first entry is one of
    // these, clear the field and log per §3.3.2.
    const first = raw[0];
    if (first === "МТМ") {
      await recordContactMigration(c.id, {
        fromValue: raw.join(", "),
        reason: "complex_mtm",
        note: "Мигриран от комплекс МТМ — присвои сграда ръчно",
      });
      contactsClearedComplex += 1;
      continue;
    }
    if (first === "ЦИТ") {
      await recordContactMigration(c.id, {
        fromValue: raw.join(", "),
        reason: "complex_tsit",
        note: "Мигриран от комплекс ЦИТ — присвои сграда ръчно",
      });
      contactsClearedComplex += 1;
      continue;
    }
    if (first === "Манастирски ливади") {
      await recordContactMigration(c.id, {
        fromValue: raw.join(", "),
        reason: "not_vminvest",
        note: "Не е сграда на VM invest — изчистено при миграция.",
      });
      contactsClearedNonVmi += 1;
      continue;
    }

    // Ordinary single-value or first-of-many match.
    const match = resolveBuildingId(first);
    if (match) {
      await prisma.contact.update({
        where: { id: c.id },
        data: { buildingId: match },
      });
      if (raw.length > 1) {
        await recordContactMigration(c.id, {
          fromValue: raw.join(", "),
          reason: "ambiguous_multi",
          note: `Взехме първата стойност (${first}). Провери ръчно.`,
        });
        contactsAmbiguous += 1;
      } else {
        contactsMatched += 1;
      }
    } else {
      await recordContactMigration(c.id, {
        fromValue: raw.join(", "),
        reason: "unresolved",
        note: "Стойността не съвпада с известна сграда.",
      });
      contactsNoMatch += 1;
    }
  }

  console.log(
    `Matched: ${contactsMatched}, Ambiguous (multi, first used): ${contactsAmbiguous}, Cleared (complex): ${contactsClearedComplex}, Cleared (not vminvest): ${contactsClearedNonVmi}, No-match: ${contactsNoMatch}`,
  );

  // ─── Step 5: Verification ──────────────────────────────────────────────
  console.log(`\n=== Verification (§7.3) ===`);

  const totalProperties = await prisma.property.count({ where: { deletedAt: null } });
  console.log(`Total properties (excl. soft-deleted): ${totalProperties} (expected 2158)`);

  const perBuilding = await prisma.property.groupBy({
    by: ["buildingId"],
    where: { deletedAt: null },
    _count: { _all: true },
  });
  const buildingLookup = new Map(buildings.map((b) => [b.id, b.storageName]));
  const byStorage = [...perBuilding]
    .map((c) => ({
      storageName: buildingLookup.get(c.buildingId) ?? "???",
      count: c._count._all,
    }))
    .sort((a, b) => a.storageName.localeCompare(b.storageName, "bg"));
  console.log(`\nPer-building counts:`);
  for (const row of byStorage) {
    console.log(`  ${row.storageName.padEnd(16)} ${row.count}`);
  }

  const perStatus = await prisma.property.groupBy({
    by: ["status"],
    where: { deletedAt: null },
    _count: { _all: true },
  });
  console.log(`\nPer-status counts:`);
  for (const row of perStatus.sort((a, b) => b._count._all - a._count._all)) {
    console.log(`  ${row.status.padEnd(28)} ${row._count._all}`);
  }

  const perType = await prisma.property.groupBy({
    by: ["type"],
    where: { deletedAt: null },
    _count: { _all: true },
  });
  console.log(`\nPer-type counts:`);
  for (const row of perType.sort((a, b) => b._count._all - a._count._all)) {
    console.log(`  ${row.type.padEnd(14)} ${row._count._all}`);
  }

  console.log(`\n✔ Import complete.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
