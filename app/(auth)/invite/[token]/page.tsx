import Link from "next/link";
import { inviteStatus } from "@/lib/auth/invite";
import { prisma } from "@/lib/prisma";
import { RedeemForm } from "./redeem-form";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  admin: "Администратор",
  manager: "Мениджър",
  user: "Потребител",
};

const STATUS_MESSAGE: Record<string, string> = {
  redeemed: "Тази покана вече е използвана. Моля, влезте от страницата за вход.",
  cancelled: "Тази покана е отказана. Свържете се с администратор за нова.",
  expired: "Тази покана е изтекла. Помолете администратор да изпрати нова.",
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await prisma.invite.findUnique({ where: { token } });

  if (!invite) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl text-neutral-900">Невалидна покана</h1>
        <p className="text-base text-neutral-600">
          Тази покана не съществува. Свържете се с администратор.
        </p>
        <Link href="/login" className="text-base text-accent-700 hover:text-accent-800">
          Към вход
        </Link>
      </div>
    );
  }

  const status = inviteStatus(invite);
  if (status !== "active") {
    return (
      <div className="space-y-4">
        <h1 className="text-xl text-neutral-900">Поканата не е валидна</h1>
        <p className="text-base text-neutral-600">{STATUS_MESSAGE[status]}</p>
        <Link href="/login" className="text-base text-accent-700 hover:text-accent-800">
          Към вход
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl text-neutral-900">Добре дошли в vminvest ERP</h1>
        <p className="text-base text-neutral-600">
          Задайте парола за вашия акаунт като {ROLE_LABEL[invite.role]}.
        </p>
      </div>
      <RedeemForm token={token} email={invite.email} />
    </div>
  );
}
