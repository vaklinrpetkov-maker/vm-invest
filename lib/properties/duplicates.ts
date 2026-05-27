import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/lib/prisma";
import { parsePropertiesCsv } from "./csv";

// Finds CSV rows that were dropped during seed because they collided on the
// natural key `(Сграда, Name)`. The import script uses "last-write wins"
// upsert by that key — so for every group with >1 CSV rows, only the final
// occurrence made it into the DB. The earlier occurrences are gone.
//
// This helper re-parses the CSV, reconstructs the duplicate groups, and joins
// against the current DB so admins can see:
//   - what landed (the winning row)
//   - what was lost (the earlier CSV rows, with line numbers)
//
// Used by /admin/duplicates. Not cheap (parses 2158 rows + one DB read), but
// this is an ad-hoc review tool — not a per-request hot path.

const CSV_PATH = "files/Properties/all-properties.csv";

export type DuplicateRow = {
  csvLine: number;
  status: string | null;
  type: string | null;
  description: string | null;
  // Stored as joined-by-comma string for display in the duplicate-review
  // table — the underlying data on Property is `sellers: string[]`.
  sellers: string;
  priceEur: string | null;
  expectedPriceEur: string | null;
  buyerLabel: string | null;
  contractLabel: string | null;
};

export type DuplicateGroup = {
  buildingStorageName: string;
  buildingId: string | null; // null if the building row somehow doesn't exist
  buildingDisplayName: string;
  name: string;
  // The row that won during import (null if it was soft-deleted after seed).
  winningPropertyId: string | null;
  winner: DuplicateRow | null;
  // Earlier CSV rows that lost to the winner.
  losers: DuplicateRow[];
};

// Accept Prisma's nullable-or-undefined shapes directly — simplifies callers.
type ParsedData = {
  status: string;
  type: string;
  description?: string | null;
  // Either the new array (from CSV parse) or the legacy single string
  // (from existing DB rows mid-migration). Joined on display. The Prisma
  // bulk-input type widens this to `string[] | { set: string[] }` which we
  // unwrap in `toDuplicateRow`.
  sellers?: string[] | { set: string[] };
  seller?: string | null;
  priceEur?: unknown;
  expectedPriceEur?: unknown;
  buyerLabel?: string | null;
  contractLabel?: string | null;
};

function toDuplicateRow(csvLine: number, data: ParsedData): DuplicateRow {
  // Prefer the new sellers[] when present; fall back to the legacy single
  // seller string. The duplicate-review tool reads from two sources (CSV +
  // DB), and during the migration window each may speak a different shape.
  // The Prisma bulk-input wrapper `{ set: string[] }` is also accepted.
  const sellersArray: string[] | undefined = Array.isArray(data.sellers)
    ? data.sellers
    : data.sellers && "set" in data.sellers
      ? data.sellers.set
      : undefined;
  const sellersJoined = sellersArray
    ? sellersArray.join(", ")
    : data.seller ?? "";
  return {
    csvLine,
    status: data.status,
    type: data.type,
    description: data.description ?? null,
    sellers: sellersJoined,
    priceEur:
      data.priceEur === null || data.priceEur === undefined ? null : String(data.priceEur),
    expectedPriceEur:
      data.expectedPriceEur === null || data.expectedPriceEur === undefined
        ? null
        : String(data.expectedPriceEur),
    buyerLabel: data.buyerLabel ?? null,
    contractLabel: data.contractLabel ?? null,
  };
}

export async function getCsvDuplicateGroups(): Promise<DuplicateGroup[]> {
  const bytes = readFileSync(resolve(process.cwd(), CSV_PATH));
  const parsed = parsePropertiesCsv(bytes);

  // Group rows by (storageName, name). Preserve CSV order within each group.
  const groups = new Map<string, typeof parsed.rows>();
  for (const row of parsed.rows) {
    if (!row.buildingStorageName) continue; // rows without Сграда never land anyway
    const key = `${row.buildingStorageName}|||${row.name}`;
    const arr = groups.get(key);
    if (arr) arr.push(row);
    else groups.set(key, [row]);
  }

  // Only keep groups with >1 rows.
  const dupKeys = [...groups.entries()].filter(([, v]) => v.length > 1);
  if (dupKeys.length === 0) return [];

  // Single DB read: fetch all buildings (20) + all properties (<2k) involved.
  const storageNames = [...new Set(dupKeys.map(([, v]) => v[0].buildingStorageName!))];
  const names = [...new Set(dupKeys.flatMap(([, v]) => v.map((r) => r.name)))];

  const buildings = await prisma.building.findMany({
    where: { storageName: { in: storageNames } },
    select: { id: true, storageName: true, displayName: true },
  });
  const buildingByStorage = new Map(buildings.map((b) => [b.storageName, b]));

  const props = await prisma.property.findMany({
    where: {
      buildingId: { in: buildings.map((b) => b.id) },
      name: { in: names },
      deletedAt: null,
    },
    select: { id: true, buildingId: true, name: true },
  });
  const propByKey = new Map(
    props.map((p) => [`${p.buildingId}|||${p.name}`, p.id]),
  );

  const result: DuplicateGroup[] = [];
  for (const [, rows] of dupKeys) {
    const storageName = rows[0].buildingStorageName!;
    const building = buildingByStorage.get(storageName);
    const buildingId = building?.id ?? null;
    const dbId = buildingId ? propByKey.get(`${buildingId}|||${rows[0].name}`) ?? null : null;

    // The winning row (last in CSV order) is what made it into the DB. The
    // rest are "losers" — their CSV data exists only in the file now.
    const lastIdx = rows.length - 1;
    const winnerCsv = rows[lastIdx];
    const losersCsv = rows.slice(0, lastIdx);

    result.push({
      buildingStorageName: storageName,
      buildingId,
      buildingDisplayName: building?.displayName ?? storageName,
      name: rows[0].name,
      winningPropertyId: dbId,
      winner: toDuplicateRow(winnerCsv.csvLine, winnerCsv.data),
      losers: losersCsv.map((r) => toDuplicateRow(r.csvLine, r.data)),
    });
  }

  // Sort: biggest groups first, then alphabetical by building+name.
  result.sort((a, b) => {
    const sizeDiff = (b.losers.length + 1) - (a.losers.length + 1);
    if (sizeDiff !== 0) return sizeDiff;
    return (
      a.buildingDisplayName.localeCompare(b.buildingDisplayName, "bg") ||
      a.name.localeCompare(b.name, "bg", { numeric: true })
    );
  });

  return result;
}
