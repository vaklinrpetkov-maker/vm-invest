import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { countUnreadMentions } from "@/lib/activity-feed/inbox";
import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { UserMenu } from "./user-menu";

// Canonical short tooltips for top-nav items. Per `_foundations/bg-copy.md`
// these are one-sentence descriptions targeted at first-time / non-technical
// users. Keep under ~80 chars so the tooltip stays compact.
const NAV_TOOLTIPS = {
  contacts: "Всички контакти на фирмата — клиенти, партньори, доставчици.",
  properties: "Каталог на всички имоти на компанията — апартаменти, паркоместа, складове.",
  contracts: "Подписаните договори и техните вноски.",
  leads: "Заявки от потенциални клиенти, готови за работа.",
  leadsInbox: "Лийдове, чакащи първоначален отговор.",
  meetings: "Планираните и проведените срещи с клиенти.",
  tasks: "Лични и екипни задачи — твоите и на цялата компания.",
  renovations: "Проекти по ремонти на имоти — задачи, графици, отговорници.",
  invoices: "Фактури от доставчици — качване, преглед, статус на плащане.",
  team: "Списък на служителите и техните роли.",
  absence: "Подай или одобри заявки за отпуск и други отсъствия.",
  calendar: "Кой кога е в отпуск — седмичен преглед на цялата компания.",
  mentions: "Бележки, в които колеги ви маркираха с @.",
} as const;

const ROLE_LABEL: Record<"admin" | "manager" | "user", string> = {
  admin: "Администратор",
  manager: "Мениджър",
  user: "Потребител",
};

export default async function AppLayout({ children }: { children: ReactNode }) {
  const profile = await requireProfile();

  // Inbox counts shown as small badges. Run once per navigation; at our
  // scale the queries are trivial. Same pattern for the lead email inbox and
  // tasks — all roles see the counts so the whole team is aware of the work
  // waiting on them.
  //
  // `myTasksDueToday` includes overdue: the actionable signal is "stuff
  // owned by me, still open, with a due date that's already passed or hits
  // today" — a single badge captures both alerts without splitting them.
  const now = new Date();
  const todayUtcMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const [pendingAbsenceInbox, openLeadsInbox, myTasksDueToday, unreadMentions] = await Promise.all([
    prisma.absenceRequest.count({
      where: { status: "pending", currentApproverId: profile.id },
    }),
    prisma.lead.count({
      where: {
        deletedAt: null,
        source: { in: ["email_form", "email_unparsed"] },
        timerStoppedAt: null,
      },
    }),
    prisma.task.count({
      where: {
        ownerId: profile.id,
        status: { in: ["todo", "in_progress"] },
        dueDate: { lte: todayUtcMidnight },
      },
    }),
    countUnreadMentions(profile.id),
  ]);

  return (
    <ToastProvider>
      <div className="min-h-screen flex flex-col">
        <header className="h-12 border-b border-neutral-150 bg-neutral-0 flex items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-base font-medium text-neutral-900">
            vminvest ERP
          </Link>
          <Tooltip content={NAV_TOOLTIPS.contacts}>
            <Link
              href="/contacts"
              className="text-base text-neutral-600 hover:text-neutral-900 transition-colors duration-120"
            >
              Контакти
            </Link>
          </Tooltip>
          <Tooltip content={NAV_TOOLTIPS.properties}>
            <Link
              href="/properties"
              className="text-base text-neutral-600 hover:text-neutral-900 transition-colors duration-120"
            >
              Имоти
            </Link>
          </Tooltip>
          <Tooltip content={NAV_TOOLTIPS.contracts}>
            <Link
              href={"/contracts" as Route}
              className="text-base text-neutral-600 hover:text-neutral-900 transition-colors duration-120"
            >
              Договори
            </Link>
          </Tooltip>
          <Tooltip content={NAV_TOOLTIPS.leads}>
            <Link
              href="/leads"
              className="text-base text-neutral-600 hover:text-neutral-900 transition-colors duration-120"
            >
              Лийдове
            </Link>
          </Tooltip>
          {openLeadsInbox > 0 && (
            <Tooltip content={NAV_TOOLTIPS.leadsInbox}>
              <Link
                href="/leads/inbox"
                className="flex items-center gap-1.5 text-base text-neutral-600 hover:text-neutral-900 transition-colors duration-120"
              >
                Входяща
                <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-accent-500 text-neutral-0 text-xs font-medium tabular-nums">
                  {openLeadsInbox}
                </span>
              </Link>
            </Tooltip>
          )}
          <Tooltip content={NAV_TOOLTIPS.meetings}>
            <Link
              href="/meetings"
              className="text-base text-neutral-600 hover:text-neutral-900 transition-colors duration-120"
            >
              Срещи
            </Link>
          </Tooltip>
          <Tooltip content={NAV_TOOLTIPS.renovations}>
            <Link
              href={"/renovations" as Route}
              className="text-base text-neutral-600 hover:text-neutral-900 transition-colors duration-120"
            >
              Ремонти
            </Link>
          </Tooltip>
          {(profile.role === "admin" || profile.role === "manager") && (
            <Tooltip content={NAV_TOOLTIPS.invoices}>
              <Link
                href="/invoices"
                className="text-base text-neutral-600 hover:text-neutral-900 transition-colors duration-120"
              >
                Фактури
              </Link>
            </Tooltip>
          )}
          <Tooltip content={NAV_TOOLTIPS.tasks}>
            <Link
              href="/tasks"
              className="flex items-center gap-1.5 text-base text-neutral-600 hover:text-neutral-900 transition-colors duration-120"
            >
              Задачи
              {myTasksDueToday > 0 && (
                <span
                  className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-accent-500 text-neutral-0 text-xs font-medium tabular-nums"
                  aria-label={`${myTasksDueToday} ${myTasksDueToday === 1 ? "задача за днес" : "задачи за днес"} (или просрочени)`}
                >
                  {myTasksDueToday}
                </span>
              )}
            </Link>
          </Tooltip>
          <Tooltip content={NAV_TOOLTIPS.team}>
            <Link
              href="/team"
              className="text-base text-neutral-600 hover:text-neutral-900 transition-colors duration-120"
            >
              Екип
            </Link>
          </Tooltip>
          <Tooltip content={NAV_TOOLTIPS.absence}>
            <Link
              href="/absence"
              className="text-base text-neutral-600 hover:text-neutral-900 transition-colors duration-120"
            >
              Отсъствия
            </Link>
          </Tooltip>
          <Tooltip content={NAV_TOOLTIPS.calendar}>
            <Link
              href="/absence/calendar"
              className="text-base text-neutral-600 hover:text-neutral-900 transition-colors duration-120"
            >
              Календар
            </Link>
          </Tooltip>
          {unreadMentions > 0 && (
            <Tooltip content={NAV_TOOLTIPS.mentions}>
              <Link
                href={"/mentions" as Route}
                className="flex items-center gap-1.5 text-base text-neutral-600 hover:text-neutral-900 transition-colors duration-120"
              >
                Споменавания
                <span
                  className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-accent-500 text-neutral-0 text-xs font-medium tabular-nums"
                  aria-label={`${unreadMentions} ${unreadMentions === 1 ? "ново споменаване" : "нови споменавания"}`}
                >
                  {unreadMentions}
                </span>
              </Link>
            </Tooltip>
          )}
        </div>
        <UserMenu
          fullName={profile.fullName}
          roleLabel={ROLE_LABEL[profile.role]}
          role={profile.role}
          pendingAbsenceInbox={pendingAbsenceInbox}
        />
      </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </ToastProvider>
  );
}
