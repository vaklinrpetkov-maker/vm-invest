import Link from "next/link";
import { ContactForm } from "@/app/(app)/contacts/contact-form";
import { CONTACT_TYPES } from "@/lib/contacts/constants";
import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createContact } from "./actions";

export const dynamic = "force-dynamic";

export default async function NewContactPage() {
  await requireProfile();

  const owners = await prisma.profile.findMany({
    where: { active: true },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true },
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-1">
        <Link
          href="/contacts"
          className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors duration-120"
        >
          ← Обратно
        </Link>
        <h1 className="text-xl text-neutral-900">Нов контакт</h1>
        <p className="text-base text-neutral-600">
          Попълнете поне име и тип. Останалите полета са незадължителни.
        </p>
      </div>
      <ContactForm
        action={createContact}
        submitLabel="Създай контакт"
        pendingLabel="Създаване…"
        types={CONTACT_TYPES}
        owners={owners}
      />
    </div>
  );
}
