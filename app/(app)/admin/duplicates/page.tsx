import { requireRole } from "@/lib/auth/session";
import { getCsvDuplicateGroups } from "@/lib/properties/duplicates";
import { DuplicatesAdmin } from "./duplicates-admin";

export const dynamic = "force-dynamic";

// Admin-only review tool for CSV rows that were dropped during the Properties
// seed (docs: specs/properties.md §7.3 — 2,158 CSV rows collapse to 1,847
// unique `(Сграда, Name)` pairs; earlier duplicates lose to later ones).
//
// The parser re-reads the source CSV on each page load to reconstruct the
// groups. Fine for an ad-hoc tool used a handful of times during cleanup.

export default async function AdminDuplicatesPage() {
  await requireRole("admin");
  const groups = await getCsvDuplicateGroups();

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl text-neutral-900">CSV дубликати</h1>
        <p className="text-base text-neutral-600">
          Редове от all-properties.csv, които се блъскат по ключ (Сграда, Име) и
          бяха изтрити при импорта — оцелява само последният. Прегледай всяка
          група: ако двата записа са легитимно различни имоти, създай втория
          като отделен; ако е дубликат в CSV-то, отбележи като «проверен» и
          пренебрегни.
        </p>
      </div>

      <DuplicatesAdmin groups={groups} />
    </div>
  );
}
