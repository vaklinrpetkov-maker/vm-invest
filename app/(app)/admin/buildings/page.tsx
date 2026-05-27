import { requireRole } from "@/lib/auth/session";
import { listAllBuildings, listDistinctComplexes } from "@/lib/buildings/queries";
import { BuildingsAdmin } from "./buildings-admin";

export const dynamic = "force-dynamic";

// Admin-only CRUD for Building records. Sits alongside Properties: you come
// here when you need to add a new project, rename a building, or deactivate
// one that's no longer being sold. Deletion is reserved for freshly-created
// buildings that never got any Properties — in all other cases, deactivate.

export default async function AdminBuildingsPage() {
  await requireRole("admin");

  const [rows, complexes] = await Promise.all([
    listAllBuildings(),
    listDistinctComplexes(),
  ]);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl text-neutral-900">Сгради</h1>
        <p className="text-base text-neutral-600">
          Управление на сгради и комплекси. Редакциите се отразяват веднага в
          модул Имоти.
        </p>
      </div>

      <BuildingsAdmin rows={rows} complexSuggestions={complexes} />
    </div>
  );
}
