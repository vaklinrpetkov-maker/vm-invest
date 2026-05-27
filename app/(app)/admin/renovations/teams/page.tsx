import { requireRole } from "@/lib/auth/session";
import { listTeams } from "@/lib/renovations/catalog-queries";
import { TeamsAdmin } from "./teams-admin";

export const dynamic = "force-dynamic";

// Admin-only catalog page for renovation work teams. Three fields per team
// (name, specialty, totalPeople) per `specs/renovations.md` §3.7 + §9.2.
// Soft-deletable; deletion never cascades — references on existing
// templates + activities stay readable, the team just disappears from
// the picker.

export default async function AdminRenovationTeamsPage() {
  await requireRole("admin");
  const rows = await listTeams();

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl text-neutral-900">Екипи (ремонти)</h1>
        <p className="text-base text-neutral-600">
          Каталог на работните екипи. Промените се отразяват веднага в каталога
          на дейностите и при изчисление на капацитет.
        </p>
      </div>
      <TeamsAdmin rows={rows} />
    </div>
  );
}
