import Link from "next/link";
import { MeetingForm } from "@/app/(app)/meetings/meeting-form";
import { requireProfile } from "@/lib/auth/session";
import type { LeadSuggestion } from "@/lib/leads/search";
import { prisma } from "@/lib/prisma";
import { createMeeting } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = { date?: string; hour?: string; leadId?: string };

function sanitizeDate(v: string | undefined): string | undefined {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  return v;
}

function sanitizeHour(v: string | undefined): string | undefined {
  if (!v || !/^\d{1,2}$/.test(v)) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 23) return undefined;
  return String(n).padStart(2, "0");
}

export default async function NewMeetingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const me = await requireProfile();
  const { date, hour, leadId } = await searchParams;

  const [profiles, leadPrefill] = await Promise.all([
    prisma.profile.findMany({
      where: { active: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
    // Only pre-fill the lead if it's a valid, open (not deleted, not converted)
    // lead. Otherwise the picker would silently drop it and confuse the user.
    leadId && /^[0-9a-f-]{36}$/i.test(leadId)
      ? prisma.lead.findFirst({
          where: { id: leadId, deletedAt: null, status: { not: "converted" } },
          select: {
            id: true,
            status: true,
            properties: true,
            contact: { select: { fullName: true } },
          },
        })
      : Promise.resolve(null),
  ]);

  const lead: LeadSuggestion | undefined = leadPrefill
    ? {
        id: leadPrefill.id,
        contactName: leadPrefill.contact.fullName,
        status: leadPrefill.status,
        firstProperty: leadPrefill.properties[0] ?? null,
      }
    : undefined;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-1">
        <Link
          href="/meetings"
          className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors duration-120"
        >
          ← Обратно
        </Link>
        <h1 className="text-xl text-neutral-900">Нова среща</h1>
        <p className="text-base text-neutral-600">
          Изберете лийд, дата и участници. Създателят автоматично се добавя към участниците.
        </p>
      </div>
      <MeetingForm
        action={createMeeting}
        submitLabel="Създай среща"
        pendingLabel="Създаване…"
        profiles={profiles}
        defaultAssigneeId={me.id}
        prefill={{ date: sanitizeDate(date), hour: sanitizeHour(hour), lead }}
      />
    </div>
  );
}
