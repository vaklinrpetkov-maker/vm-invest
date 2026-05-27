import Link from "next/link";
import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { SubmitForm } from "./submit-form";

export const dynamic = "force-dynamic";

export default async function SubmitAbsencePage() {
  await requireProfile();

  const categories = await prisma.absenceCategory.findMany({
    orderBy: { code: "asc" },
    select: { code: true, labelBg: true, allowsHalfDay: true, requiresDocument: true },
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="space-y-1">
        <Link
          href="/absence"
          className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors duration-120"
        >
          ← Обратно
        </Link>
        <h1 className="text-xl text-neutral-900">Нова заявка за отсъствие</h1>
        <p className="text-base text-neutral-600">
          Изберете тип и период. Работните дни се изчисляват автоматично.
        </p>
      </div>
      <SubmitForm categories={categories} />
    </div>
  );
}
