import { PageHelp } from "@/components/ui/page-help";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TBody, THead, TH, TR, TD, TableEmpty } from "@/components/ui/table";
import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  admin: "Администратор",
  manager: "Мениджър",
  user: "Потребител",
};

const ROLE_TONE: Record<string, "accent" | "info" | "neutral"> = {
  admin: "accent",
  manager: "info",
  user: "neutral",
};

export default async function TeamPage() {
  await requireProfile();

  const members = await prisma.profile.findMany({
    where: { active: true },
    orderBy: [{ role: "asc" }, { fullName: "asc" }],
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl text-neutral-900">Екип</h1>
          <PageHelp
            content={
              <p>
                Активни членове на vminvest и техните роли. Администраторите
                имат пълен достъп; мениджърите одобряват отсъствия и виждат
                повече от потребителите. За управление на потребителите
                (покани, права, деактивиране) — админ менюто горе вдясно,
                секция Потребители.
              </p>
            }
          />
        </div>
        <p className="text-base text-neutral-600">
          Активни членове на vminvest. {members.length}{" "}
          {members.length === 1 ? "човек" : "души"}.
        </p>
      </div>

      <Table>
        <THead>
          <TR hover={false}>
            <TH>Име</TH>
            <TH>Имейл</TH>
            <TH>Роля</TH>
          </TR>
        </THead>
        <TBody>
          {members.length === 0 && (
            <TableEmpty colSpan={3}>Все още няма активни членове.</TableEmpty>
          )}
          {members.map((m) => (
            <TR key={m.id}>
              <TD>{m.fullName}</TD>
              <TD muted>
                <a
                  href={`mailto:${m.email}`}
                  className="hover:text-neutral-900 transition-colors duration-120"
                >
                  {m.email}
                </a>
              </TD>
              <TD>
                <StatusBadge tone={ROLE_TONE[m.role]}>{ROLE_LABEL[m.role]}</StatusBadge>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
