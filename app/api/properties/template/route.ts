import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { CSV_HEADER } from "@/lib/properties/csv";

export const dynamic = "force-dynamic";

// Empty CSV template — just the 27-column header row. Admins download this
// when setting up a new building so they know the expected layout before
// filling it in and uploading via /admin/buildings.

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function GET() {
  await requireRole("admin");

  const body = "\uFEFF" + CSV_HEADER.map(csvEscape).join(",") + "\n";

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="properties-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
