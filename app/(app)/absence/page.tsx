import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHelp } from "@/components/ui/page-help";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TBody, THead, TH, TR, TD, TableEmpty } from "@/components/ui/table";
import { getBalance } from "@/lib/absence/balances";
import { requireProfile } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { CancelButton } from "./cancel-button";

export const dynamic = "force-dynamic";

const STATUS_LABEL = {
  pending: "Чака одобрение",
  approved: "Одобрена",
  rejected: "Отхвърлена",
  cancelled: "Отказана",
  cancel_pending: "Искане за отказ",
} as const;

const STATUS_TONE = {
  pending: "info",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
  cancel_pending: "warning",
} as const;

function DayFigure({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-neutral-500">{label}</span>
      <span className="text-2xl text-neutral-900 tabular-nums font-mono">{value}</span>
      {helper && <span className="text-xs text-neutral-500">{helper}</span>}
    </div>
  );
}

export default async function AbsencePage() {
  const me = await requireProfile();
  const now = new Date();
  const year = now.getUTCFullYear();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const [balance, requests] = await Promise.all([
    getBalance(me.id, year),
    prisma.absenceRequest.findMany({
      where: { employeeId: me.id },
      orderBy: { startDate: "desc" },
      take: 50,
      include: { category: { select: { labelBg: true } } },
    }),
  ]);

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl text-neutral-900">Моите отсъствия</h1>
            <PageHelp
              content={
                <p>
                  Твоят баланс и история на отсъствията за годината. Секцията
                  Платен отпуск показва общия лимит (годишен + пренесен),
                  използваните и оставащите дни. За нова заявка — натисни
                  бутона горе вдясно, избери категория и период. Изборът на
                  дати автоматично пресмята работните дни без уикенди и празници.
                </p>
              }
            />
          </div>
          <p className="text-base text-neutral-600">Баланс и история за {year} г.</p>
        </div>
        <Link href="/absence/submit">
          <Button>Нова заявка</Button>
        </Link>
      </div>

      <section className="bg-neutral-0 rounded-lg p-6 space-y-4">
        <h2 className="text-md font-medium text-neutral-900">Платен отпуск</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <DayFigure
            label="Общо за годината"
            value={String(balance.annualDays + balance.carryoverDays)}
            helper={
              balance.carryoverDays > 0
                ? `${balance.annualDays} + ${balance.carryoverDays} пренесени`
                : undefined
            }
          />
          <DayFigure label="Използвани" value={String(balance.paidTaken)} />
          <DayFigure label="Планирани" value={String(balance.paidScheduled)} />
          <DayFigure label="Оставащи" value={String(balance.paidRemaining)} />
        </div>
        <div className="pt-2 flex gap-8 text-sm text-neutral-600">
          <span>Болнични (YTD): <span className="text-neutral-900 tabular-nums">{balance.sickYTD}</span></span>
          <span>Неплатени (YTD): <span className="text-neutral-900 tabular-nums">{balance.unpaidYTD}</span></span>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-md font-medium text-neutral-900">История</h2>
        <Table>
          <THead>
            <TR hover={false}>
              <TH>Тип</TH>
              <TH>От</TH>
              <TH>До</TH>
              <TH align="right">Дни</TH>
              <TH>Статус</TH>
              <TH>Подадена</TH>
              <TH align="right" />
            </TR>
          </THead>
          <TBody>
            {requests.length === 0 && (
              <TableEmpty colSpan={7}>Все още нямате заявки.</TableEmpty>
            )}
            {requests.map((r) => (
              <TR key={r.id}>
                <TD>{r.category.labelBg}</TD>
                <TD numeric muted>{formatDate(r.startDate)}</TD>
                <TD numeric muted>{formatDate(r.endDate)}</TD>
                <TD numeric>{r.workingDaysCount.toString()}</TD>
                <TD>
                  <StatusBadge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusBadge>
                </TD>
                <TD numeric muted>{formatDate(r.submittedAt)}</TD>
                <TD align="right">
                  {r.status === "pending" && (
                    <CancelButton requestId={r.id} mode="pending" />
                  )}
                  {r.status === "approved" && r.endDate >= todayUtc && (
                    <CancelButton requestId={r.id} mode="approved" />
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </section>
    </div>
  );
}
