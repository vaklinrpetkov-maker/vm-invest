"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/auth/audit";
import { prisma } from "@/lib/prisma";
import {
  isValidPropertyStatus,
  isValidPropertyType,
  PROPERTY_STATUS_DEFAULT,
  PROPERTY_TYPE_DEFAULT,
} from "@/lib/properties/constants";
import { parseSellerInput } from "@/lib/properties/sellers-normalize";
import { writeStatusChange } from "@/lib/properties/status-history";

// Promote a CSV row that was dropped during seed (because another row with the
// same (building, name) key won the upsert) into a standalone Property. The
// admin picks a differentiated name so the `(buildingId, name)` uniqueness
// constraint is satisfied.
//
// Inputs are simple typed fields from the losing CSV row — enough to
// recreate a useful record; the admin can polish the rest from the detail
// page after.

type SplitInput = {
  buildingId: string;
  newName: string;
  status: string | null;
  type: string | null;
  description: string | null;
  // Comma-separated text; the server splits + canonicalises via
  // `parseSellerInput`. Empty string → empty array.
  sellers: string;
  priceEur: string | null;
  expectedPriceEur: string | null;
  buyerLabel: string | null;
  contractLabel: string | null;
};

type SplitResult =
  | { ok: true; propertyId: string }
  | { ok: false; error: string };

function decimalOrNull(raw: string | null): Prisma.Decimal | null {
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return new Prisma.Decimal(raw);
}

export async function splitDuplicate(input: SplitInput): Promise<SplitResult> {
  const me = await requireRole("admin");

  const newName = input.newName.trim();
  if (!newName) return { ok: false, error: "Въведи ново име за имота." };

  const building = await prisma.building.findUnique({
    where: { id: input.buildingId },
    select: { id: true, storageName: true, active: true },
  });
  if (!building) return { ok: false, error: "Невалидна сграда." };
  if (!building.active) {
    return { ok: false, error: "Сградата е деактивирана. Активирай я преди разделяне." };
  }

  const dup = await prisma.property.findFirst({
    where: { buildingId: input.buildingId, name: newName, deletedAt: null },
    select: { id: true },
  });
  if (dup) {
    return {
      ok: false,
      error: `Имот с име „${newName}" вече съществува в тази сграда. Избери друго име.`,
    };
  }

  const status = input.status && isValidPropertyStatus(input.status) ? input.status : PROPERTY_STATUS_DEFAULT;
  const type = input.type && isValidPropertyType(input.type) ? input.type : PROPERTY_TYPE_DEFAULT;

  const created = await prisma.property.create({
    data: {
      buildingId: input.buildingId,
      name: newName,
      status,
      type,
      description: input.description,
      sellers: parseSellerInput(input.sellers),
      priceEur: decimalOrNull(input.priceEur),
      expectedPriceEur: decimalOrNull(input.expectedPriceEur),
      buyerLabel: input.buyerLabel,
      contractLabel: input.contractLabel,
      createdById: me.id,
      updatedById: me.id,
    },
  });

  // Initial status-history entry (matches the create-property-action pattern).
  await writeStatusChange({
    propertyId: created.id,
    fromStatus: null,
    toStatus: created.status,
    authorId: me.id,
    note: "Разделяне на CSV дубликат",
  });

  await recordAuditEvent({
    actorId: me.id,
    action: "property.created",
    targetType: "property",
    targetId: created.id,
    payload: {
      source: "csv_duplicate_split",
      buildingStorageName: building.storageName,
      newName,
      status,
      type,
    },
  });

  revalidatePath("/admin/duplicates");
  revalidatePath("/properties");

  return { ok: true, propertyId: created.id };
}
