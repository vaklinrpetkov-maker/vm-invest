import { PageHelp } from "@/components/ui/page-help";
import { Table, TBody, THead, TH, TR, TableEmpty } from "@/components/ui/table";
import { requireProfile } from "@/lib/auth/session";
import { formatDate, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { InboxRow } from "./inbox-row";

export const dynamic = "force-dynamic";

export default async function AbsenceInboxPage() {
  const me = await requireProfile();

  const pending = await prisma.absenceRequest.findMany({
    where: {
      status: { in: ["pending", "cancel_pending"] },
      currentApproverId: me.id,
    },
    orderBy: { submittedAt: "asc" },
    include: {
      employee: { select: { fullName: true } },
      category: { select: { labelBg: true } },
    },
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl text-neutral-900">Пощенска кутия</h1>
          <PageHelp
            content={
              <p>
                Заявки за отсъствие, очакващи твоето решение като одобряващ.
                Кликни на ред, за да прегледаш детайла, и натисни бутона
                за одобряване или отхвърляне там. Отхвърлянето изисква кратка
                причина — служителят я вижда. Заявките са подредени най-старите отгоре.
              </p>
            }
          />
        </div>
        <p className="text-base text-neutral-600">
          Заявки, очакващи вашето решение. {pending.length === 0 ? "Няма нови заявки." : null}
        </p>
      </div>

      <Table>
        <THead>
          <TR hover={false}>
            <TH>Служител</TH>
            <TH>Тип</TH>
            <TH>От</TH>
            <TH>До</TH>
            <TH align="right">Дни</TH>
            <TH>Флагове</TH>
            <TH align="right" />
          </TR>
        </THead>
        <TBody>
          {pending.length === 0 && <TableEmpty colSpan={7}>Няма чакащи заявки.</TableEmpty>}
          {pending.map((r) => (
            <InboxRow
              key={r.id}
              request={{
                id: r.id,
                employeeName: r.employee.fullName,
                categoryLabel: r.category.labelBg,
                startDate: formatDate(r.startDate),
                endDate: formatDate(r.endDate),
                workingDays: r.workingDaysCount.toString(),
                notes: r.notes,
                submittedAt: formatDateTime(r.submittedAt),
                lateSubmission: r.lateSubmission,
                oversizeFlag: r.oversizeFlag,
                isCancelPending: r.status === "cancel_pending",
              }}
            />
          ))}
        </TBody>
      </Table>
    </div>
  );
}
