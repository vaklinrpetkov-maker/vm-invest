import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Status-history writer. Called whenever a Property's `status` column changes.
// Works inside or outside a transaction — pass `tx` when the caller is already
// running one (typical for the update-property action that writes property +
// history atomically).

export type StatusChangeInput = {
  propertyId: string;
  fromStatus: string | null;
  toStatus: string;
  authorId: string | null; // null → rendered as "Система" in the UI
  note?: string | null;
  contractId?: string | null; // Phase 2 — set when the change came from Contracts
  at?: Date; // override for migration; defaults to now()
  tx?: Prisma.TransactionClient;
};

export async function writeStatusChange(input: StatusChangeInput): Promise<void> {
  const client = input.tx ?? prisma;
  await client.propertyStatusHistory.create({
    data: {
      propertyId: input.propertyId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      note: input.note ?? null,
      contractId: input.contractId ?? null,
      authorId: input.authorId,
      ...(input.at ? { at: input.at } : {}),
    },
  });
}
