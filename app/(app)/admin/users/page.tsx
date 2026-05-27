import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TBody, THead, TH, TR, TD, TableEmpty } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { inviteStatus, type InviteStatus } from "@/lib/auth/invite";
import { formatDate, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { cancelInvite } from "./actions";
import { InviteForm } from "./invite-form";
import { UserRow } from "./user-row";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  admin: "Администратор",
  manager: "Мениджър",
  user: "Потребител",
};

const STATUS_LABEL: Record<InviteStatus, string> = {
  active: "Активна",
  redeemed: "Приета",
  cancelled: "Отказана",
  expired: "Изтекла",
};

const STATUS_TONE: Record<InviteStatus, "info" | "success" | "neutral" | "warning"> = {
  active: "info",
  redeemed: "success",
  cancelled: "neutral",
  expired: "warning",
};

export default async function AdminUsersPage() {
  const me = await requireRole("admin");

  const [users, invites] = await Promise.all([
    prisma.profile.findMany({ orderBy: [{ active: "desc" }, { fullName: "asc" }] }),
    prisma.invite.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { invitedBy: { select: { fullName: true } } },
    }),
  ]);

  return (
    <div className="space-y-10 max-w-5xl">
      <section className="space-y-4">
        <div>
          <h1 className="text-xl text-neutral-900">Покани и потребители</h1>
          <p className="text-base text-neutral-600">
            Изпратете покана към нов колега или прегледайте съществуващите акаунти.
          </p>
        </div>
        <InviteForm />
      </section>

      <section className="space-y-3">
        <h2 className="text-md font-medium text-neutral-900">Покани</h2>
        <Table>
          <THead>
            <TR hover={false}>
              <TH>Имейл</TH>
              <TH>Роля</TH>
              <TH>Изпратена</TH>
              <TH>Изтича</TH>
              <TH>Статус</TH>
              <TH align="right" />
            </TR>
          </THead>
          <TBody>
            {invites.length === 0 && (
              <TableEmpty colSpan={6}>Все още няма покани.</TableEmpty>
            )}
            {invites.map((invite) => {
              const status = inviteStatus(invite);
              return (
                <TR key={invite.id}>
                  <TD>{invite.email}</TD>
                  <TD muted>{ROLE_LABEL[invite.role]}</TD>
                  <TD muted numeric>{formatDateTime(invite.createdAt)}</TD>
                  <TD muted numeric>{formatDate(invite.expiresAt)}</TD>
                  <TD>
                    <StatusBadge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusBadge>
                  </TD>
                  <TD align="right">
                    {status === "active" && (
                      <form action={cancelInvite}>
                        <input type="hidden" name="inviteId" value={invite.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Откажи
                        </Button>
                      </form>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </section>

      <section className="space-y-3">
        <h2 className="text-md font-medium text-neutral-900">Потребители</h2>
        <Table>
          <THead>
            <TR hover={false}>
              <TH>Име</TH>
              <TH>Имейл</TH>
              <TH>Роля</TH>
              <TH>Статус</TH>
              <TH align="right" />
            </TR>
          </THead>
          <TBody>
            {users.map((u) => (
              <UserRow
                key={u.id}
                profile={{
                  id: u.id,
                  email: u.email,
                  fullName: u.fullName,
                  role: u.role,
                  active: u.active,
                }}
                isSelf={u.id === me.id}
              />
            ))}
          </TBody>
        </Table>
      </section>
    </div>
  );
}
