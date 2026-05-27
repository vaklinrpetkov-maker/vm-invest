import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { canEditRenovation } from "@/lib/renovations/permissions";
import { getRenovationById } from "@/lib/renovations/queries";
import {
  RenovationEditForm,
  type RenovationEditInitial,
} from "./renovation-edit-form";
import { updateRenovation } from "../../actions";

export const dynamic = "force-dynamic";

function isoOrEmpty(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

function deriveTitle(r: {
  property: { name: string; building: { displayName: string } };
}): string {
  return `Ремонт — ${r.property.building.displayName} · ${r.property.name}`;
}

export default async function EditRenovationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireProfile();
  const { id } = await params;

  const r = await getRenovationById(id);
  if (!r || r.deletedAt !== null) notFound();
  if (!canEditRenovation(me.role, r.managerId, me.id)) notFound();

  const initial: RenovationEditInitial = {
    status: r.status,
    description: r.description ?? "",
    property: {
      id: r.property.id,
      name: r.property.name,
      buildingDisplayName: r.property.building.displayName,
      entrance: r.property.entrance,
      floor: r.property.floor,
      status: r.property.status,
      type: r.property.type,
    },
    requestedBy: r.requestedByContact
      ? {
          id: r.requestedByContact.id,
          fullName: r.requestedByContact.fullName,
          phone: r.requestedByContact.phone,
          email: r.requestedByContact.email,
        }
      : null,
    manager: r.manager
      ? {
          id: r.manager.id,
          fullName: r.manager.fullName,
          email: r.manager.email,
          // Role isn't loaded — UserPicker only uses this for display.
          role: "user",
        }
      : null,
    plannedStartDate: isoOrEmpty(r.plannedStartDate),
    actualStartDate: isoOrEmpty(r.actualStartDate),
    actualEndDate: isoOrEmpty(r.actualEndDate),
  };

  const boundUpdate = updateRenovation.bind(null, id);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/renovations/${id}` as Route}
          className="text-sm text-neutral-500 hover:text-neutral-900"
        >
          ← Назад към ремонта
        </Link>
        <h1 className="text-xl text-neutral-900 mt-1">Редакция на ремонт</h1>
        <p className="text-base text-neutral-600">{deriveTitle(r)}</p>
      </div>

      <RenovationEditForm action={boundUpdate} initial={initial} />
    </div>
  );
}
