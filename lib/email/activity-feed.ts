// Activity-feed emails sent via Resend. Currently one flavour:
// `sendMentionEmail` — fired when a user is `@mentioned` in a note.
//
// Phase 1.B-mentions per `specs/_foundations/activity-feed.md` §8.3:
// immediate send, one email per new mention. Failures are caught at the
// caller in `lib/activity-feed/actions.ts` so the note write itself never
// blocks — `ActivityNoteMention.notifiedAt` stays null when the send
// fails, and a future retry job picks it up.

import { publicEnv } from "@/lib/env";
import {
  emailButton,
  escapeHtml,
  sendEmail,
  wrapEmail,
} from "@/lib/email/shared";

// Truncate the note excerpt to a sane preview length. Newlines preserved
// as `\n` in text, `<br/>` in HTML.
const EXCERPT_MAX = 300;

function truncate(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length <= EXCERPT_MAX) return trimmed;
  return trimmed.slice(0, EXCERPT_MAX - 1).trimEnd() + "…";
}

export async function sendMentionEmail(args: {
  recipientEmail: string;
  recipientName: string;
  actorName: string;
  // Human-friendly label for the record — e.g. the contact's fullName or
  // the lead's contactName. Resolved by the caller per targetType.
  targetLabel: string;
  // Deep-link to the record's detail page, with `#note-{id}` anchor so the
  // browser scrolls to the mention.
  deepLinkUrl: string;
  noteBody: string;
}): Promise<void> {
  const subject = `Споменат от ${args.actorName} в ${args.targetLabel}`;
  const excerpt = truncate(args.noteBody);

  const text = [
    `Здравейте, ${args.recipientName},`,
    ``,
    `${args.actorName} ви спомена в бележка под „${args.targetLabel}":`,
    ``,
    excerpt,
    ``,
    `Виж бележката: ${args.deepLinkUrl}`,
  ].join("\n");

  const html = wrapEmail(`
    <p>Здравейте, ${escapeHtml(args.recipientName)},</p>
    <p><strong>${escapeHtml(args.actorName)}</strong> ви спомена в бележка под „<strong>${escapeHtml(args.targetLabel)}</strong>":</p>
    <blockquote style="margin:12px 0; padding:12px 16px; border-left:3px solid #E5E5E5; background:#FAFAFA; color:#454545; white-space:pre-wrap;">${escapeHtml(excerpt)}</blockquote>
    <p>${emailButton(args.deepLinkUrl, "Виж бележката")}</p>
  `);

  await sendEmail({ to: args.recipientEmail, subject, text, html });
}

// Build the deep-link URL for a mentioned note. Module-level helper so the
// notification + the in-app pill click can share the same path.
export function mentionDeepLink(
  targetPath: string, // e.g. "/contacts/abc-uuid"
  noteId: string,
): string {
  // `#note-{id}` anchor — once the activity feed adds per-note anchor IDs
  // the browser will scroll to it on load.
  return `${publicEnv.NEXT_PUBLIC_APP_URL}${targetPath}#note-${noteId}`;
}
