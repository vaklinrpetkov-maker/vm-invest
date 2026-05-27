import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import {
  CONTRACT_STATUSES,
  CONTRACT_TYPES,
  type ContractStatus,
  type ContractType,
} from "@/lib/contracts/constants";
import { prisma } from "@/lib/prisma";
import { ContractForm, type ContractFormInitial } from "../../contract-form";
import { updateContract } from "../../actions";

export const dynamic = "force-dynamic";

function isContractStatus(s: string): s is ContractStatus {
  return (CONTRACT_STATUSES as readonly string[]).includes(s);
}
function isContractType(s: string): s is ContractType {
  return (CONTRACT_TYPES as readonly string[]).includes(s);
}

export default async function EditContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireProfile();
  if (me.role !== "admin" && me.role !== "manager" && me.role !== "user") notFound();

  const { id } = await params;

  const c = await prisma.contract.findUnique({
    where: { id },
    include: {
      contact: { select: { id: true, fullName: true, phone: true, email: true } },
      salespersonProfile: {
        select: { id: true, fullName: true, email: true, role: true },
      },
      properties: {
        include: {
          property: {
            select: {
              id: true,
              name: true,
              entrance: true,
              floor: true,
              status: true,
              type: true,
              building: { select: { displayName: true } },
            },
          },
        },
      },
      payments: {
        orderBy: { number: "asc" },
        select: { number: true, dueEur: true },
      },
    },
  });
  if (!c) notFound();

  // Per spec §9: sales-users cannot modify a signed contract. Bounce them
  // back to the detail page. Managers and admins can edit any state.
  if (c.status === "signed" && me.role === "user") notFound();

  const initial: ContractFormInitial = {
    title: c.title,
    buyerFullName: c.buyerFullName,
    contact: c.contact
      ? {
          id: c.contact.id,
          fullName: c.contact.fullName,
          phone: c.contact.phone,
          email: c.contact.email,
        }
      : null,
    salesperson: c.salespersonProfile
      ? {
          id: c.salespersonProfile.id,
          fullName: c.salespersonProfile.fullName,
          email: c.salespersonProfile.email,
          role: c.salespersonProfile.role,
        }
      : null,
    building: c.building ?? "",
    contractType: isContractType(c.contractType) ? c.contractType : "BEZ_SMR",
    compositionStatus: c.compositionStatus ?? "",
    usesCredit: c.usesCredit,
    totalDueEur: c.totalDueEur.toString(),
    status: isContractStatus(c.status) ? c.status : "draft",
    signedAtIso: c.signedAt ? c.signedAt.toISOString().slice(0, 10) : "",
    reminderDateIso: c.reminderDate ? c.reminderDate.toISOString().slice(0, 10) : "",
    properties: c.properties.map((cp) => ({
      id: cp.property.id,
      name: cp.property.name,
      buildingDisplayName: cp.property.building.displayName,
      entrance: cp.property.entrance,
      floor: cp.property.floor,
      status: cp.property.status,
      type: cp.property.type,
    })),
    paymentPercents: backComputePaymentPercents(
      Number(c.totalDueEur),
      c.payments,
    ),
  };

  const boundUpdate = updateContract.bind(null, id);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/contracts/${id}` as Route}
          className="text-sm text-neutral-500 hover:text-neutral-900"
        >
          ← Назад към договор
        </Link>
        <h1 className="text-xl text-neutral-900 mt-1">Редакция на договор</h1>
        <p className="text-base text-neutral-600">{c.title}</p>
      </div>

      <ContractForm
        action={boundUpdate}
        initial={initial}
        submitLabel="Запази промените"
        pendingLabel="Запис…"
        mode="edit"
      />
    </div>
  );
}

// Back-compute the 4 milestone percentages from existing ContractPayment
// rows so the edit form's breakdown section comes pre-filled. Each slot
// returns:
//   - empty string when the milestone has no payment row OR when the total
//     is 0/missing (can't compute a meaningful percentage)
//   - a percentage value formatted to up to 4 decimals (trimming trailing
//     zeros) so simple ratios like 30% don't render as "30.0000"
//
// The order is fixed: index 0 = ПД (Вноска 1), index 3 = Акт 16 (Вноска 4).
function backComputePaymentPercents(
  totalDueEur: number,
  payments: Array<{ number: number; dueEur: unknown }>,
): [string, string, string, string] {
  const out: [string, string, string, string] = ["", "", "", ""];
  if (!Number.isFinite(totalDueEur) || totalDueEur <= 0) return out;

  for (const p of payments) {
    if (p.number < 1 || p.number > 4) continue;
    const due = Number(p.dueEur);
    if (!Number.isFinite(due)) continue;
    const pct = (due / totalDueEur) * 100;
    // Round to 4 decimals, then trim trailing zeros. "30" stays "30",
    // "33.3333" stays as-is, "0" renders as empty so we don't pre-fill
    // a misleading "0" for milestones that haven't been set up.
    if (pct === 0) {
      out[p.number - 1] = "";
    } else {
      const rounded = Math.round(pct * 10000) / 10000;
      out[p.number - 1] = String(rounded);
    }
  }
  return out;
}
