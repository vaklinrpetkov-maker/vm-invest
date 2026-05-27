import Link from "next/link";
import { Table, TBody, THead, TH, TR, TableEmpty } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { formatDate, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { AnomalyRow } from "./anomaly-row";

export const dynamic = "force-dynamic";

const RULE_LABEL: Record<string, string> = {
  late_submission: "Късно подаване",
  oversize_request: "Голяма заявка",
  pace_ahead: "Изпреварващ темп",
  team_overlap: "Застъпване в екипа",
};

type SearchParams = { filter?: "open" | "all" };

export default async function AnomaliesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole("admin");
  const { filter } = await searchParams;
  const showAll = filter === "all";

  const flags = await prisma.anomalyFlag.findMany({
    where: showAll ? {} : { resolvedAt: null },
    orderBy: { detectedAt: "desc" },
    take: 100,
    include: {
      request: {
        select: {
          startDate: true,
          endDate: true,
          employee: { select: { fullName: true } },
          category: { select: { labelBg: true } },
        },
      },
    },
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl text-neutral-900">Аномалии</h1>
          <p className="text-base text-neutral-600">
            Флагове върху одобрени и подадени заявки. Разрешете, щом ги прегледате.
          </p>
        </div>
        <nav className="flex items-center gap-2 text-sm">
          <Link
            href="/admin/absence/anomalies"
            className={`h-8 px-3 inline-flex items-center rounded-lg transition-colors duration-120 ${
              !showAll
                ? "bg-neutral-900 text-neutral-0"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-150"
            }`}
          >
            Отворени
          </Link>
          <Link
            href={{ pathname: "/admin/absence/anomalies", query: { filter: "all" } }}
            className={`h-8 px-3 inline-flex items-center rounded-lg transition-colors duration-120 ${
              showAll
                ? "bg-neutral-900 text-neutral-0"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-150"
            }`}
          >
            Всички
          </Link>
        </nav>
      </div>

      <Table>
        <THead>
          <TR hover={false}>
            <TH>Засечено</TH>
            <TH>Правило</TH>
            <TH>Сериозност</TH>
            <TH>Служител</TH>
            <TH>Заявка</TH>
            <TH align="right" />
          </TR>
        </THead>
        <TBody>
          {flags.length === 0 && (
            <TableEmpty colSpan={6}>
              {showAll ? "Няма записани аномалии." : "Няма отворени аномалии."}
            </TableEmpty>
          )}
          {flags.map((f) =>
            f.resolvedAt ? (
              <TR key={f.id} className="opacity-60">
                <td className="px-3 py-2.5 text-sm text-neutral-600 font-mono text-right tabular-nums">
                  {formatDateTime(f.detectedAt)}
                </td>
                <td className="px-3 py-2.5 text-neutral-900">
                  {RULE_LABEL[f.rule] ?? f.rule}
                </td>
                <td className="px-3 py-2.5 text-sm text-neutral-500" colSpan={3}>
                  Разрешено{" "}
                  {f.resolvedAt ? `на ${formatDateTime(f.resolvedAt)}` : ""}
                  {f.resolveNote ? ` · ${f.resolveNote}` : ""}
                </td>
                <td className="px-3 py-2.5 text-right text-sm text-neutral-500">✓</td>
              </TR>
            ) : (
              <AnomalyRow
                key={f.id}
                flag={{
                  id: f.id,
                  ruleLabel: RULE_LABEL[f.rule] ?? f.rule,
                  severity: f.severity,
                  detectedAt: formatDateTime(f.detectedAt),
                  employeeName: f.request.employee.fullName,
                  categoryLabel: f.request.category.labelBg,
                  startDate: formatDate(f.request.startDate),
                  endDate: formatDate(f.request.endDate),
                }}
              />
            ),
          )}
        </TBody>
      </Table>
    </div>
  );
}
