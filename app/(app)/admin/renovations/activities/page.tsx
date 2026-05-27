import { requireRole } from "@/lib/auth/session";
import {
  listActivityTemplates,
  listTeamOptions,
} from "@/lib/renovations/catalog-queries";
import { ActivitiesAdmin } from "./activities-admin";

export const dynamic = "force-dynamic";

// Admin-only catalog page for renovation activity templates. 29 rows seeded
// from the Excel; admin can add/remove/edit. Drag-reorder is implemented as
// up/down buttons in v1 to keep the component dependency-free.
// See `specs/renovations.md` §3.6 + §9.1.

export default async function AdminRenovationActivitiesPage() {
  await requireRole("admin");
  const [rows, teams] = await Promise.all([
    listActivityTemplates(),
    listTeamOptions(),
  ]);

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-xl text-neutral-900">Дейности (каталог)</h1>
        <p className="text-base text-neutral-600">
          Каталог на дейностите по ремонт. Всеки запис носи фиксиран екип,
          брой хора и продължителност за всеки тип апартамент.
        </p>
      </div>
      <div className="bg-info-50 border-l-2 border-info-500 px-4 py-2.5 text-sm text-info-900 rounded-r-md">
        Промените се прилагат само върху бъдещи ремонти. Вече заредени
        дейности запазват своите стойности.
      </div>
      <ActivitiesAdmin rows={rows} teams={teams} />
    </div>
  );
}
