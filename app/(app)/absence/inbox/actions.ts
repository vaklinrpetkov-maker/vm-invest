"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { detectTeamOverlapOnApprove } from "@/lib/absence/anomalies";
import { notify } from "@/lib/absence/notify";
import { recordAuditEvent } from "@/lib/auth/audit";
import { requireProfile } from "@/lib/auth/session";
import {
  sendCancelApprovedEmail,
  sendCancelRejectedEmail,
  sendRequestApprovedEmail,
  sendRequestRejectedEmail,
} from "@/lib/email/absence";
import { prisma } from "@/lib/prisma";

export type DecisionResult = { ok: true } | { ok: false; error: string };

// Approver decision. Handles both:
//   - pending → approved (the standard first-time approval)
//   - cancel_pending → cancelled (approver confirms the requester's cancellation)
// In both cases the button in the inbox is labeled "Одобри"; meaning depends on
// which state the request is in when the approver looks at it.
export async function approveRequest(formData: FormData): Promise<DecisionResult> {
  const approver = await requireProfile();
  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) return { ok: false, error: "Невалидна заявка." };

  const request = await prisma.absenceRequest.findUnique({
    where: { id: requestId },
    include: {
      employee: { select: { id: true, email: true, fullName: true } },
      category: { select: { code: true } },
    },
  });
  if (!request) return { ok: false, error: "Заявката не съществува." };
  if (request.currentApproverId !== approver.id) {
    return { ok: false, error: "Нямате право да одобрявате тази заявка." };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for") ?? null;
  const userAgent = hdrs.get("user-agent") ?? null;

  if (request.status === "pending") {
    await prisma.absenceRequest.update({
      where: { id: requestId },
      data: {
        status: "approved",
        decidedAt: new Date(),
        decidedById: approver.id,
      },
    });

    await notify({
      recipientId: request.employee.id,
      kind: "request.approved",
      payload: {
        requestId,
        approverName: approver.fullName,
        categoryCode: request.category.code,
      },
      sendEmail: () =>
        sendRequestApprovedEmail({
          requesterEmail: request.employee.email,
          requesterName: request.employee.fullName,
          approverName: approver.fullName,
          categoryCode: request.category.code,
          startDate: request.startDate,
          endDate: request.endDate,
          workingDays: request.workingDaysCount.toNumber(),
        }),
    });

    await recordAuditEvent({
      actorId: approver.id,
      action: "absence.request.approve",
      targetType: "absence_request",
      targetId: requestId,
      payload: {
        employeeId: request.employee.id,
        category: request.category.code,
        workingDays: request.workingDaysCount.toNumber(),
      },
      ip,
      userAgent,
    });

    // Post-approve anomaly scans. Non-blocking — failure here must not roll
    // back the approval.
    try {
      await detectTeamOverlapOnApprove(requestId);
    } catch (err) {
      console.error("[absence.anomaly] team overlap detector failed", err);
    }
  } else if (request.status === "cancel_pending") {
    await prisma.absenceRequest.update({
      where: { id: requestId },
      data: {
        status: "cancelled",
        decidedAt: new Date(),
        decidedById: approver.id,
      },
    });

    await notify({
      recipientId: request.employee.id,
      kind: "request.approved", // reuse in-app kind; emailer differentiates
      payload: {
        requestId,
        approverName: approver.fullName,
        decision: "cancel_approved",
      },
      sendEmail: () =>
        sendCancelApprovedEmail({
          requesterEmail: request.employee.email,
          requesterName: request.employee.fullName,
          approverName: approver.fullName,
          categoryCode: request.category.code,
          startDate: request.startDate,
          endDate: request.endDate,
        }),
    });

    await recordAuditEvent({
      actorId: approver.id,
      action: "absence.request.cancel_approved",
      targetType: "absence_request",
      targetId: requestId,
      payload: {
        employeeId: request.employee.id,
        category: request.category.code,
      },
      ip,
      userAgent,
    });
  } else {
    return { ok: false, error: "Заявката вече е обработена." };
  }

  revalidatePath("/absence/inbox");
  revalidatePath("/absence");
  return { ok: true };
}

// Reject mirrors approve: pending → rejected (standard) OR
// cancel_pending → approved (denying the cancellation keeps the original absence).
export async function rejectRequest(formData: FormData): Promise<DecisionResult> {
  const approver = await requireProfile();
  const requestId = String(formData.get("requestId") ?? "");
  const comment = String(formData.get("comment") ?? "").trim() || null;
  if (!requestId) return { ok: false, error: "Невалидна заявка." };

  const request = await prisma.absenceRequest.findUnique({
    where: { id: requestId },
    include: {
      employee: { select: { id: true, email: true, fullName: true } },
      category: { select: { code: true } },
    },
  });
  if (!request) return { ok: false, error: "Заявката не съществува." };
  if (request.currentApproverId !== approver.id) {
    return { ok: false, error: "Нямате право да отхвърляте тази заявка." };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for") ?? null;
  const userAgent = hdrs.get("user-agent") ?? null;

  if (request.status === "pending") {
    await prisma.absenceRequest.update({
      where: { id: requestId },
      data: {
        status: "rejected",
        decidedAt: new Date(),
        decidedById: approver.id,
        rejectionComment: comment,
      },
    });

    await notify({
      recipientId: request.employee.id,
      kind: "request.rejected",
      payload: {
        requestId,
        approverName: approver.fullName,
        rejectionComment: comment,
      },
      sendEmail: () =>
        sendRequestRejectedEmail({
          requesterEmail: request.employee.email,
          requesterName: request.employee.fullName,
          approverName: approver.fullName,
          categoryCode: request.category.code,
          startDate: request.startDate,
          endDate: request.endDate,
          rejectionComment: comment,
        }),
    });

    await recordAuditEvent({
      actorId: approver.id,
      action: "absence.request.reject",
      targetType: "absence_request",
      targetId: requestId,
      payload: {
        employeeId: request.employee.id,
        category: request.category.code,
        rejectionComment: comment,
      },
      ip,
      userAgent,
    });
  } else if (request.status === "cancel_pending") {
    // Approver refuses the cancellation — absence stays approved.
    await prisma.absenceRequest.update({
      where: { id: requestId },
      data: {
        status: "approved",
      },
    });

    await notify({
      recipientId: request.employee.id,
      kind: "request.rejected",
      payload: {
        requestId,
        approverName: approver.fullName,
        decision: "cancel_rejected",
      },
      sendEmail: () =>
        sendCancelRejectedEmail({
          requesterEmail: request.employee.email,
          requesterName: request.employee.fullName,
          approverName: approver.fullName,
          categoryCode: request.category.code,
          startDate: request.startDate,
          endDate: request.endDate,
        }),
    });

    await recordAuditEvent({
      actorId: approver.id,
      action: "absence.request.cancel_rejected",
      targetType: "absence_request",
      targetId: requestId,
      payload: {
        employeeId: request.employee.id,
        category: request.category.code,
      },
      ip,
      userAgent,
    });
  } else {
    return { ok: false, error: "Заявката вече е обработена." };
  }

  revalidatePath("/absence/inbox");
  revalidatePath("/absence");
  return { ok: true };
}
