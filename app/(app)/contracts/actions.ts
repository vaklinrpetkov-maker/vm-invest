"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  parseContractFormData,
  type ContractFormState,
} from "@/lib/contracts/parse";

// Server actions for creating + editing contracts. Contracts created here
// get `source = "manual"`; CSV-imported rows have `source = "imported"`.
// Template-driven generation inside the app is out of scope (see
// specs/contracts.md §11) — the team uploads prepared documents via the
// file cell on /contracts/[id].
//
// Permissions per specs/contracts.md §8:
//   - admin / manager / user — can create + edit drafts and cancelled
//     contracts.
//   - users can't modify a `signed` contract; managers and admins can.
//   - only admins can delete contracts (handled elsewhere).
// All three roles see the +Нов договор button; the page-level guard checks
// the auth gate.

const COMPOSITION_STATUSES = ["А", "А+Г/ПМ", "А+ПМ"] as const;

// Tolerance for considering a sum-of-percentages "equal to 100" when
// deciding whether to apply the last-slot-absorbs rounding rule. 0.001%
// is tighter than any sensible user input, loose enough to absorb float
// arithmetic noise.
const HUNDRED_TOLERANCE = 0.001;

// Compute the 4 milestone amounts from the percentages + total. Returns
// `null` if every slot is null (user left the section blank — caller skips
// the upsert). Returns an array of 4 numbers otherwise.
//
// Rounding rule (decided in chat): when the user's percentages sum to
// exactly 100%, milestones 1-3 are computed exactly and milestone 4
// absorbs the residual so the four amounts add up to the contract total
// to the cent. When the sum is anything else (lenient validation), each
// slot is computed independently — we honor the user's intent rather than
// silently rebalancing.
function amountsFromPercents(
  total: number,
  percents: [number | null, number | null, number | null, number | null],
): [number, number, number, number] | null {
  if (percents.every((p) => p === null)) return null;
  const pcts = percents.map((p) => p ?? 0) as [number, number, number, number];
  const sum = pcts[0] + pcts[1] + pcts[2] + pcts[3];
  if (Math.abs(sum - 100) < HUNDRED_TOLERANCE) {
    const a1 = round2(pcts[0] * total / 100);
    const a2 = round2(pcts[1] * total / 100);
    const a3 = round2(pcts[2] * total / 100);
    const a4 = round2(total - a1 - a2 - a3);
    return [a1, a2, a3, a4];
  }
  return [
    round2(pcts[0] * total / 100),
    round2(pcts[1] * total / 100),
    round2(pcts[2] * total / 100),
    round2(pcts[3] * total / 100),
  ];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Normalize values that the parser intentionally only warns on — coerce to
// the canonical option set or null. Belt-and-braces against arbitrary input.
function normalizeOptionalEnum(v: string | null, allowed: readonly string[]): string | null {
  if (v === null) return null;
  return allowed.includes(v as typeof allowed[number]) ? v : null;
}

export async function createContract(
  _prev: ContractFormState,
  formData: FormData,
): Promise<ContractFormState> {
  const me = await requireProfile();
  if (me.role !== "admin" && me.role !== "manager" && me.role !== "user") {
    return { errors: { form: "Нямате достъп." } };
  }

  const parsed = parseContractFormData(formData);
  if (!parsed.ok) return { errors: parsed.errors, warnings: parsed.warnings };

  // Property existence check — guards against stale ids in the picker.
  const properties = await prisma.property.findMany({
    where: { id: { in: parsed.data.propertyIds }, deletedAt: null },
    select: { id: true },
  });
  if (properties.length !== parsed.data.propertyIds.length) {
    return {
      errors: {
        propertyIds: "Един или повече от избраните имоти вече не съществуват.",
      },
    };
  }

  // Contact id is optional but if provided, must exist.
  if (parsed.data.contactId) {
    const c = await prisma.contact.findUnique({
      where: { id: parsed.data.contactId },
      select: { id: true },
    });
    if (!c) {
      return { errors: { contactId: "Контактът не съществува." } };
    }
  }

  // Salesperson FK: optional but if set, must be an active profile. We
  // mirror the chosen profile's fullName into the legacy `salesperson`
  // column so the existing text-search filter on /contracts keeps working
  // without dual-column logic.
  let salespersonText: string | null = null;
  if (parsed.data.salespersonId) {
    const p = await prisma.profile.findUnique({
      where: { id: parsed.data.salespersonId },
      select: { id: true, fullName: true, active: true },
    });
    if (!p) {
      return { errors: { salespersonId: "Консултантът не съществува." } };
    }
    if (!p.active) {
      return {
        errors: {
          salespersonId: "Този потребител е деактивиран и не може да се назначи.",
        },
      };
    }
    salespersonText = p.fullName;
  }

  const created = await prisma.$transaction(async (tx) => {
    const c = await tx.contract.create({
      data: {
        title: parsed.data.title,
        buyerFullName: parsed.data.buyerFullName,
        contactId: parsed.data.contactId,
        salespersonId: parsed.data.salespersonId,
        salesperson: salespersonText,
        building: parsed.data.building,
        contractType: parsed.data.contractType,
        compositionStatus: normalizeOptionalEnum(parsed.data.compositionStatus, COMPOSITION_STATUSES),
        // "Преди / След" (completion) is no longer surfaced in the form;
        // every newly created contract is "След" by definition (system
        // ships well after Акт 16 across the company's projects).
        preOrPost: "След",
        usesCredit: parsed.data.usesCredit,
        totalDueEur: parsed.data.totalDueEur,
        // totalPaidEur + totalRemainingEur are derived by the payments
        // module; for a freshly-created contract they default to 0 and
        // totalDueEur respectively.
        totalRemainingEur: parsed.data.totalDueEur,
        status: parsed.data.status,
        signedAt: parsed.data.signedAt,
        reminderDate: parsed.data.reminderDate,
        source: "manual",
        createdById: me.id,
        updatedById: me.id,
      },
    });
    await tx.contractProperty.createMany({
      data: parsed.data.propertyIds.map((pid) => ({
        contractId: c.id,
        propertyId: pid,
      })),
    });

    // Optional milestone-payment seed. If the user filled in any of the 4
    // percentage slots on the form, create 4 ContractPayment rows with the
    // computed amounts. paidEur defaults to 0 (no installments yet) and
    // remainingEur tracks dueEur until the team starts logging installment
    // payments. If the user left all slots blank, no payment rows are
    // created — the team can populate them later via a future UI (none
    // exists yet) or by editing the contract.
    const seedAmounts = amountsFromPercents(
      Number(parsed.data.totalDueEur),
      parsed.data.paymentPercents,
    );
    if (seedAmounts) {
      await tx.contractPayment.createMany({
        data: seedAmounts.map((amount, idx) => ({
          contractId: c.id,
          number: idx + 1,
          dueEur: amount,
          paidEur: 0,
          remainingEur: amount,
        })),
      });
    }
    return c;
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: me.id,
    action: "contract.created",
    targetType: "contract",
    targetId: created.id,
    after: {
      title: created.title,
      buyerFullName: created.buyerFullName,
      status: created.status,
      totalDueEur: created.totalDueEur.toString(),
      propertyCount: parsed.data.propertyIds.length,
    },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/contracts");
  // Return the new id instead of redirecting — the client form may have
  // staged file uploads from the create flow that need to land before we
  // navigate to the detail page.
  return { createdContractId: created.id };
}

export async function updateContract(
  contractId: string,
  _prev: ContractFormState,
  formData: FormData,
): Promise<ContractFormState> {
  const me = await requireProfile();
  if (me.role !== "admin" && me.role !== "manager" && me.role !== "user") {
    return { errors: { form: "Нямате достъп." } };
  }

  const existing = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { id: true, status: true, totalPaidEur: true },
  });
  if (!existing) {
    return { errors: { form: "Договорът не съществува." } };
  }

  // Per spec §9: users (sales) can't modify a signed contract. Managers and
  // admins still can — they're the ones who handle corrections.
  if (existing.status === "signed" && me.role === "user") {
    return {
      errors: {
        form: "Подписаните договори могат да се редактират само от мениджър или администратор.",
      },
    };
  }

  const parsed = parseContractFormData(formData);
  if (!parsed.ok) return { errors: parsed.errors, warnings: parsed.warnings };

  const properties = await prisma.property.findMany({
    where: { id: { in: parsed.data.propertyIds }, deletedAt: null },
    select: { id: true },
  });
  if (properties.length !== parsed.data.propertyIds.length) {
    return {
      errors: {
        propertyIds: "Един или повече от избраните имоти вече не съществуват.",
      },
    };
  }
  if (parsed.data.contactId) {
    const c = await prisma.contact.findUnique({
      where: { id: parsed.data.contactId },
      select: { id: true },
    });
    if (!c) {
      return { errors: { contactId: "Контактът не съществува." } };
    }
  }

  // Salesperson FK validation + legacy column mirror (same shape as create).
  let salespersonText: string | null = null;
  if (parsed.data.salespersonId) {
    const p = await prisma.profile.findUnique({
      where: { id: parsed.data.salespersonId },
      select: { id: true, fullName: true, active: true },
    });
    if (!p) {
      return { errors: { salespersonId: "Консултантът не съществува." } };
    }
    if (!p.active) {
      return {
        errors: {
          salespersonId: "Този потребител е деактивиран и не може да се назначи.",
        },
      };
    }
    salespersonText = p.fullName;
  }

  // Recompute remaining = due − paid. The payments module is the source of
  // truth for totalPaidEur; we don't touch it here.
  const totalPaid = Number(existing.totalPaidEur);
  const totalDue = Number(parsed.data.totalDueEur);
  const remaining = Math.max(0, totalDue - totalPaid);

  await prisma.$transaction(async (tx) => {
    await tx.contract.update({
      where: { id: contractId },
      data: {
        title: parsed.data.title,
        buyerFullName: parsed.data.buyerFullName,
        contactId: parsed.data.contactId,
        salespersonId: parsed.data.salespersonId,
        salesperson: salespersonText,
        building: parsed.data.building,
        contractType: parsed.data.contractType,
        compositionStatus: normalizeOptionalEnum(parsed.data.compositionStatus, COMPOSITION_STATUSES),
        // Pinned to "След" per the form's drop of the dropdown.
        preOrPost: "След",
        usesCredit: parsed.data.usesCredit,
        totalDueEur: parsed.data.totalDueEur,
        totalRemainingEur: remaining,
        status: parsed.data.status,
        signedAt: parsed.data.signedAt,
        reminderDate: parsed.data.reminderDate,
        updatedById: me.id,
      },
    });
    // Re-attach properties: delete the current join rows and re-create.
    // Cheap at our row counts (a contract covers 1-5 properties typically);
    // simpler than computing a diff.
    await tx.contractProperty.deleteMany({ where: { contractId } });
    await tx.contractProperty.createMany({
      data: parsed.data.propertyIds.map((pid) => ({
        contractId,
        propertyId: pid,
      })),
    });

    // Milestone-payment update. Same shape as the create flow but with
    // upsert semantics: we only touch `dueEur` (+ recompute `remainingEur`
    // from the new due + existing paid). `paidEur` and the installment
    // rows are preserved untouched. If every percent slot is blank, we
    // leave any existing payment rows alone — the form is for the
    // breakdown only; clearing it from the form shouldn't wipe paid data.
    const editAmounts = amountsFromPercents(
      Number(parsed.data.totalDueEur),
      parsed.data.paymentPercents,
    );
    if (editAmounts) {
      const existingPayments = await tx.contractPayment.findMany({
        where: { contractId },
        select: { id: true, number: true, paidEur: true },
      });
      const byNumber = new Map(existingPayments.map((p) => [p.number, p]));
      for (let i = 0; i < 4; i++) {
        const number = i + 1;
        const dueEur = editAmounts[i];
        const existing = byNumber.get(number);
        if (existing) {
          // Preserve paidEur; recompute remaining = max(0, due - paid).
          const paid = Number(existing.paidEur);
          const remaining = Math.max(0, dueEur - paid);
          await tx.contractPayment.update({
            where: { id: existing.id },
            data: { dueEur, remainingEur: remaining },
          });
        } else {
          await tx.contractPayment.create({
            data: {
              contractId,
              number,
              dueEur,
              paidEur: 0,
              remainingEur: dueEur,
            },
          });
        }
      }
    }
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: me.id,
    action: "contract.updated",
    targetType: "contract",
    targetId: contractId,
    after: {
      title: parsed.data.title,
      status: parsed.data.status,
      totalDueEur: parsed.data.totalDueEur.toString(),
      propertyCount: parsed.data.propertyIds.length,
    },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/contracts");
  revalidatePath(`/contracts/${contractId}`);
  redirect(`/contracts/${contractId}`);
}

// ─── Soft delete (admin-only) ─────────────────────────────────────────────
//
// Per `specs/contracts.md` §138-139, only admins can delete a contract.
// Soft-delete pattern matches Properties / Renovations / Leads — the row
// stays in the DB for audit history, every read filter excludes
// `deletedAt IS NULL`. Cascades + linked payments / installments /
// attachments stay attached to the soft-deleted row (they're invisible
// alongside it).

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DeleteContractResult = { ok: true } | { ok: false; error: string };

export async function deleteContract(contractId: string): Promise<DeleteContractResult> {
  const me = await requireProfile();
  if (me.role !== "admin") {
    return { ok: false, error: "Само администратор може да изтрива договори." };
  }
  if (!UUID_RE.test(contractId)) {
    return { ok: false, error: "Невалиден договор." };
  }

  const existing = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { id: true, title: true, contactId: true, deletedAt: true },
  });
  if (!existing) return { ok: false, error: "Договорът не е намерен." };
  if (existing.deletedAt !== null) return { ok: true }; // already deleted

  await prisma.contract.update({
    where: { id: contractId },
    data: {
      deletedAt: new Date(),
      deletedById: me.id,
    },
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: me.id,
    action: "contract.deleted",
    targetType: "contract",
    targetId: contractId,
    payload: { title: existing.title },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/contracts");
  revalidatePath(`/contracts/${contractId}`);
  if (existing.contactId) {
    revalidatePath(`/contacts/${existing.contactId}`);
  }
  return { ok: true };
}
