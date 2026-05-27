import { publicEnv } from "@/lib/env";
import { emailButton, sendEmail, wrapEmail } from "@/lib/email/shared";

const ROLE_LABEL_BG: Record<string, string> = {
  admin: "Администратор",
  manager: "Мениджър",
  user: "Потребител",
};

type SendInviteEmailInput = {
  to: string;
  token: string;
  role: "admin" | "manager" | "user";
  invitedByName: string;
};

export async function sendInviteEmail({ to, token, role, invitedByName }: SendInviteEmailInput) {
  const link = `${publicEnv.NEXT_PUBLIC_APP_URL}/invite/${token}`;
  const roleLabel = ROLE_LABEL_BG[role] ?? role;

  const subject = "Покана за vminvest ERP";
  const text = [
    `Здравейте,`,
    ``,
    `${invitedByName} ви покани да се присъедините към вътрешната система на vminvest като ${roleLabel}.`,
    ``,
    `Използвайте следния линк, за да зададете парола и да влезете:`,
    link,
    ``,
    `Линкът е валиден 72 часа.`,
    ``,
    `Ако не очаквате тази покана, можете да я игнорирате.`,
  ].join("\n");

  const html = wrapEmail(`
    <p>Здравейте,</p>
    <p><strong>${invitedByName}</strong> ви покани да се присъедините към вътрешната система на vminvest като <strong>${roleLabel}</strong>.</p>
    <p>${emailButton(link, "Задайте парола и влезте")}</p>
    <p style="color:#6E6E62; font-size:13px;">Или копирайте този адрес в браузъра си:<br><span style="word-break:break-all;">${link}</span></p>
    <p style="color:#6E6E62; font-size:13px;">Линкът е валиден 72 часа.</p>
    <p style="color:#6E6E62; font-size:13px;">Ако не очаквате тази покана, можете да я игнорирате.</p>
  `);

  return sendEmail({ to, subject, text, html });
}
