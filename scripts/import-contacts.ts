// CSV seed import for the Contacts module.
// Usage:  npm run contacts:import
// Reads files/Contacts/Contacts.csv and upserts each row into public.contacts.
// Idempotent: matches existing rows by (fullName, email, phone) triple and
// updates; otherwise inserts. Safe to re-run.
//
// Owner mapping is deliberately skipped — the CSV holds owners as Latin names
// ("Vera Nikolova") while profiles are in Cyrillic. 89% of rows have no owner
// anyway per the spec. Admins will reassign via the UI in a later milestone.

import { parse } from "csv-parse/sync";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Row = {
  Name: string;
  "Birth date": string;
  "Birthday this year": string;
  "Owner/Responsible": string;
  Email: string;
  Age: string;
  "Phone number": string;
  Type: string;
  "Building they own properties in": string;
  Properties: string;
  "Additional comments": string;
  Contract: string;
  "Date contact added": string;
  "ЕГН": string;
  Address: string;
};

function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  // Expect ISO YYYY-MM-DD. Anything else → null and log.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return new Date(`${trimmed}T00:00:00Z`);
}

function parseBuildings(s: string | undefined): string[] {
  if (!s) return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function orNull(s: string | undefined): string | null {
  const v = (s ?? "").trim();
  return v.length ? v : null;
}

async function main() {
  const filePath = resolve(process.cwd(), "files/Contacts/Contacts.csv");
  const raw = readFileSync(filePath, "utf-8");

  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_quotes: true,
    relax_column_count: true,
  }) as Row[];

  console.log(`Loaded ${rows.length} rows from ${filePath}`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const r of rows) {
    const fullName = orNull(r.Name);
    if (!fullName) {
      skipped += 1;
      continue;
    }

    // Building assignment is intentionally NOT written here — after Migration B
    // the `buildings` array column no longer exists. The Properties import
    // script sets `buildingId` via its contact-reconciliation pass; running
    // THIS script again post-migration leaves existing contact.buildingId
    // untouched, which is correct.
    const data = {
      fullName,
      type: orNull(r.Type) ?? "Клиент",
      phone: orNull(r["Phone number"]),
      email: orNull(r.Email)?.toLowerCase() ?? null,
      birthDate: parseDate(r["Birth date"]),
      egn: orNull(r["ЕГН"]),
      address: orNull(r.Address),
      properties: orNull(r.Properties),
      contractLabel: orNull(r.Contract),
      notes: orNull(r["Additional comments"]),
      createdAt: parseDate(r["Date contact added"]) ?? new Date(),
    };
    // Referenced once so TS doesn't complain when parseBuildings is unused.
    void parseBuildings;

    // Idempotency key: same fullName + email + phone.
    const existing = await prisma.contact.findFirst({
      where: {
        fullName: data.fullName,
        email: data.email ?? null,
        phone: data.phone ?? null,
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.contact.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.contact.create({ data });
      created += 1;
    }

    if ((created + updated) % 100 === 0) {
      console.log(`  progress: ${created} created, ${updated} updated …`);
    }
  }

  console.log(`\nDone. Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
