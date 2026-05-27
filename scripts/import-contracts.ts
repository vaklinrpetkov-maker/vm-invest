// Seed import for the Contracts module.
// Usage:  npm run contracts:import
//
// Reads files/Contracts/Contracts.xlsx:
//   - sheet `договори flat` (872 contracts × 94 columns) for the bulk data
//   - sheet `договори 💵` for the Reminder Date column (Дата напомняне)
//
// Bulk-insert strategy: parse everything in-memory, wipe existing contracts
// (cascades), then run ~5 bulk `createMany`/`createManyAndReturn` calls.
// Roughly 10 round-trips to the DB total — seconds, not minutes.
//
// Per CSV row:
//   1. one Contract row (best-effort Contact FK match on buyer name)
//   2. one ContractProperty link per property parsed from the title
//   3. four ContractPayment rows (one per Вноска)
//   4. ContractInstallment rows per non-blank event we keep:
//        ДГ / ПД / СМР Банка   → BANK track
//        СМР Кеш              → CASH track
//      Dropped events: Доплащане 1/2, Нотариален акт, Договор за заем.
//
// contractType derived from which tracks have installments:
//   - both tracks (and any СМР Банка)         → SMR_KOMBINIRAN
//   - CASH only                                → SMR_KESH
//   - BANK only with any СМР Банка amount      → SMR_BANKA
//   - BANK only without СМР Банка / no track   → BEZ_SMR
//
// Contract.signedAt priority: ПД В1 date, else ДГ В1 date, else null.

import { Prisma, PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import { resolve } from "node:path";

const prisma = new PrismaClient();

const FLAT_SHEET = "договори flat";
const DOLLAR_SHEET = "договори 💵";

// Column indices current as of 2026-04-24. Note: the user added "Вид договор"
// (idx 5, e.g. "ПД" / "ДГ") between "Сграда" and the old "Тип договор",
// shifting everything after E by one column. If more columns appear upstream,
// re-run scripts/debug-first-contract.ts to re-derive these.
const COL = {
  TITLE: 0,
  BUYER: 1,
  SALESPERSON: 2,
  PRE_OR_POST: 3,
  BUILDING: 4,
  VID_DOGOVOR: 5,        // "Вид договор" — e.g. "ПД", "ДГ" (captured for future use)
  CONTRACT_TYPE_RAW: 6,  // "Тип договор" — "СМР кеш" / "СМР банка" etc.
  COMPOSITION: 7,        // "Апартамент или Апартамент+Г/ПМ"
  TOTAL_DUE: 8,          // "Обща дължима сума"
  USES_CREDIT: 9,        // "Кредит"
};

const BLOCK_STARTS = [10, 31, 52, 73];
const BLOCK = {
  DUE: 0,
  PAID: 1,
  REMAINING: 2,
  DG_AMT: 3,
  DG_DATE: 4,
  PD_AMT: 5,
  PD_DATE: 6,
  SMR_BANK_AMT: 7,
  SMR_BANK_DATE: 8,
  SMR_CASH_AMT: 9,
  SMR_CASH_DATE: 10,
} as const;

const COL_TOTAL_REMAINING = 94;

// ─── Helpers ──────────────────────────────────────────────────────────────

function parseMoney(raw: unknown): Prisma.Decimal | null {
  if (raw === null || raw === undefined || raw === "") return null;
  // "€148,590.00" → 148590.00. Strip all non-digit/non-decimal chars except
  // leading minus.
  const s = String(raw)
    .replace(/[€$лвA-Za-zА-Яа-я\s,]/g, "")
    .trim();
  if (!s || s === "-") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return new Prisma.Decimal(n);
}

function parseDate(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T00:00:00Z`);
  }
  const n = Number(s);
  if (Number.isFinite(n) && n > 25000 && n < 60000) {
    return new Date(Math.round((n - 25569) * 86400 * 1000));
  }
  return null;
}

function parseBool(raw: unknown): boolean {
  if (raw === null || raw === undefined) return false;
  const s = String(raw).trim().toLowerCase();
  return s === "да" || s === "yes" || s === "true" || s === "1";
}

function orNull(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// Naive property resolver.
//   title: "Людмил Икономов-Царевец-ап.27, вх.А и гараж 18 и гараж 19"
//   building: "Царевец"
// Compare each Property name (e.g. "Ап.27") against the normalized title;
// match if present. Loose spacing/dot handling.
function resolveProperties(
  title: string,
  building: string | null,
  all: Array<{ id: string; name: string; buildingDisplayName: string | null }>,
): string[] {
  if (!building) return [];
  const candidates = all.filter((p) => p.buildingDisplayName === building);
  if (candidates.length === 0) return [];

  const titleNorm = title.toLowerCase().replace(/[\s.]/g, "");
  const matches = new Set<string>();

  for (const p of candidates) {
    const nameNorm = p.name.toLowerCase().replace(/[\s.]/g, "");
    if (nameNorm.length >= 2 && titleNorm.includes(nameNorm)) {
      matches.add(p.id);
    }
  }
  return [...matches];
}

// ─── Main ────────────────────────────────────────────────────────────────

type ParsedContract = {
  title: string;
  buyerFullName: string;
  contactId: string | null;
  salesperson: string | null;
  building: string | null;
  contractType: "SMR_KESH" | "SMR_BANKA" | "SMR_KOMBINIRAN" | "BEZ_SMR";
  compositionStatus: string | null;
  preOrPost: string | null;
  usesCredit: boolean;
  totalDueEur: Prisma.Decimal;
  totalPaidEur: Prisma.Decimal;
  totalRemainingEur: Prisma.Decimal;
  signedAt: Date | null;
  reminderDate: Date | null;
  propertyIds: string[];
  payments: Array<{
    number: number;
    dueEur: Prisma.Decimal;
    paidEur: Prisma.Decimal;
    remainingEur: Prisma.Decimal;
    installments: Array<{
      track: "CASH" | "BANK";
      amountEur: Prisma.Decimal;
      paidAt: Date | null;
    }>;
  }>;
};

async function main(): Promise<void> {
  const path = resolve(process.cwd(), "files/Contracts/Contracts.xlsx");
  const wb = XLSX.readFile(path);

  const flatWs = wb.Sheets[FLAT_SHEET];
  const dollarWs = wb.Sheets[DOLLAR_SHEET];
  if (!flatWs) throw new Error(`Sheet "${FLAT_SHEET}" not found`);
  if (!dollarWs) throw new Error(`Sheet "${DOLLAR_SHEET}" not found`);

  const flatRows = XLSX.utils.sheet_to_json<unknown[]>(flatWs, {
    header: 1,
    raw: false,
    blankrows: false,
  });
  const dollarRows = XLSX.utils.sheet_to_json<unknown[]>(dollarWs, {
    header: 1,
    raw: false,
    blankrows: false,
  });

  console.log(`Flat sheet: ${flatRows.length - 1} data rows`);
  console.log(`💵 sheet: ${dollarRows.length - 1} total rows`);

  // Build reminder-date lookup from the 💵 sheet (parent rows only).
  const reminderByTitle = new Map<string, Date>();
  for (let i = 1; i < dollarRows.length; i++) {
    const row = dollarRows[i];
    const title = orNull(row[0]);
    if (!title || title === "Subitems") continue;
    const reminder = parseDate(row[3]);
    if (reminder) reminderByTitle.set(title, reminder);
  }
  console.log(`Reminder dates in 💵 sheet: ${reminderByTitle.size}`);

  // Preload contacts + properties for matching.
  const contactRows = await prisma.contact.findMany({
    select: { id: true, fullName: true },
  });
  const contactByName = new Map<string, string>();
  for (const c of contactRows) contactByName.set(normalizeName(c.fullName), c.id);

  const propertyRows = await prisma.property.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      building: { select: { displayName: true } },
    },
  });
  const properties = propertyRows.map((p) => ({
    id: p.id,
    name: p.name,
    buildingDisplayName: p.building?.displayName ?? null,
  }));

  console.log(`DB preload: ${contactRows.length} contacts, ${properties.length} properties`);

  // ─── Parse all rows into in-memory structures ────────────────────────
  const contracts: ParsedContract[] = [];
  let skipped = 0;
  let contactMatched = 0;
  let paidMismatchCount = 0;

  for (let i = 1; i < flatRows.length; i++) {
    const row = flatRows[i];
    const title = orNull(row[COL.TITLE]);
    if (!title) {
      skipped++;
      continue;
    }
    const buyerFullName =
      orNull(row[COL.BUYER]) ?? title.split("-")[0] ?? "Неизвестен";

    const contactId = contactByName.get(normalizeName(buyerFullName)) ?? null;
    if (contactId) contactMatched++;

    const salesperson = orNull(row[COL.SALESPERSON]);
    const preOrPost = orNull(row[COL.PRE_OR_POST]);
    const building = orNull(row[COL.BUILDING]);
    const compositionStatus = orNull(row[COL.COMPOSITION])?.replace(/\r?\n/g, " ").trim() ?? null;
    const totalDueEur = parseMoney(row[COL.TOTAL_DUE]) ?? new Prisma.Decimal(0);
    const usesCredit = parseBool(row[COL.USES_CREDIT]);
    const totalRemainingEur =
      parseMoney(row[COL_TOTAL_REMAINING]) ?? new Prisma.Decimal(0);

    const payments: ParsedContract["payments"] = [];
    // contractType depends ONLY on the two СМР columns, not on ДГ/ПД (which
    // always go to the bank track by rule).
    let hasAnySmrCash = false;
    let hasAnySmrBank = false;
    let signedAt: Date | null = null;

    for (let p = 0; p < 4; p++) {
      const start = BLOCK_STARTS[p];
      const dueEur = parseMoney(row[start + BLOCK.DUE]) ?? new Prisma.Decimal(0);
      const paidEur = parseMoney(row[start + BLOCK.PAID]) ?? new Prisma.Decimal(0);
      const remainingEur =
        parseMoney(row[start + BLOCK.REMAINING]) ?? new Prisma.Decimal(0);

      const insts: ParsedContract["payments"][number]["installments"] = [];

      const dgAmt = parseMoney(row[start + BLOCK.DG_AMT]);
      const dgDate = parseDate(row[start + BLOCK.DG_DATE]);
      const pdAmt = parseMoney(row[start + BLOCK.PD_AMT]);
      const pdDate = parseDate(row[start + BLOCK.PD_DATE]);
      const smrBankAmt = parseMoney(row[start + BLOCK.SMR_BANK_AMT]);
      const smrBankDate = parseDate(row[start + BLOCK.SMR_BANK_DATE]);
      const smrCashAmt = parseMoney(row[start + BLOCK.SMR_CASH_AMT]);
      const smrCashDate = parseDate(row[start + BLOCK.SMR_CASH_DATE]);

      if (dgAmt && dgAmt.gt(0)) {
        insts.push({ track: "BANK", amountEur: dgAmt, paidAt: dgDate });
      }
      if (pdAmt && pdAmt.gt(0)) {
        insts.push({ track: "BANK", amountEur: pdAmt, paidAt: pdDate });
      }
      if (smrBankAmt && smrBankAmt.gt(0)) {
        insts.push({ track: "BANK", amountEur: smrBankAmt, paidAt: smrBankDate });
        hasAnySmrBank = true;
      }
      if (smrCashAmt && smrCashAmt.gt(0)) {
        insts.push({ track: "CASH", amountEur: smrCashAmt, paidAt: smrCashDate });
        hasAnySmrCash = true;
      }

      if (p === 0) {
        if (pdDate) signedAt = pdDate;
        else if (dgDate) signedAt = dgDate;
      }

      const instSum = insts.reduce(
        (s, it) => s.plus(it.amountEur),
        new Prisma.Decimal(0),
      );
      if (paidEur.gt(0) && paidEur.minus(instSum).abs().gt(0.02)) {
        paidMismatchCount++;
      }

      payments.push({ number: p + 1, dueEur, paidEur, remainingEur, installments: insts });
    }

    let contractType: ParsedContract["contractType"];
    if (hasAnySmrCash && hasAnySmrBank) contractType = "SMR_KOMBINIRAN";
    else if (hasAnySmrCash) contractType = "SMR_KESH";
    else if (hasAnySmrBank) contractType = "SMR_BANKA";
    else contractType = "BEZ_SMR";

    const totalPaidEur = payments.reduce(
      (s, p) => s.plus(p.paidEur),
      new Prisma.Decimal(0),
    );

    contracts.push({
      title,
      buyerFullName,
      contactId,
      salesperson,
      building,
      contractType,
      compositionStatus,
      preOrPost,
      usesCredit,
      totalDueEur,
      totalPaidEur,
      totalRemainingEur,
      signedAt,
      reminderDate: reminderByTitle.get(title) ?? null,
      propertyIds: resolveProperties(title, building, properties),
      payments,
    });
  }

  console.log(`Parsed: ${contracts.length} contracts`);

  // ─── Disambiguate duplicate titles ───────────────────────────────────────
  // The CSV doesn't enforce title uniqueness; a handful of contracts end up
  // with identical "<buyer>-<building>-<unit>" strings. We append a
  // "(дубликат N)" suffix so each contract has a distinct lookup key in the
  // contractIdByTitle Map below. No data is dropped.
  const titleCount = new Map<string, number>();
  let duplicatesRelabeled = 0;
  for (const c of contracts) {
    const n = (titleCount.get(c.title) ?? 0) + 1;
    titleCount.set(c.title, n);
    if (n > 1) {
      c.title = `${c.title} (дубликат ${n})`;
      duplicatesRelabeled++;
    }
  }
  if (duplicatesRelabeled > 0) {
    console.log(`Disambiguated ${duplicatesRelabeled} duplicate titles`);
  }

  // ─── Wipe existing + bulk insert ────────────────────────────────────────
  console.log(`\nWiping existing contracts…`);
  const del = await prisma.contract.deleteMany({});
  console.log(`  deleted ${del.count} existing contracts (cascaded payments + installments + links)`);

  console.log(`\nBulk inserting contracts…`);
  const contractRows = contracts.map((c) => ({
    title: c.title,
    buyerFullName: c.buyerFullName,
    contactId: c.contactId,
    salesperson: c.salesperson,
    building: c.building,
    contractType: c.contractType,
    compositionStatus: c.compositionStatus,
    preOrPost: c.preOrPost,
    usesCredit: c.usesCredit,
    totalDueEur: c.totalDueEur,
    totalPaidEur: c.totalPaidEur,
    totalRemainingEur: c.totalRemainingEur,
    status: "signed",
    source: "imported",
    signedAt: c.signedAt,
    reminderDate: c.reminderDate,
  }));

  const createdContracts = await prisma.contract.createManyAndReturn({
    data: contractRows,
    select: { id: true, title: true },
  });
  console.log(`  inserted ${createdContracts.length} contracts`);

  const contractIdByTitle = new Map<string, string>();
  for (const c of createdContracts) contractIdByTitle.set(c.title, c.id);

  // ─── Bulk insert payments ──────────────────────────────────────────────
  console.log(`\nBulk inserting payments…`);
  const paymentRows = contracts.flatMap((c) => {
    const contractId = contractIdByTitle.get(c.title);
    if (!contractId) return [];
    return c.payments.map((p) => ({
      contractId,
      number: p.number,
      dueEur: p.dueEur,
      paidEur: p.paidEur,
      remainingEur: p.remainingEur,
    }));
  });
  const createdPayments = await prisma.contractPayment.createManyAndReturn({
    data: paymentRows,
    select: { id: true, contractId: true, number: true },
  });
  console.log(`  inserted ${createdPayments.length} payments`);

  const paymentIdByKey = new Map<string, string>();
  for (const p of createdPayments) {
    paymentIdByKey.set(`${p.contractId}::${p.number}`, p.id);
  }

  // ─── Bulk insert installments ──────────────────────────────────────────
  console.log(`\nBulk inserting installments…`);
  const installmentRows: Prisma.ContractInstallmentCreateManyInput[] = [];
  for (const c of contracts) {
    const contractId = contractIdByTitle.get(c.title);
    if (!contractId) continue;
    for (const p of c.payments) {
      const paymentId = paymentIdByKey.get(`${contractId}::${p.number}`);
      if (!paymentId) continue;
      for (const i of p.installments) {
        installmentRows.push({
          paymentId,
          track: i.track,
          amountEur: i.amountEur,
          paidAt: i.paidAt,
        });
      }
    }
  }
  if (installmentRows.length > 0) {
    // chunk at 500 to stay under parameter limits on a single INSERT.
    const chunkSize = 500;
    let inserted = 0;
    for (let i = 0; i < installmentRows.length; i += chunkSize) {
      const res = await prisma.contractInstallment.createMany({
        data: installmentRows.slice(i, i + chunkSize),
      });
      inserted += res.count;
    }
    console.log(`  inserted ${inserted} installments`);
  } else {
    console.log(`  no installments to insert`);
  }

  // ─── Bulk insert contract-property links ───────────────────────────────
  console.log(`\nBulk inserting contract-property links…`);
  const linkRows: Prisma.ContractPropertyCreateManyInput[] = [];
  for (const c of contracts) {
    const contractId = contractIdByTitle.get(c.title);
    if (!contractId || c.propertyIds.length === 0) continue;
    for (const pid of c.propertyIds) {
      linkRows.push({ contractId, propertyId: pid });
    }
  }
  if (linkRows.length > 0) {
    const res = await prisma.contractProperty.createMany({
      data: linkRows,
      skipDuplicates: true,
    });
    console.log(`  inserted ${res.count} contract-property links`);
  } else {
    console.log(`  no contract-property links (title parser didn't match)`);
  }

  // ─── Summary ───────────────────────────────────────────────────────────
  console.log(`\n=== Summary ===`);
  console.log(`Contracts created: ${createdContracts.length}`);
  console.log(`Payments created: ${createdPayments.length}`);
  console.log(`Installments created: ${installmentRows.length}`);
  console.log(`Property links: ${linkRows.length}`);
  console.log(`Skipped rows (no title): ${skipped}`);
  console.log(`Contact matches: ${contactMatched} / ${contracts.length}`);
  console.log(`Paid-vs-installments mismatches (> 0.02 EUR): ${paidMismatchCount}`);

  const perType = await prisma.contract.groupBy({
    by: ["contractType"],
    _count: { _all: true },
  });
  console.log(`\nContracts by type:`);
  for (const row of perType.sort((a, b) => b._count._all - a._count._all)) {
    console.log(`  ${row.contractType.padEnd(16)} ${row._count._all}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
