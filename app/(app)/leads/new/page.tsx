import Link from "next/link";
import { LeadForm } from "@/app/(app)/leads/lead-form";
import { requireProfile } from "@/lib/auth/session";
import type { ContactSuggestion } from "@/lib/contacts/search";
import { prisma } from "@/lib/prisma";
import { createLead } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = { contactId?: string };

export default async function NewLeadPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const me = await requireProfile();
  const { contactId } = await searchParams;

  const [owners, contactPrefill] = await Promise.all([
    prisma.profile.findMany({
      where: { active: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
    contactId && /^[0-9a-f-]{36}$/i.test(contactId)
      ? prisma.contact.findUnique({
          where: { id: contactId },
          select: { id: true, fullName: true, phone: true, email: true },
        })
      : Promise.resolve(null),
  ]);

  const prefillContact: ContactSuggestion | undefined = contactPrefill ?? undefined;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-1">
        <Link
          href="/leads"
          className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors duration-120"
        >
          ← Обратно
        </Link>
        <h1 className="text-xl text-neutral-900">Нов лийд</h1>
        <p className="text-base text-neutral-600">
          Изберете контакт и попълнете основното. Източник по подразбиране е „Ръчен“.
        </p>
      </div>
      <LeadForm
        action={createLead}
        submitLabel="Създай лийд"
        pendingLabel="Създаване…"
        owners={owners}
        defaultOwnerId={me.id}
        prefillContact={prefillContact}
      />
    </div>
  );
}
