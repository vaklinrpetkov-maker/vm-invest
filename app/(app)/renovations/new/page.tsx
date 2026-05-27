import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { canCreateRenovation } from "@/lib/renovations/permissions";
import { resolveApartmentSizeFromPropertyType } from "@/lib/renovations/constants";
import {
  RenovationCreateForm,
  type ActivityTemplateOption,
  type RenovationCreateInitial,
} from "../renovation-form";
import { createRenovation } from "../actions";

export const dynamic = "force-dynamic";

// Two entry points per spec §5.2:
//   1. `/renovations/new` — blank form.
//   2. `/renovations/new?propertyId=…` — pre-filled from the property:
//        - apartmentSize auto-resolved from Property.type (when it matches
//          one of the four canonical labels);
//        - bathroomCount from Property.bathroomCount (default 1);
//        - requestedByContact = property.owner (when set).

export default async function NewRenovationPage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string }>;
}) {
  const me = await requireProfile();
  if (!canCreateRenovation(me.role)) notFound();

  const params = await searchParams;
  const propertyId =
    typeof params.propertyId === "string" && params.propertyId.length > 0
      ? params.propertyId
      : null;

  const prefill = propertyId
    ? await prisma.property.findUnique({
        where: { id: propertyId },
        select: {
          id: true,
          name: true,
          entrance: true,
          floor: true,
          status: true,
          type: true,
          bathroomCount: true,
          building: { select: { displayName: true } },
          owner: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              email: true,
            },
          },
        },
      })
    : null;

  // Live (non-soft-deleted) catalog templates feed the loader. Sorted by
  // catalog order so the checklist mirrors the admin page + the chain-load
  // ordering rule.
  const templateRows = await prisma.activityTemplate.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      teamId: true,
      peopleRequired: true,
      bathroomMultiplied: true,
      durationStudio: true,
      durationTwoRoom: true,
      durationThreeRoom: true,
      durationFourRoom: true,
      sortOrder: true,
      team: { select: { name: true, specialty: true } },
    },
  });
  const templates: ActivityTemplateOption[] = templateRows.map((t) => ({
    id: t.id,
    name: t.name,
    teamName: t.team?.name ?? null,
    teamSpecialty: t.team?.specialty ?? null,
    peopleRequired: t.peopleRequired,
    bathroomMultiplied: t.bathroomMultiplied,
    durationStudio: Number(t.durationStudio),
    durationTwoRoom: Number(t.durationTwoRoom),
    durationThreeRoom: Number(t.durationThreeRoom),
    durationFourRoom: Number(t.durationFourRoom),
    sortOrder: t.sortOrder,
  }));

  const initial: RenovationCreateInitial = {
    property: prefill
      ? {
          id: prefill.id,
          name: prefill.name,
          buildingDisplayName: prefill.building.displayName,
          entrance: prefill.entrance,
          floor: prefill.floor,
          status: prefill.status,
          type: prefill.type,
        }
      : null,
    requestedBy: prefill?.owner
      ? {
          id: prefill.owner.id,
          fullName: prefill.owner.fullName,
          phone: prefill.owner.phone,
          email: prefill.owner.email,
        }
      : null,
    manager: null,
    apartmentSize: prefill ? resolveApartmentSizeFromPropertyType(prefill.type) : null,
    bathroomCount: prefill?.bathroomCount ?? 1,
    description: "",
    plannedStartDate: "",
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={"/renovations" as Route}
          className="text-sm text-neutral-500 hover:text-neutral-900"
        >
          ← Назад към Ремонти
        </Link>
        <h1 className="text-xl text-neutral-900 mt-1">Нов ремонт</h1>
        <p className="text-base text-neutral-600">
          Изберете имот и размер, маркирайте кои дейности да заредите.
          Системата ще ги нареди в график автоматично.
        </p>
      </div>

      <RenovationCreateForm
        action={createRenovation}
        initial={initial}
        templates={templates}
      />
    </div>
  );
}
