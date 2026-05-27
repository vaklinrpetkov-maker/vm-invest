import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Single entry point for absence-module notifications. Writes the DB row, then
// attempts the email delivery. Email failures are logged but never block the
// business transaction — the DB row is the durable record, email is best-effort.
//
// Kind taxonomy matches the spec's notifications.kind enum. Keep it in sync with
// absence.notifications.kind values that consumers (admin UI, digest job) expect.

type NotifyInput = {
  recipientId: string;
  kind:
    | "request.submitted"
    | "request.approved"
    | "request.rejected"
    | "request.cancel_requested"
    | "absence.starting_today"
    | "year_end.carryover_risk";
  payload: Prisma.InputJsonValue;
  sendEmail: () => Promise<unknown>;
};

export async function notify({ recipientId, kind, payload, sendEmail }: NotifyInput): Promise<void> {
  const row = await prisma.absenceNotification.create({
    data: { recipientId, kind, payload },
  });

  try {
    await sendEmail();
    await prisma.absenceNotification.update({
      where: { id: row.id },
      data: { emailSentAt: new Date() },
    });
  } catch (err) {
    console.error("[absence.notify] email send failed", { kind, recipientId, err });
    // Row stays with emailSentAt = null; admin can see failed-email notifications.
  }
}
