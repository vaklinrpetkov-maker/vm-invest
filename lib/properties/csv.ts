import { parse } from "csv-parse/sync";
import { Prisma } from "@prisma/client";
import {
  PROPERTY_STATUS_DEFAULT,
  PROPERTY_TYPE_DEFAULT,
  isValidPropertyStatus,
  isValidPropertyType,
} from "./constants";
import { parseSellerInput } from "./sellers-normalize";

// Shared CSV parsing + row-validation for the Properties module. Used by:
//   - scripts/import-properties.ts  (full-CSV seed, includes all buildings)
//   - app/api/properties/import     (per-building admin upload)
//
// Both surfaces consume the same 27-column layout as files/Properties/
// all-properties.csv so a round-trip Excel workflow stays honest.

// ─── Column positions ──────────────────────────────────────────────────────
// The CSV is position-addressed rather than header-addressed because the
// headers can arrive Windows-1251 OR UTF-8 and matching on the decoded
// Cyrillic is fragile. Positions match all-properties.csv exactly.
export const COL = {
  BUILDING: 0,
  NAME: 1,
  STATUS: 2,
  ENTRANCE: 3,
  FLOOR: 4,
  TYPE: 5,
  DESCRIPTION: 6,
  SELLER: 7,
  EXPECTED_PRICE_EUR: 8,
  PRICE_EUR: 9,
  YARD_TERRACE_EUR: 10,
  TOTAL_AREA: 11,
  COMMON_PARTS: 12,
  NET_AREA: 13,
  IDEAL_COEF: 14,
  BATHROOMS: 15,
  YARD_M2: 16,
  TERRACE_M2: 17,
  LAND_M2: 18,
  LAND_PCT: 19,
  YARD_PCT: 20,
  CONTRACTS: 21,
  CREDIT: 22,
  BUYER: 23,
  PRICE_BGN_ORIG: 24,
  EXPECTED_PRICE_BGN_ORIG: 25,
  YARD_TERRACE_BGN_ORIG: 26,
} as const;

// Header row in Bulgarian, matching files/Properties/all-properties.csv
// character-for-character. Emitted by the template-download endpoint and the
// per-building export.
export const CSV_HEADER = [
  "Сграда",
  "Name",
  "Статус",
  "Вход",
  "Етаж",
  "Тип",
  "Описание",
  "Продавач",
  "Очаквана цена (EUR)",
  "Цена (EUR)",
  "Цена двор/тераса (EUR)",
  "Квадратура общо",
  "Общи части",
  "Чиста площ",
  "Коеф. ид.ч",
  "Брой бани",
  "Двор, м2",
  "Тераси, м2",
  "Земя, м2",
  "Земя, %",
  "Двор, %",
  "ДОГОВОРИ",
  "Кредит",
  "Купувач",
  "Цена (BGN, оригинал)",
  "Очаквана цена (BGN, оригинал)",
  "Цена двор/тераса (BGN, оригинал)",
];

// ─── Encoding detection ────────────────────────────────────────────────────
// The original seed CSV is Windows-1251; the app's export emits UTF-8 with a
// BOM. Either can come back through the import endpoint. Try UTF-8 first and
// fall back to cp1251 if the decode produced replacement chars.
export function decodeBytes(bytes: Buffer | Uint8Array): {
  text: string;
  encoding: "utf-8" | "windows-1251";
} {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (!utf8.includes("\uFFFD")) {
    return { text: utf8, encoding: "utf-8" };
  }
  const cp1251 = new TextDecoder("windows-1251").decode(bytes);
  return { text: cp1251, encoding: "windows-1251" };
}

// ─── Cell parsers ──────────────────────────────────────────────────────────
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

function parseDecimalOrNull(s: string | undefined): Prisma.Decimal | null {
  const v = orNull(s);
  if (v === null) return null;
  const n = Number(v.replace(/,/g, "."));
  if (!Number.isFinite(n)) return null;
  return new Prisma.Decimal(v.replace(/,/g, "."));
}

function parseBoolOrNull(s: string | undefined): boolean | null {
  const v = orNull(s);
  if (v === null) return null;
  const upper = v.toUpperCase();
  if (upper === "TRUE" || upper === "ДА") return true;
  if (upper === "FALSE" || upper === "НЕ") return false;
  return null;
}

// ─── Parsed row shape ──────────────────────────────────────────────────────
export type ParsedPropertyRow = {
  csvLine: number; // 1-indexed source line (after header), for error messages
  buildingStorageName: string | null; // null if Сграда column was blank
  name: string;
  data: Omit<Prisma.PropertyCreateManyInput, "buildingId">;
  wasStatusBlank: boolean;
  wasTypeBlank: boolean;
};

export type CsvParseError = {
  csvLine: number;
  message: string;
};

export type CsvParseResult = {
  rows: ParsedPropertyRow[];
  errors: CsvParseError[];
  encoding: "utf-8" | "windows-1251";
};

// ─── Main entry point ──────────────────────────────────────────────────────
// Parses a raw byte buffer into validated property rows. Does NOT touch the
// database. Callers decide how to persist (insert vs upsert, which building
// to attach) based on the returned rows.
//
// Validation is per-row + non-fatal: a bad row adds an entry to `errors` and
// does NOT appear in `rows`. The caller can decide whether partial errors
// abort the import or not.
export function parsePropertiesCsv(bytes: Buffer | Uint8Array): CsvParseResult {
  const { text, encoding } = decodeBytes(bytes);

  let records: string[][];
  try {
    records = parse(text, {
      columns: false,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_quotes: true,
      relax_column_count: true,
    }) as string[][];
  } catch (err) {
    return {
      rows: [],
      errors: [{ csvLine: 0, message: `Невалиден CSV: ${(err as Error).message}` }],
      encoding,
    };
  }

  // Heuristic: if the first row contains a literal "Сграда" or "Name" cell
  // it's a header and we skip it. Otherwise treat as data.
  const firstCell = (records[0]?.[0] ?? "").trim();
  const secondCell = (records[0]?.[1] ?? "").trim();
  const hasHeader =
    firstCell.toLowerCase() === "сграда" ||
    secondCell.toLowerCase() === "name";
  const dataRows = hasHeader ? records.slice(1) : records;

  const rows: ParsedPropertyRow[] = [];
  const errors: CsvParseError[] = [];

  for (let idx = 0; idx < dataRows.length; idx++) {
    const r = dataRows[idx];
    const csvLine = idx + 1 + (hasHeader ? 1 : 0); // human-readable line

    const buildingStorageName = orNull(r[COL.BUILDING]);
    const name = orNull(r[COL.NAME]);

    if (!name) {
      errors.push({ csvLine, message: "Липсва колона Name (име на имота)." });
      continue;
    }

    const rawStatus = orNull(r[COL.STATUS]);
    const rawType = orNull(r[COL.TYPE]);

    const status = rawStatus ?? PROPERTY_STATUS_DEFAULT;
    const type = rawType ?? PROPERTY_TYPE_DEFAULT;

    if (rawStatus && !isValidPropertyStatus(rawStatus)) {
      errors.push({
        csvLine,
        message: `Невалиден статус: "${rawStatus}". Позволени: виж колона Статус в шаблона.`,
      });
      continue;
    }
    if (rawType && !isValidPropertyType(rawType)) {
      errors.push({
        csvLine,
        message: `Невалиден тип: "${rawType}". Позволени: виж колона Тип в шаблона.`,
      });
      continue;
    }

    rows.push({
      csvLine,
      buildingStorageName,
      name,
      wasStatusBlank: rawStatus === null,
      wasTypeBlank: rawType === null,
      data: {
        name,
        status,
        type,
        entrance: orNull(r[COL.ENTRANCE]),
        floor: parseIntOrNull(r[COL.FLOOR]),
        description: orNull(r[COL.DESCRIPTION]),
        // CSV `Продавач` column may carry comma-separated values for
        // co-ownership cases and many typo variants. Normalize on import
        // (split + canonicalise + dedupe) so the imported `sellers` array
        // is already clean.
        sellers: parseSellerInput(r[COL.SELLER] ?? null),
        expectedPriceEur: parseDecimalOrNull(r[COL.EXPECTED_PRICE_EUR]),
        priceEur: parseDecimalOrNull(r[COL.PRICE_EUR]),
        yardTerracePriceEur: parseDecimalOrNull(r[COL.YARD_TERRACE_EUR]),
        totalAreaM2: parseDecimalOrNull(r[COL.TOTAL_AREA]),
        commonPartsM2: parseDecimalOrNull(r[COL.COMMON_PARTS]),
        netAreaM2: parseDecimalOrNull(r[COL.NET_AREA]),
        idealPartsCoef: parseDecimalOrNull(r[COL.IDEAL_COEF]),
        bathroomCount: parseIntOrNull(r[COL.BATHROOMS]),
        yardM2: parseDecimalOrNull(r[COL.YARD_M2]),
        terraceM2: parseDecimalOrNull(r[COL.TERRACE_M2]),
        landM2: parseDecimalOrNull(r[COL.LAND_M2]),
        landPct: parseDecimalOrNull(r[COL.LAND_PCT]),
        yardPct: parseDecimalOrNull(r[COL.YARD_PCT]),
        contractLabel: orNull(r[COL.CONTRACTS]),
        buyerLabel: orNull(r[COL.BUYER]),
        hasCredit: parseBoolOrNull(r[COL.CREDIT]),
        priceBgnOriginal: parseDecimalOrNull(r[COL.PRICE_BGN_ORIG]),
        expectedPriceBgnOriginal: parseDecimalOrNull(r[COL.EXPECTED_PRICE_BGN_ORIG]),
        yardTerracePriceBgnOriginal: parseDecimalOrNull(r[COL.YARD_TERRACE_BGN_ORIG]),
      },
    });
  }

  return { rows, errors, encoding };
}
