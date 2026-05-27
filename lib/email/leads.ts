import { publicEnv } from "@/lib/env";
import { emailButton, sendEmail, wrapEmail } from "@/lib/email/shared";
import { formatDateTime } from "@/lib/format";

// Outbound emails for the leads module. For LP2-B we only need the escalation
// digest; more will be added as we layer on email-driven flows.

export type EscalatedLead = {
  id: string;
  contactName: string;
  property: string | null;
  startedAt: Date;
};

export async function sendEscalationDigest(args: {
  recipientEmail: string;
  recipientName: string;
  leads: EscalatedLead[];
}) {
  if (args.leads.length === 0) return;

  const inboxUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}/leads/inbox`;
  const subject =
    args.leads.length === 1
      ? `Лийд без отговор над 24ч — ${args.leads[0].contactName}`
      : `${args.leads.length} лийда без отговор над 24ч`;

  const textLines = [
    `Здравейте, ${args.recipientName},`,
    ``,
    `Следните имейл-лийдове очакват отговор повече от 24 часа:`,
    ``,
    ...args.leads.map(
      (l) =>
        `• ${l.contactName}${l.property ? ` — ${l.property}` : ""} (постъпил ${formatDateTime(l.startedAt)})`,
    ),
    ``,
    `Отворете входящата кутия: ${inboxUrl}`,
  ];
  const text = textLines.filter((x) => x !== null).join("\n");

  const htmlList = args.leads
    .map(
      (l) => `<li>
        <strong>${l.contactName}</strong>${l.property ? ` — ${l.property}` : ""}
        <span style="color:#6E6E62;"> · постъпил ${formatDateTime(l.startedAt)}</span>
      </li>`,
    )
    .join("");

  const html = wrapEmail(`
    <p>Здравейте, ${args.recipientName},</p>
    <p>Следните имейл-лийдове очакват отговор <strong>повече от 24 часа</strong>:</p>
    <ul>${htmlList}</ul>
    <p>${emailButton(inboxUrl, "Отвори входящата кутия")}</p>
  `);

  await sendEmail({ to: args.recipientEmail, subject, text, html });
}
