import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TBody, THead, TH, TR, TD, TableEmpty } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import {
  LEAD_SOURCE_LABELS,
  LEAD_SOURCE_TONES,
} from "@/lib/leads/constants";
import { prisma } from "@/lib/prisma";
import { restoreLead } from "./actions";

export const dynamic = "force-dynamic";

export default async function LeadsTrashPage() {
  await requireRole("admin");

  const rows = await prisma.lead.findMany({
    where: { deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
    include: {
      contact: { select: { fullName: true } },
      deletedBy: { select: { fullName: true } },
    },
    take: 200,
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="space-y-1">
        <Link
          href="/leads"
          className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors duration-120"
        >
          ← Обратно към лийдовете
        </Link>
        <h1 className="text-xl text-neutral-900">Изтрити лийдове</h1>
        <p className="text-base text-neutral-600">
          {rows.length === 0
            ? "Нищо не е изтрито."
            : `${rows.length} изтрит${rows.length === 1 ? "" : "и"} лийд${rows.length === 1 ? "" : "а"}. Възстановяването е без изтичащ срок.`}
        </p>
      </div>

      <Table>
        <THead>
          <TR hover={false}>
            <TH>Клиент</TH>
            <TH>Източник</TH>
            <TH>Изтрит</TH>
            <TH>Изтрил</TH>
            <TH>Причина</TH>
            <TH align="right" />
          </TR>
        </THead>
        <TBody>
          {rows.length === 0 && (
            <TableEmpty colSpan={6}>
              Няма изтрити лийдове.
            </TableEmpty>
          )}
          {rows.map((l) => (
            <TR key={l.id}>
              <TD>{l.contact.fullName}</TD>
              <TD>
                <StatusBadge tone={LEAD_SOURCE_TONES[l.source]}>
                  {LEAD_SOURCE_LABELS[l.source]}
                </StatusBadge>
              </TD>
              <TD muted numeric>
                {l.deletedAt ? formatDateTime(l.deletedAt) : "—"}
              </TD>
              <TD muted>
                {l.deletedBy?.fullName ?? (
                  <span className="text-neutral-400">Система</span>
                )}
              </TD>
              <TD muted className="text-sm max-w-xs truncate">
                {l.deleteReason ?? <span className="text-neutral-400">—</span>}
              </TD>
              <TD align="right">
                <form action={restoreLead}>
                  <input type="hidden" name="leadId" value={l.id} />
                  <Button type="submit" size="sm">
                    Възстанови
                  </Button>
                </form>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
