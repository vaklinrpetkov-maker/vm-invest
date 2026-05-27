"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { notify } from "@/lib/absence/notify";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireProfile } from "@/lib/auth/session";
import { sendCancelRequestedEmail } from "@/lib/email/absence";
import { prisma } from "@/lib/prisma";

export type CancelResult = { ok: true } | { ok: false; error: string };

// Requester cancels their own pending request. For approved requests, use
// requestCancelOfApproved — that flips to `cancel_pending` and bounces the
// decision back to the approver.
export async function cancelOwnPending(formData: FormData): Promise<CancelResult> {
  const me = await requireProfile();
  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) return { ok: false, error: "Невалидна заявка." };

  const request = await prisma.absenceRequest.findUnique({
    where: { id: requestId },
    select: { employeeId: true, status: true, currentApproverId: true },
  });
  if (!request) return { ok: false, error: "Заявката не съществува." };
  if (request.employeeId !== me.id) return { ok: false, error: "Не е ваша заявка." };
  if (request.status !== "pending") {
    return { ok: false, error: "Само чакащите заявки могат да се отказват директно." };
  }

  await prisma.absenceRequest.update({
    where: { id: requestId },
    data: { status: "cancelled", decidedAt: new Date(), decidedById: me.id },
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: me.id,
    action: "absence.request.cancel",
    targetType: "absence_request",
    targetId: requestId,
    payload: { reason: "self_cancelled_pending" },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/absence");
  revalidatePath("/absence/inbox");
  return { ok: true };
}

// Requester asks to cancel an already-approved request. Flips status to
// `cancel_pending`; the approver must then confirm or deny.
export async function requestCancelOfApproved(formData: FormData): Promise<CancelResult> {
  const me = await requireProfile();
  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) return { ok: false, error: "Невалидна заявка." };

  const request = await prisma.absenceRequest.findUnique({
    where: { id: requestId },
    include: {
      employee: { select: { fullName: true } },
      category: { select: { code: true } },
    },
  });
  if (!request) return { ok: false, error: "Заявката не съществува." };
  if (request.employeeId !== me.id) return { ok: false, error: "Не е ваша заявка." };
  if (request.status !== "approved") {
    return { ok: false, error: "Само одобрените заявки могат да искат отмяна." };
  }

  // Route the cancellation to whoever approved it, falling back to the current
  // approver field if decidedById is somehow missing.
  const approverId = request.decidedById ?? request.currentApproverId;
  if (!approverId) return { ok: false, error: "Няма одобряващ. Свържете се с администратор." };

  await prisma.absenceRequest.update({
    where: { id: requestId },
    data: { status: "cancel_pending", currentApproverId: approverId },
  });

  const approver = await prisma.profile.findUniqueOrThrow({
    where: { id: approverId },
    select: { email: true, fullName: true },
  });

  await notify({
    recipientId: approverId,
    kind: "request.cancel_requested",
    payload: {
      requestId,
      employeeId: me.id,
      employeeName: request.employee.fullName,
      categoryCode: request.category.code,
    },
    sendEmail: () =>
      sendCancelRequestedEmail({
        approverEmail: approver.email,
        approverName: approver.fullName,
        requesterName: request.employee.fullName,
        categoryCode: request.category.code,
        startDate: request.startDate,
        endDate: request.endDate,
        workingDays: request.workingDaysCount.toNumber(),
      }),
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: me.id,
    action: "absence.request.cancel_requested",
    targetType: "absence_request",
    targetId: requestId,
    payload: {
      approverId,
      category: request.category.code,
    },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  revalidatePath("/absence");
  revalidatePath("/absence/inbox");
  return { ok: true };
}
