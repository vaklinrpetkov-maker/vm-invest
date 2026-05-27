import { StatusBadge } from "@/components/ui/status-badge";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { AUDIT_LABELS } from "@/lib/auth/audit-labels";
import type { AuditAction } from "@/lib/auth/audit";
import { requireRole } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

function formatPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const entries = Object.entries(payload as Record<string, unknown>);
  if (!entries.length) return null;
  return entries.map(([k, v]) => `${k}: ${formatValue(v)}`).join("  ·  ");
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "да" : "не";
  if (typeof v === "number") return String(v);
  return JSON.stringify(v);
}

export default async function AuditLogPage() {
  await requireRole("admin");

  const events = await prisma.auditEvent.findMany({
    orderBy: { at: "desc" },
    take: PAGE_SIZE,
    include: { actor: { select: { fullName: true, email: true } } },
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-xl text-neutral-900">Журнал на действията</h1>
        <p className="text-base text-neutral-600">
          Последни {events.length} събития. Всички действия по сигурността и потребителите се записват тук.
        </p>
      </div>

      <Table>
        <THead>
          <TR hover={false}>
            <TH className="w-44">Кога</TH>
            <TH className="w-56">Извършил</TH>
            <TH className="w-52">Действие</TH>
            <TH>Подробности</TH>
            <TH align="right" className="w-32">IP</TH>
          </TR>
        </THead>
        <TBody>
          {events.length === 0 && <TableEmpty colSpan={5}>Все още няма записани събития.</TableEmpty>}
          {events.map((e) => {
            const label = AUDIT_LABELS[e.action as AuditAction];
            const payloadStr = formatPayload(e.payload);
            return (
              <TR key={String(e.id)}>
                <TD numeric muted className="font-mono">
                  {formatDateTime(e.at)}
                </TD>
                <TD>
                  {e.actor ? (
                    <span>
                      <span className="text-neutral-900">{e.actor.fullName}</span>
                      <span className="text-neutral-500 ml-2 text-sm">{e.actor.email}</span>
                    </span>
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </TD>
                <TD>
                  {label ? (
                    <StatusBadge tone={label.tone}>{label.label}</StatusBadge>
                  ) : (
                    <span className="font-mono text-sm text-neutral-600">{e.action}</span>
                  )}
                </TD>
                <TD muted className="text-sm">
                  {payloadStr ?? <span className="text-neutral-400">—</span>}
                </TD>
                <TD numeric muted className="font-mono text-sm">
                  {e.ip ?? "—"}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
