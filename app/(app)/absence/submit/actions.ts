"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/auth/audit";
import { notify } from "@/lib/absence/notify";
import { resolveApprover } from "@/lib/absence/routing";
import { requireProfile } from "@/lib/auth/session";
import { sendRequestSubmittedEmail } from "@/lib/email/absence";
import { prisma } from "@/lib/prisma";

export type SubmitState = {
  errors?: {
    categoryCode?: string;
    startDate?: string;
    endDate?: string;
    form?: string;
  };
};

export async function submitAbsence(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const employee = await requireProfile();

  const categoryCode = String(formData.get("categoryCode") ?? "").trim();
  const startDateStr = String(formData.get("startDate") ?? "").trim();
  const endDateStr = String(formData.get("endDate") ?? "").trim();
  const startHalf = formData.get("startHalf") === "on";
  const endHalf = formData.get("endHalf") === "on";
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const errors: SubmitState["errors"] = {};
  if (!categoryCode) errors.categoryCode = "Изберете тип отсъствие.";
  if (!startDateStr) errors.startDate = "Изберете начална дата.";
  if (!endDateStr) errors.endDate = "Изберете крайна дата.";
  if (startDateStr && endDateStr && startDateStr > endDateStr) {
    errors.endDate = "Крайната дата не може да е преди началната.";
  }
  if (Object.keys(errors).length) return { errors };

  const category = await prisma.absenceCategory.findUnique({ where: { code: categoryCode } });
  if (!category) return { errors: { categoryCode: "Непознат тип отсъствие." } };

  // Retroactive check — disallow past-dated requests unless the category allows it.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const start = new Date(`${startDateStr}T00:00:00Z`);
  if (start < today && !category.allowsRetroactive) {
    return { errors: { startDate: "Тази категория не позволява минала дата." } };
  }

  // Authoritative working-days count from the DB function.
  const [wd] = await prisma.$queryRaw<{ fn_working_days: unknown }[]>`
    select absence.fn_working_days(
      ${startDateStr}::date,
      ${endDateStr}::date,
      ${category.allowsHalfDay && startHalf}::boolean,
      ${category.allowsHalfDay && endHalf}::boolean
    ) as fn_working_days
  `;
  const workingDaysCount = Number(wd?.fn_working_days ?? 0);
  if (workingDaysCount <= 0) {
    return { errors: { form: "Заявката не включва работни дни." } };
  }

  const approverId = await resolveApprover(employee.id);
  if (!approverId) {
    return { errors: { form: "Няма одобряващ. Свържете се с администратор." } };
  }

  // Flag signals used by anomaly detection in later milestones.
  const submittedAt = new Date();
  const daysUntilStart = Math.floor((start.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  const lateSubmission = daysUntilStart < 5 && !category.allowsRetroactive;

  // Oversize: > 50% of annual quota in a single request (for PAID only — other
  // categories don't count against the annual bucket).
  const oversizeFlag =
    category.deductsFromPaid &&
    workingDaysCount > employee.annualDays.toNumber() * 0.5;

  const request = await prisma.absenceRequest.create({
    data: {
      employeeId: employee.id,
      categoryCode,
      startDate: start,
      endDate: new Date(`${endDateStr}T00:00:00Z`),
      startHalf: category.allowsHalfDay && startHalf,
      endHalf: category.allowsHalfDay && endHalf,
      workingDaysCount,
      status: "pending",
      currentApproverId: approverId,
      submittedAt,
      lateSubmission,
      oversizeFlag,
      createdVia: "self",
      notes,
    },
  });

  const approver = await prisma.profile.findUniqueOrThrow({
    where: { id: approverId },
    select: { email: true, fullName: true },
  });

  await notify({
    recipientId: approverId,
    kind: "request.submitted",
    payload: {
      requestId: request.id,
      employeeId: employee.id,
      employeeName: employee.fullName,
      categoryCode,
      startDate: startDateStr,
      endDate: endDateStr,
      workingDays: workingDaysCount,
    },
    sendEmail: () =>
      sendRequestSubmittedEmail({
        approverEmail: approver.email,
        approverName: approver.fullName,
        requesterName: employee.fullName,
        categoryCode,
        startDate: start,
        endDate: new Date(`${endDateStr}T00:00:00Z`),
        workingDays: workingDaysCount,
        notes,
      }),
  });

  const hdrs = await headers();
  await recordAuditEvent({
    actorId: employee.id,
    action: "absence.request.submit",
    targetType: "absence_request",
    targetId: request.id,
    payload: {
      category: categoryCode,
      workingDays: workingDaysCount,
      approverId,
      lateSubmission,
      oversizeFlag,
    },
    ip: hdrs.get("x-forwarded-for") ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  redirect("/absence");
}
