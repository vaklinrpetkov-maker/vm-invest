import Link from "next/link";
import type { Route } from "next";
import { PageHelp } from "@/components/ui/page-help";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TBody, THead, TH, TR, TD, TableEmpty } from "@/components/ui/table";
import { requireProfile } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import {
  LEAD_SOURCE_LABELS,
  LEAD_SOURCE_TONES,
} from "@/lib/leads/constants";
import {
  elapsedTone,
  formatElapsed,
  notifyEscalated,
  runEscalationScan,
} from "@/lib/leads/timer";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Shared inbox per specs/leads.md §5.2. Shows email leads (form + unparsed)
// that haven't been claimed/stopped, sorted oldest-first so the most
// time-critical ones land at the top. Opportunistic escalation scan runs on
// every render — cheap at our scale; promote to pg_cron if it bites.

export default async function LeadsInboxPage() {
  await requireProfile();

  // Opportunistic escalation: whoever hits the inbox first flags + notifies.
  // The cron endpoint is the backstop for periods when nobody's looking.
  const newlyEscalated = await runEscalationScan();
  if (newlyEscalated.length > 0) {
    // Fire-and-forget; emails are best-effort and mustn't block the render.
    void notifyEscalated(newlyEscalated).catch((err) =>
      console.error("[leads.inbox] notifyEscalated failed", err),
    );
  }

  const rows = await prisma.lead.findMany({
    where: {
      deletedAt: null,
      source: { in: ["email_form", "email_unparsed"] },
      timerStoppedAt: null,
    },
    orderBy: { timerStartedAt: "asc" },
    include: {
      contact: { select: { fullName: true } },
      owner: { select: { fullName: true } },
    },
    take: 200,
  });

  const now = Date.now();
  const openCount = rows.length;
  const escalatedCount = rows.filter((r) => r.timerEscalatedAt !== null).length;

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl text-neutral-900">Входяща кутия</h1>
          <PageHelp
            content={
              <p>
                Лийдове чакащи първоначален отговор. Таймерът отброява от
                момента на постъпване — целта е под 24 часа. След като се
                свържеш с клиента, отвори лийда и натисни бутона за спиране на таймера. Ако
                лийд изтече над 24ч без отговор, се маркира с червен индикатор
                и се известяват мениджърите.
              </p>
            }
          />
        </div>
        <p className="text-base text-neutral-600">
          {openCount === 0
            ? "Няма чакащи лийдове."
            : `${openCount} лийд${openCount === 1 ? "" : "а"} чакат отговор.`}
          {escalatedCount > 0 && (
            <span className="ml-2 text-danger-700">
              · {escalatedCount} с изтекъл SLA (&gt;24ч)
            </span>
          )}
        </p>
      </div>

      <Table>
        <THead>
          <TR hover={false}>
            <TH>Таймер</TH>
            <TH>Клиент</TH>
            <TH>Получен</TH>
            <TH>Имоти</TH>
            <TH>Източник</TH>
            <TH>Отговорник</TH>
            <TH align="right" />
          </TR>
        </THead>
        <TBody>
          {rows.length === 0 && (
            <TableEmpty colSpan={7}>Всичко чисто — няма чакащи лийдове.</TableEmpty>
          )}
          {rows.map((l) => {
            const started = l.timerStartedAt ?? l.createdAt;
            const elapsed = now - started.getTime();
            const tone = elapsedTone(elapsed);
            const toneClass =
              tone === "danger"
                ? "bg-danger-50 text-danger-700"
                : tone === "warning"
                  ? "bg-warning-50 text-warning-800"
                  : "bg-success-50 text-success-700";
            return (
              <TR key={l.id}>
                <TD>
                  <span
                    className={cn(
                      "inline-block px-2 py-0.5 rounded-sm text-xs font-medium tabular-nums font-mono",
                      toneClass,
                    )}
                  >
                    {formatElapsed(elapsed)}
                  </span>
                </TD>
                <TD>
                  <Link
                    href={`/leads/${l.id}` as Route}
                    className="text-neutral-900 hover:text-accent-700 transition-colors duration-120"
                  >
                    {l.contact.fullName}
                  </Link>
                </TD>
                <TD muted numeric>
                  {l.emailReceivedAt ? formatDateTime(l.emailReceivedAt) : "—"}
                </TD>
                <TD muted className="text-sm">
                  {l.properties.length === 0 ? (
                    <span className="text-neutral-400">—</span>
                  ) : l.properties.length === 1 ? (
                    l.properties[0]
                  ) : (
                    <>
                      {l.properties[0]}
                      <span className="text-neutral-400 ml-1">
                        +{l.properties.length - 1}
                      </span>
                    </>
                  )}
                </TD>
                <TD>
                  <StatusBadge tone={LEAD_SOURCE_TONES[l.source]}>
                    {LEAD_SOURCE_LABELS[l.source]}
                  </StatusBadge>
                </TD>
                <TD muted className="text-sm">
                  {l.owner?.fullName ?? (
                    <span className="text-neutral-400">Неразпределен</span>
                  )}
                </TD>
                <TD align="right">
                  <Link
                    href={`/leads/${l.id}` as Route}
                    className="text-sm text-accent-700 hover:text-accent-800 transition-colors duration-120"
                  >
                    Отвори →
                  </Link>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
