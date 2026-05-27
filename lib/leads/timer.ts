import { recordAuditEvent } from "@/lib/auth/audit";
import { sendEscalationDigest } from "@/lib/email/leads";
import { prisma } from "@/lib/prisma";

// Response-timer helpers used by the inbox page and the cron endpoint.
// LP2-B splits the scan into two concerns so callers decide whether to notify:
//
//   runEscalationScan(): set timerEscalatedAt + write audit; returns the
//     newly-escalated lead IDs.
//   notifyEscalated(ids): build a per-recipient digest and email it to every
//     active manager + admin.
//
// Both are idempotent. The scan uses a conditional updateMany to guarantee
// exactly-once flagging per lead even under concurrent calls.

export const ESCALATION_WINDOW_MS = 24 * 60 * 60 * 1000;

export type TimerState = "running" | "stopped" | "escalated";

export function formatElapsed(ms: number): string {
  if (ms < 0) ms = 0;
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const days = Math.floor(hr / 24);

  if (days >= 1) return `${days}д ${hr % 24}ч`;
  if (hr >= 1) return `${hr}ч ${min % 60}м`;
  if (min >= 1) return `${min}м`;
  return `${sec}с`;
}

export type ElapsedTone = "success" | "warning" | "danger";

export function elapsedTone(ms: number): ElapsedTone {
  if (ms >= ESCALATION_WINDOW_MS) return "danger";
  if (ms >= ESCALATION_WINDOW_MS / 2) return "warning";
  return "success";
}

// Flag any open timer older than 24h as escalated. Returns IDs newly escalated
// on this call (so the caller can notify).
export async function runEscalationScan(): Promise<string[]> {
  const threshold = new Date(Date.now() - ESCALATION_WINDOW_MS);

  const due = await prisma.lead.findMany({
    where: {
      deletedAt: null,
      timerStartedAt: { lt: threshold, not: null },
      timerStoppedAt: null,
      timerEscalatedAt: null,
    },
    select: { id: true, timerStartedAt: true },
  });

  if (due.length === 0) return [];

  const now = new Date();
  const newlyEscalated: string[] = [];

  await Promise.all(
    due.map(async (l) => {
      const res = await prisma.lead.updateMany({
        where: { id: l.id, timerEscalatedAt: null },
        data: { timerEscalatedAt: now },
      });
      if (res.count === 1) {
        newlyEscalated.push(l.id);
        await recordAuditEvent({
          action: "leads.timer.escalated",
          targetType: "lead",
          targetId: l.id,
          payload: {
            timerStartedAt: l.timerStartedAt?.toISOString() ?? null,
            elapsedMs: now.getTime() - (l.timerStartedAt?.getTime() ?? now.getTime()),
          },
        });
      }
    }),
  );

  return newlyEscalated;
}

// Email every active manager + admin a single digest listing the newly-
// escalated leads. One email per recipient, not per lead, to avoid spam on
// bursty escalations (e.g. after a cron outage). Failures per recipient log
// and don't break the batch.
export async function notifyEscalated(leadIds: string[]): Promise<void> {
  if (leadIds.length === 0) return;

  const [leads, recipients] = await Promise.all([
    prisma.lead.findMany({
      where: { id: { in: leadIds } },
      select: {
        id: true,
        timerStartedAt: true,
        emailReceivedAt: true,
        properties: true,
        contact: { select: { fullName: true } },
      },
    }),
    prisma.profile.findMany({
      where: { active: true, role: { in: ["admin", "manager"] } },
      select: { email: true, fullName: true },
    }),
  ]);

  if (recipients.length === 0) return;

  await Promise.all(
    recipients.map(async (r) => {
      try {
        await sendEscalationDigest({
          recipientEmail: r.email,
          recipientName: r.fullName,
          leads: leads.map((l) => ({
            id: l.id,
            contactName: l.contact.fullName,
            property: l.properties[0] ?? null,
            startedAt: l.timerStartedAt ?? l.emailReceivedAt ?? new Date(),
          })),
        });
      } catch (err) {
        console.error(`[leads.escalation] email to ${r.email} failed`, err);
      }
    }),
  );
}
