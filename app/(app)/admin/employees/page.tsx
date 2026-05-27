import { Table, TBody, THead, TH, TR, TableEmpty } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { EmployeeRow } from "./employee-row";

export const dynamic = "force-dynamic";

export default async function AdminEmployeesPage() {
  await requireRole("admin");

  const employees = await prisma.profile.findMany({
    where: { active: true },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      email: true,
      managerId: true,
      annualDays: true,
      carryoverDays: true,
      hireDate: true,
    },
  });

  const candidates = employees.map((e) => ({ id: e.id, fullName: e.fullName }));

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl text-neutral-900">Служители — HR данни</h1>
        <p className="text-base text-neutral-600">
          Задайте мениджър (за одобрение на отсъствия), годишни дни и дата на постъпване. Промените се записват в журнала.
        </p>
      </div>

      <Table>
        <THead>
          <TR hover={false}>
            <TH>Служител</TH>
            <TH>Мениджър</TH>
            <TH>Годишни дни</TH>
            <TH>Пренесени</TH>
            <TH>Постъпил</TH>
            <TH align="right" />
          </TR>
        </THead>
        <TBody>
          {employees.length === 0 && (
            <TableEmpty colSpan={6}>Няма активни служители.</TableEmpty>
          )}
          {employees.map((e) => (
            <EmployeeRow
              key={e.id}
              employee={{
                id: e.id,
                fullName: e.fullName,
                email: e.email,
                managerId: e.managerId,
                annualDays: e.annualDays.toString(),
                carryoverDays: e.carryoverDays.toString(),
                hireDate: e.hireDate?.toISOString() ?? null,
              }}
              candidates={candidates.filter((c) => c.id !== e.id)}
            />
          ))}
        </TBody>
      </Table>
    </div>
  );
}
