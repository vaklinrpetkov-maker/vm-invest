import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { LeadForm } from "@/app/(app)/leads/lead-form";
import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { updateLead } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditLeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireProfile();
  const { id } = await params;

  const [lead, owners] = await Promise.all([
    prisma.lead.findUnique({
      where: { id },
      include: {
        contact: {
          select: { id: true, fullName: true, phone: true, email: true },
        },
      },
    }),
    prisma.profile.findMany({
      where: { active: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
  ]);

  if (!lead || lead.deletedAt) notFound();

  const canEdit =
    me.role === "admin" || me.role === "manager" || lead.ownerId === me.id;

  if (!canEdit || lead.status === "converted") {
    // Fall back to profile view with a friendly hint — the profile page hides
    // the Edit button in these cases, so a direct URL visit lands here.
    notFound();
  }

  const boundUpdate = updateLead.bind(null, lead.id);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-1">
        <Link
          href={`/leads/${lead.id}` as Route}
          className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors duration-120"
        >
          ← Обратно към лийда
        </Link>
        <h1 className="text-xl text-neutral-900">Редакция на лийд</h1>
      </div>
      <LeadForm
        action={boundUpdate}
        submitLabel="Запази промените"
        pendingLabel="Запис…"
        owners={owners}
        initial={{
          contact: lead.contact,
          source: lead.source,
          status: lead.status,
          ownerId: lead.ownerId,
          properties: lead.properties,
          message: lead.message ?? "",
        }}
        fixContact
      />
    </div>
  );
}
