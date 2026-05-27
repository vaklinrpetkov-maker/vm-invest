// Shared building blocks for outbound emails. Every module's email file
// (`absence.ts`, `activity-feed.ts`, `invite.ts`, `leads.ts`) had hand-rolled
// versions of the same HTML shell, CTA button, and Resend send wrapper —
// pulled into one place here so message-specific files only carry copy.
//
// Style choices baked in:
//   - System font stack (no web fonts in transactional email; renders fine
//     in Gmail / Outlook / Apple Mail without a fetch).
//   - `max-width: 600px` — works in every major client without horizontal
//     scroll on mobile. Note: `leads.ts` previously used 640px; the
//     consolidation drops it to 600 for consistency.
//   - Button background `#17170F` (neutral-1000 from `tokens.md`) — the same
//     near-black the app uses for primary buttons.
//
// Functional behaviour:
//   - `sendEmail` throws on Resend error (mirrors what every previous helper
//     did). Callers decide whether to swallow, retry, or rollback.

import { serverEnv } from "@/lib/env";
import { getResend } from "@/lib/resend";

// Wrap a fragment of HTML body in the canonical email shell — sets the
// system font + line height + max-width so message-specific code only
// renders the inside content.
export function wrapEmail(content: string): string {
  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#17170F; line-height:1.5; max-width:600px;">${content}</div>`;
}

// Render a primary call-to-action button as inline HTML. Output is a
// single `<a>` styled to match the app's primary button — works without a
// stylesheet (transactional clients strip <style> blocks anyway).
export function emailButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block; background:#17170F; color:#fff; padding:10px 16px; border-radius:8px; text-decoration:none;">${label}</a>`;
}

// Escape user-supplied strings before interpolating into HTML. Currently
// used by the activity-feed mention email so a recipient name like `<Ivan>`
// doesn't break the markup. Other modules pass through trusted strings
// (admin-managed labels, app-generated dates) and may skip escaping.
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Resend send wrapper. Throws on error so the caller's try/catch (or its
// absence) controls retry / rollback semantics. The previous per-module
// `send` helpers all did exactly this.
export async function sendEmail(args: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const resend = getResend();
  const result = await resend.emails.send({
    from: serverEnv().RESEND_FROM_EMAIL,
    to: args.to,
    subject: args.subject,
    text: args.text,
    html: args.html,
  });
  if (result.error) {
    throw new Error(`Resend error: ${result.error.message}`);
  }
  return result.data;
}
