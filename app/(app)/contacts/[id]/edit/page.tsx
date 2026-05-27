import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ContactForm } from "@/app/(app)/contacts/contact-form";
import { CONTACT_TYPES } from "@/lib/contacts/constants";
import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { updateContact } from "../actions";

export const dynamic = "force-dynamic";

function toIsoDate(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export default async function EditContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireProfile();
  const { id } = await params;

  const [contact, owners] = await Promise.all([
    prisma.contact.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        type: true,
        phone: true,
        email: true,
        birthDate: true,
        egn: true,
        address: true,
        notes: true,
        ownerId: true,
      },
    }),
    prisma.profile.findMany({
      where: { active: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
  ]);

  if (!contact) notFound();

  const boundUpdate = updateContact.bind(null, contact.id);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-1">
        <Link
          href={`/contacts/${contact.id}` as Route}
          className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors duration-120"
        >
          ← Обратно към контакта
        </Link>
        <h1 className="text-xl text-neutral-900">Редакция на контакт</h1>
      </div>
      <ContactForm
        action={boundUpdate}
        initial={{
          fullName: contact.fullName,
          type: contact.type,
          phone: contact.phone ?? "",
          email: contact.email ?? "",
          birthDate: toIsoDate(contact.birthDate),
          egn: contact.egn ?? "",
          address: contact.address ?? "",
          notes: contact.notes ?? "",
          ownerId: contact.ownerId ?? "",
        }}
        submitLabel="Запази промените"
        pendingLabel="Запис…"
        types={CONTACT_TYPES}
        owners={owners}
        excludeId={contact.id}
      />
    </div>
  );
}
