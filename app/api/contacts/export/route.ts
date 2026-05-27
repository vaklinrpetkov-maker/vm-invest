import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/session";
import {
  buildContactWhere,
  filterByUpcomingBirthdays,
  parseContactFilters,
  type ContactSearchParams,
} from "@/lib/contacts/filters";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// CSV export. Admin-only per specs/contacts.md §4.1. Respects the same URL
// filters as the list view so admins can "filter down, then export" without
// redoing anything in a spreadsheet.
//
// Header row matches the Contacts.csv import format so this is a round-trip.

function csvEscape(value: string | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toIsoDate(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

function computeAge(birth: Date): number {
  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - birth.getUTCMonth();
  const dayDiff = today.getUTCDate() - birth.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
  return age;
}

function birthdayThisYearIso(birth: Date): string {
  const y = new Date().getUTCFullYear();
  return toIsoDate(new Date(Date.UTC(y, birth.getUTCMonth(), birth.getUTCDate())));
}

const HEADER = [
  "Name",
  "Birth date",
  "Birthday this year",
  "Owner/Responsible",
  "Email",
  "Age",
  "Phone number",
  "Type",
  "Building they own properties in",
  "Properties",
  "Additional comments",
  "Contract",
  "Date contact added",
  "ЕГН",
  "Address",
];

export async function GET(request: NextRequest) {
  await requireRole("admin");

  const params: ContactSearchParams = {};
  request.nextUrl.searchParams.forEach((value, key) => {
    const existing = params[key as keyof ContactSearchParams];
    if (existing === undefined) {
      (params as Record<string, string | string[]>)[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      (params as Record<string, string | string[]>)[key] = [existing, value];
    }
  });

  const filters = parseContactFilters(params);
  const raw = await prisma.contact.findMany({
    where: buildContactWhere(filters),
    orderBy: { createdAt: "desc" },
    select: {
      fullName: true,
      birthDate: true,
      email: true,
      phone: true,
      type: true,
      properties: true,
      notes: true,
      contractLabel: true,
      createdAt: true,
      egn: true,
      address: true,
      owner: { select: { fullName: true } },
      building: { select: { displayName: true } },
    },
  });

  const contacts = filterByUpcomingBirthdays(raw, filters.birthdaysWithinDays);

  const lines: string[] = [];
  lines.push(HEADER.map(csvEscape).join(","));

  for (const c of contacts) {
    const age = c.birthDate ? computeAge(c.birthDate) : "";
    const birthdayThisYear = c.birthDate ? birthdayThisYearIso(c.birthDate) : "";
    const row = [
      c.fullName,
      toIsoDate(c.birthDate),
      birthdayThisYear,
      c.owner?.fullName ?? "",
      c.email ?? "",
      age === "" ? "" : String(age),
      c.phone ?? "",
      c.type,
      c.building?.displayName ?? "",
      c.properties ?? "",
      c.notes ?? "",
      c.contractLabel ?? "",
      toIsoDate(c.createdAt),
      c.egn ?? "",
      c.address ?? "",
    ];
    lines.push(row.map(csvEscape).join(","));
  }

  const body = "\uFEFF" + lines.join("\n"); // BOM so Excel auto-detects UTF-8
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
