import { publicEnv } from "@/lib/env";
import { emailButton, sendEmail, wrapEmail } from "@/lib/email/shared";
import { formatDate } from "@/lib/format";

// Absence-module emails sent via Resend. Each function is a thin wrapper so
// server actions can just await it and move on. Failures are thrown — callers
// decide whether to rollback or log-and-continue.

const CATEGORY_LABEL: Record<string, string> = {
  PAID: "Платен отпуск",
  UNPAID: "Неплатен отпуск",
  SICK: "Болничен",
  PARENTAL: "Родителски отпуск",
  WFH: "Работа от вкъщи",
  BEREAVEMENT: "Отпуск при загуба",
};

export async function sendRequestSubmittedEmail(args: {
  approverEmail: string;
  approverName: string;
  requesterName: string;
  categoryCode: string;
  startDate: Date;
  endDate: Date;
  workingDays: number;
  notes: string | null;
}) {
  const categoryLabel = CATEGORY_LABEL[args.categoryCode] ?? args.categoryCode;
  const dateRange =
    args.startDate.getTime() === args.endDate.getTime()
      ? formatDate(args.startDate)
      : `${formatDate(args.startDate)} – ${formatDate(args.endDate)}`;
  const inboxUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}/absence/inbox`;

  const subject = `Нова заявка за отсъствие — ${args.requesterName}`;
  const text = [
    `Здравейте, ${args.approverName},`,
    ``,
    `${args.requesterName} подаде заявка за ${categoryLabel.toLowerCase()}:`,
    `• Период: ${dateRange}`,
    `• Работни дни: ${args.workingDays}`,
    args.notes ? `• Бележки: ${args.notes}` : null,
    ``,
    `Одобрете или отхвърлете от: ${inboxUrl}`,
  ].filter(Boolean).join("\n");

  const html = wrapEmail(`
    <p>Здравейте, ${args.approverName},</p>
    <p><strong>${args.requesterName}</strong> подаде заявка за ${categoryLabel.toLowerCase()}:</p>
    <ul>
      <li>Период: <strong>${dateRange}</strong></li>
      <li>Работни дни: <strong>${args.workingDays}</strong></li>
      ${args.notes ? `<li>Бележки: ${args.notes}</li>` : ""}
    </ul>
    <p>${emailButton(inboxUrl, "Към пощенската кутия")}</p>
  `);

  await sendEmail({ to: args.approverEmail, subject, text, html });
}

export async function sendRequestApprovedEmail(args: {
  requesterEmail: string;
  requesterName: string;
  approverName: string;
  categoryCode: string;
  startDate: Date;
  endDate: Date;
  workingDays: number;
}) {
  const categoryLabel = CATEGORY_LABEL[args.categoryCode] ?? args.categoryCode;
  const dateRange =
    args.startDate.getTime() === args.endDate.getTime()
      ? formatDate(args.startDate)
      : `${formatDate(args.startDate)} – ${formatDate(args.endDate)}`;
  const myUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}/absence`;

  const subject = "Одобрена заявка за отсъствие";
  const text = [
    `Здравейте, ${args.requesterName},`,
    ``,
    `${args.approverName} одобри вашата заявка за ${categoryLabel.toLowerCase()}:`,
    `• Период: ${dateRange}`,
    `• Работни дни: ${args.workingDays}`,
    ``,
    `Вижте подробности на: ${myUrl}`,
  ].join("\n");

  const html = wrapEmail(`
    <p>Здравейте, ${args.requesterName},</p>
    <p><strong>${args.approverName}</strong> одобри вашата заявка за ${categoryLabel.toLowerCase()}:</p>
    <ul>
      <li>Период: <strong>${dateRange}</strong></li>
      <li>Работни дни: <strong>${args.workingDays}</strong></li>
    </ul>
    <p>${emailButton(myUrl, "Към моите отсъствия")}</p>
  `);

  await sendEmail({ to: args.requesterEmail, subject, text, html });
}

export async function sendCancelRequestedEmail(args: {
  approverEmail: string;
  approverName: string;
  requesterName: string;
  categoryCode: string;
  startDate: Date;
  endDate: Date;
  workingDays: number;
}) {
  const categoryLabel = CATEGORY_LABEL[args.categoryCode] ?? args.categoryCode;
  const dateRange =
    args.startDate.getTime() === args.endDate.getTime()
      ? formatDate(args.startDate)
      : `${formatDate(args.startDate)} – ${formatDate(args.endDate)}`;
  const inboxUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}/absence/inbox`;

  const subject = `Искане за отказ — ${args.requesterName}`;
  const text = [
    `Здравейте, ${args.approverName},`,
    ``,
    `${args.requesterName} иска да отмени вече одобрена заявка за ${categoryLabel.toLowerCase()}:`,
    `• Период: ${dateRange}`,
    `• Работни дни: ${args.workingDays}`,
    ``,
    `Решете дали да потвърдите или да оставите заявката активна: ${inboxUrl}`,
  ].join("\n");

  const html = wrapEmail(`
    <p>Здравейте, ${args.approverName},</p>
    <p><strong>${args.requesterName}</strong> иска да отмени вече одобрена заявка за ${categoryLabel.toLowerCase()}:</p>
    <ul>
      <li>Период: <strong>${dateRange}</strong></li>
      <li>Работни дни: <strong>${args.workingDays}</strong></li>
    </ul>
    <p>Решете дали да потвърдите отказа или да оставите заявката активна.</p>
    <p>${emailButton(inboxUrl, "Към пощенската кутия")}</p>
  `);

  await sendEmail({ to: args.approverEmail, subject, text, html });
}

export async function sendCancelApprovedEmail(args: {
  requesterEmail: string;
  requesterName: string;
  approverName: string;
  categoryCode: string;
  startDate: Date;
  endDate: Date;
}) {
  const categoryLabel = CATEGORY_LABEL[args.categoryCode] ?? args.categoryCode;
  const dateRange =
    args.startDate.getTime() === args.endDate.getTime()
      ? formatDate(args.startDate)
      : `${formatDate(args.startDate)} – ${formatDate(args.endDate)}`;
  const myUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}/absence`;

  const subject = "Отменена заявка за отсъствие";
  const text = [
    `Здравейте, ${args.requesterName},`,
    ``,
    `${args.approverName} потвърди отмяната на вашата заявка за ${categoryLabel.toLowerCase()} (${dateRange}).`,
    `Дните са възстановени към баланса ви.`,
    ``,
    `Вижте подробности: ${myUrl}`,
  ].join("\n");

  const html = wrapEmail(`
    <p>Здравейте, ${args.requesterName},</p>
    <p><strong>${args.approverName}</strong> потвърди отмяната на вашата заявка за ${categoryLabel.toLowerCase()} (<strong>${dateRange}</strong>).</p>
    <p>Дните са възстановени към баланса ви.</p>
    <p>${emailButton(myUrl, "Към моите отсъствия")}</p>
  `);

  await sendEmail({ to: args.requesterEmail, subject, text, html });
}

export async function sendCancelRejectedEmail(args: {
  requesterEmail: string;
  requesterName: string;
  approverName: string;
  categoryCode: string;
  startDate: Date;
  endDate: Date;
}) {
  const categoryLabel = CATEGORY_LABEL[args.categoryCode] ?? args.categoryCode;
  const dateRange =
    args.startDate.getTime() === args.endDate.getTime()
      ? formatDate(args.startDate)
      : `${formatDate(args.startDate)} – ${formatDate(args.endDate)}`;
  const myUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}/absence`;

  const subject = "Отказът не беше приет";
  const text = [
    `Здравейте, ${args.requesterName},`,
    ``,
    `${args.approverName} не прие искането за отмяна на вашата заявка за ${categoryLabel.toLowerCase()} (${dateRange}).`,
    `Заявката остава одобрена и присъства в календара.`,
    ``,
    `Вижте подробности: ${myUrl}`,
  ].join("\n");

  const html = wrapEmail(`
    <p>Здравейте, ${args.requesterName},</p>
    <p><strong>${args.approverName}</strong> не прие искането за отмяна на вашата заявка за ${categoryLabel.toLowerCase()} (<strong>${dateRange}</strong>).</p>
    <p>Заявката остава одобрена и присъства в календара.</p>
    <p>${emailButton(myUrl, "Към моите отсъствия")}</p>
  `);

  await sendEmail({ to: args.requesterEmail, subject, text, html });
}

export async function sendRequestRejectedEmail(args: {
  requesterEmail: string;
  requesterName: string;
  approverName: string;
  categoryCode: string;
  startDate: Date;
  endDate: Date;
  rejectionComment: string | null;
}) {
  const categoryLabel = CATEGORY_LABEL[args.categoryCode] ?? args.categoryCode;
  const dateRange =
    args.startDate.getTime() === args.endDate.getTime()
      ? formatDate(args.startDate)
      : `${formatDate(args.startDate)} – ${formatDate(args.endDate)}`;
  const myUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}/absence`;

  const subject = "Отхвърлена заявка за отсъствие";
  const text = [
    `Здравейте, ${args.requesterName},`,
    ``,
    `${args.approverName} отхвърли вашата заявка за ${categoryLabel.toLowerCase()} (${dateRange}).`,
    args.rejectionComment ? `Причина: ${args.rejectionComment}` : null,
    ``,
    `Можете да подадете нова заявка: ${myUrl}`,
  ].filter(Boolean).join("\n");

  const html = wrapEmail(`
    <p>Здравейте, ${args.requesterName},</p>
    <p><strong>${args.approverName}</strong> отхвърли вашата заявка за ${categoryLabel.toLowerCase()} (<strong>${dateRange}</strong>).</p>
    ${args.rejectionComment ? `<p style="background:#F9E6E1; padding:12px; border-radius:8px; color:#6D2210;">Причина: ${args.rejectionComment}</p>` : ""}
    <p>${emailButton(myUrl, "Към моите отсъствия")}</p>
  `);

  await sendEmail({ to: args.requesterEmail, subject, text, html });
}

