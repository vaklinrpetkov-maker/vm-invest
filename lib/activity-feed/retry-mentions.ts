// Periodic retry job for `@mention` email notifications. Picks up
// `ActivityNoteMention` rows where `notifiedAt IS NULL` (Resend failed at
// post/edit time) and re-tries the send. Idempotent — `notifiedAt` is
// stamped on success, leaving null on failure for the next run.
//
// Triggered via `/api/activity-feed/mentions-retry`. Safe to call as often
// as the cron permits — the scan is bounded by `batchSize` per call so a
// large backlog drains over multiple invocations.
//
// Trade-offs documented in `specs/_foundations/activity-feed.md` §15:
//   - **Age cap**: mentions older than `MAX_AGE_DAYS` (default 7) are
//     abandoned. A recipient receiving "you were mentioned 10 days ago"
//     is more confusing than useful; manual admin intervention is the
//     escape hatch (just edit the note to re-trigger the mention).
//   - **No row lock**: concurrent scans could in principle double-send.
//     Cron runs hourly, scans complete in seconds, overlap probability
//     is essentially zero at our scale. SELECT FOR UPDATE adds complexity
//     for a phantom risk — revisit only if we observe duplicate emails.
//   - **No attempt counter**: relying on the age cap to terminate
//     instead of a per-row counter. Saves a schema change.

import { sendMentionEmail, mentionDeepLink } from "@/lib/email/activity-feed";
import { prisma } from "@/lib/prisma";
import { resolveTargetLabel, targetRevalidatePath } from "./queries";
import type { ActivityTargetType } from "./types";

const MAX_AGE_DAYS = 7;
const DEFAULT_BATCH = 50;

export type RetryScanResult = {
  scanned: number;
  succeeded: number;
  failed: number;
  skippedTooOld: number;
  skippedNoTarget: number;
  noteIds: string[];
};

export async function runMentionRetryScan(opts?: {
  batchSize?: number;
  maxAgeDays?: number;
}): Promise<RetryScanResult> {
  const batchSize = opts?.batchSize ?? DEFAULT_BATCH;
  const maxAgeDays = opts?.maxAgeDays ?? MAX_AGE_DAYS;
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

  // Pull the candidate rows in one query — `notifiedAt IS NULL` AND
  // `createdAt >= cutoff` (anything older is abandoned, see comments above).
  // Include enough of the parent note + recipient profile to render the
  // email without per-row lookups.
  const pending = await prisma.activityNoteMention.findMany({
    where: {
      notifiedAt: null,
      createdAt: { gte: cutoff },
    },
    orderBy: { createdAt: "asc" },
    take: batchSize,
    include: {
      note: {
        select: {
          id: true,
          body: true,
          targetType: true,
          targetId: true,
          deletedAt: true,
          author: { select: { id: true, fullName: true } },
        },
      },
      mentionedProfile: { select: { id: true, email: true, fullName: true, active: true } },
    },
  });

  const result: RetryScanResult = {
    scanned: pending.length,
    succeeded: 0,
    failed: 0,
    skippedTooOld: 0,
    skippedNoTarget: 0,
    noteIds: [],
  };

  // Also count rows that were filtered out by the age cap — useful for
  // alerting when the backlog has stuck rows nobody's going to retry.
  result.skippedTooOld = await prisma.activityNoteMention.count({
    where: { notifiedAt: null, createdAt: { lt: cutoff } },
  });

  for (const row of pending) {
    // Note was soft-deleted after the mention was created — skip and stamp
    // notifiedAt so we don't keep re-picking the row. The user is no
    // longer at risk of getting a notification for a now-deleted note.
    if (row.note.deletedAt !== null) {
      await prisma.activityNoteMention.update({
        where: { id: row.id },
        data: { notifiedAt: new Date() },
      });
      result.succeeded++;
      continue;
    }

    // Self-mentions are stored but never emailed. If one slipped through
    // the original post (shouldn't happen — the action layer filters), the
    // retry stamps it as "done" so it doesn't keep getting picked up.
    if (row.mentionedProfileId === row.note.author.id) {
      await prisma.activityNoteMention.update({
        where: { id: row.id },
        data: { notifiedAt: new Date() },
      });
      result.succeeded++;
      continue;
    }

    // Deactivated profile — no point retrying. Mark as done.
    if (!row.mentionedProfile.active) {
      await prisma.activityNoteMention.update({
        where: { id: row.id },
        data: { notifiedAt: new Date() },
      });
      result.succeeded++;
      continue;
    }

    const targetType = row.note.targetType as ActivityTargetType;
    const targetLabel = await resolveTargetLabel(targetType, row.note.targetId);
    if (!targetLabel) {
      // Parent record was hard-deleted (e.g. invoice / contract — neither
      // soft-deletes). Mark the mention as done; the email is moot.
      result.skippedNoTarget++;
      await prisma.activityNoteMention.update({
        where: { id: row.id },
        data: { notifiedAt: new Date() },
      });
      continue;
    }

    const deepLink = mentionDeepLink(
      targetRevalidatePath(targetType, row.note.targetId),
      row.note.id,
    );

    try {
      await sendMentionEmail({
        recipientEmail: row.mentionedProfile.email,
        recipientName: row.mentionedProfile.fullName,
        actorName: row.note.author.fullName,
        targetLabel,
        deepLinkUrl: deepLink,
        noteBody: row.note.body,
      });
      await prisma.activityNoteMention.update({
        where: { id: row.id },
        data: { notifiedAt: new Date() },
      });
      result.succeeded++;
      result.noteIds.push(row.note.id);
    } catch (err) {
      // Leave `notifiedAt` null so the next scan picks it up. Log + count.
      result.failed++;
      console.error("[activity-feed] mention retry failed", {
        mentionId: row.id,
        noteId: row.note.id,
        recipientId: row.mentionedProfileId,
        err,
      });
    }
  }

  return result;
}
