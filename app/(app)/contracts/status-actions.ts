"use server";

// Inline-edit server action for changing a Contract's status.
//
// Permission model (per specs/contracts.md §9): admin + manager only. Users
// can create drafts but not transition status (signing / cancelling are
// financial-impact actions). The UI also disables the cell for users via
// the `canEditStatus` flag threaded from the page — but the action enforces
// independently because the UI is not the source of truth.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireRole } from "@/lib/auth/session";
import {
  CONTRACT_STATUSES,
  type ContractStatus,
} from "@/lib/contracts/constants";
import { prisma } from "@/lib/prisma";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_STATUSES: ReadonlySet<ContractStatus> = new Set(CONTRACT_STATUSES);

export type SetContractStatusResult =
  | { ok: true }
  | { ok: false; error: string };

export async function setContractStatus(
  contractId: string,
  newStatus: ContractStatus,
): Promise<SetContractStatusResult> {
  const actor = await requireRole("admin", "manager");

  if (!UUID_RE.test(contractId)) {
    return { ok: false, error: "Невалиден договор." };
  }
  if (!VALID_STATUSES.has(newStatus)) {
    return { ok: false, error: "Невалиден статус." };
  }

  const before = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { status: true },
  });
  if (!before) {
    return { ok: false, error: "Договорът не съществува." };
  }
  if (before.status === newStatus) {
    return { ok: true };
  }

  // When transitioning to "signed" we also stamp signedAt. Going BACK from
  // signed → draft/cancelled keeps the previous signedAt timestamp untouched
  // so the audit trail of when it was first signed is preserved.
  const data: { status: ContractStatus; signedAt?: Date } = { status: newStatus };
  if (newStatus === "signed" && before.status !== "signed") {
    data.signedAt = new Date();
  }

  await prisma.contract.update({
    where: { id: contractId },
    data,
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    action: "contract.updated",
    targetType: "contract",
    targetId: contractId,
    before: { status: before.status },
    after: { status: newStatus },
    payload: { field: "status" },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/contracts");
  revalidatePath(`/contracts/${contractId}`);

  return { ok: true };
}

// Inline-edit action for `Contract.usesCredit`. Same admin/manager gate as
// status — the flag has accounting implications (it determines whether the
// import auto-derives a credit-track installment) and shouldn't flip freely.
export async function setContractUsesCredit(
  contractId: string,
  newValue: boolean,
): Promise<SetContractStatusResult> {
  const actor = await requireRole("admin", "manager");

  if (!UUID_RE.test(contractId)) {
    return { ok: false, error: "Невалиден договор." };
  }

  const before = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { usesCredit: true },
  });
  if (!before) return { ok: false, error: "Договорът не съществува." };
  if (before.usesCredit === newValue) return { ok: true };

  await prisma.contract.update({
    where: { id: contractId },
    data: { usesCredit: newValue },
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: actor.id,
    action: "contract.updated",
    targetType: "contract",
    targetId: contractId,
    before: { usesCredit: before.usesCredit },
    after: { usesCredit: newValue },
    payload: { field: "usesCredit" },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/contracts");
  revalidatePath(`/contracts/${contractId}`);

  return { ok: true };
}
