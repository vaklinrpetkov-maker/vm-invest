import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  buildPropertyWhere,
  parsePropertyFilters,
  type PropertySearchParams,
} from "@/lib/properties/filters";

export const dynamic = "force-dynamic";

// Admin-only CSV export for /properties — respects the same URL filters as
// the list page. Output column order mirrors files/Properties/all-properties.csv
// so the export is a clean round-trip.

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function numOrEmpty(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

const HEADER = [
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

export async function GET(request: NextRequest) {
  await requireRole("admin");

  const params: PropertySearchParams = {};
  request.nextUrl.searchParams.forEach((value, key) => {
    const existing = params[key as keyof PropertySearchParams];
    if (existing === undefined) {
      (params as Record<string, string | string[]>)[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      (params as Record<string, string | string[]>)[key] = [existing, value];
    }
  });

  const filters = parsePropertyFilters(params);
  const rows = await prisma.property.findMany({
    where: buildPropertyWhere(filters),
    include: {
      building: { select: { storageName: true } },
    },
    orderBy: [{ building: { displayName: "asc" } }, { name: "asc" }],
  });

  const lines: string[] = [];
  lines.push(HEADER.map(csvEscape).join(","));

  for (const p of rows) {
    const row = [
      p.building.storageName,
      p.name,
      p.status,
      p.entrance ?? "",
      numOrEmpty(p.floor),
      p.type,
      p.description ?? "",
      // Sellers array round-trips as a comma-joined string so the CSV stays
      // compatible with files/Properties/all-properties.csv (the import path
      // splits on `,` and canonicalises via `parseSellerInput`).
      p.sellers.join(", "),
      numOrEmpty(p.expectedPriceEur),
      numOrEmpty(p.priceEur),
      numOrEmpty(p.yardTerracePriceEur),
      numOrEmpty(p.totalAreaM2),
      numOrEmpty(p.commonPartsM2),
      numOrEmpty(p.netAreaM2),
      numOrEmpty(p.idealPartsCoef),
      numOrEmpty(p.bathroomCount),
      numOrEmpty(p.yardM2),
      numOrEmpty(p.terraceM2),
      numOrEmpty(p.landM2),
      numOrEmpty(p.landPct),
      numOrEmpty(p.yardPct),
      p.contractLabel ?? "",
      p.hasCredit === true ? "TRUE" : p.hasCredit === false ? "FALSE" : "",
      p.buyerLabel ?? "",
      numOrEmpty(p.priceBgnOriginal),
      numOrEmpty(p.expectedPriceBgnOriginal),
      numOrEmpty(p.yardTerracePriceBgnOriginal),
    ];
    lines.push(row.map(csvEscape).join(","));
  }

  const body = "\uFEFF" + lines.join("\n");
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="properties-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
