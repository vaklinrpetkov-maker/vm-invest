import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ActivityFeed } from "@/components/ui/activity-feed/activity-feed";
import { Button } from "@/components/ui/button";
import {
  type StatusOption,
} from "@/components/ui/inline-status-cell";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { requireProfile } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  APARTMENT_SIZE_LABELS,
  RENOVATION_STATUSES,
  RENOVATION_STATUS_LABELS,
  RENOVATION_STATUS_TONES,
} from "@/lib/renovations/constants";
import { computeCapacity } from "@/lib/renovations/capacity";
import {
  getRenovationById,
  listAvailableTemplatesForRenovation,
} from "@/lib/renovations/queries";
import {
  canDeleteRenovation,
  canEditRenovation,
} from "@/lib/renovations/permissions";
import type { RenovationStatus } from "@prisma/client";
import { deleteRenovation } from "../actions";
import {
  RenovationDatesInline,
  RenovationStatusInline,
} from "./renovation-inline-cells";
import { ActivitiesSection } from "./activities-section";
import type { ActivityRowVm } from "./activities-editor";
import type { ActivityTemplateOption } from "../renovation-form";

export const dynamic = "force-dynamic";

// Derived display title — `Ремонт — <building>/<unit>`. No editable title
// field on the row per spec §3.1 + locked answer 18.
function deriveTitle(r: { property: { name: string; building: { displayName: string } } }): string {
  return `Ремонт — ${r.property.building.displayName} · ${r.property.name}`;
}

// Status dropdown options for the header InlineStatusCell — built once,
// reused per render. Same shape as the list table's options.
const STATUS_OPTIONS: ReadonlyArray<StatusOption<RenovationStatus>> =
  RENOVATION_STATUSES.map((value) => ({
    value,
    label: RENOVATION_STATUS_LABELS[value],
    tone: RENOVATION_STATUS_TONES[value],
  }));

export default async function RenovationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireProfile();
  const { id } = await params;

  const r = await getRenovationById(id);
  if (!r || r.deletedAt !== null) notFound();

  const canEdit = canEditRenovation(me.role, r.managerId, me.id);
  const canDelete = canDeleteRenovation(me.role);

  // Договор link in sidebar (spec §6.5) — when the property has a
  // contractId, surface a link with the contract title. Separate fetch
  // because Property.contractId is a free uuid column (no Prisma relation
  // declared) — schema note at properties model line 476.
  const linkedContract = r.property.contractId
    ? await prisma.contract.findUnique({
        where: { id: r.property.contractId },
        select: { id: true, title: true },
      })
    : null;

  // Templates available for "+ Добави дейност" — non-deleted catalog rows
  // not yet loaded onto this renovation.
  const availableTemplateRows = await listAvailableTemplatesForRenovation(r.id);
  const availableTemplates: ActivityTemplateOption[] = availableTemplateRows.map((t) => ({
    id: t.id,
    name: t.name,
    teamName: t.team?.name ?? null,
    teamSpecialty: t.team?.specialty ?? null,
    peopleRequired: t.peopleRequired,
    bathroomMultiplied: t.bathroomMultiplied,
    durationStudio: Number(t.durationStudio),
    durationTwoRoom: Number(t.durationTwoRoom),
    durationThreeRoom: Number(t.durationThreeRoom),
    durationFourRoom: Number(t.durationFourRoom),
    sortOrder: t.sortOrder,
  }));

  // Capacity overlay (R4) — compute load + overage across the whole
  // portfolio over this renovation's activity window. Skip the query when
  // there are no activities yet.
  const datedActivities = r.activities.filter((a) => a.startDate && a.endDate);
  const capacity =
    datedActivities.length > 0
      ? await (async () => {
          let min = datedActivities[0].startDate!.getTime();
          let max = datedActivities[0].endDate!.getTime();
          for (const a of datedActivities) {
            const s = a.startDate!.getTime();
            const e = a.endDate!.getTime();
            if (s < min) min = s;
            if (e > max) max = e;
          }
          // Pad ±7 days so the window matches the Gantt's visual range.
          const padMs = 7 * 24 * 60 * 60 * 1000;
          const teamIds = Array.from(
            new Set(
              r.activities
                .map((a) => a.teamId)
                .filter((id): id is string => id !== null),
            ),
          );
          return computeCapacity({
            windowStart: new Date(min - padMs),
            windowEnd: new Date(max + padMs),
            requiredTeamIds: teamIds,
          });
        })()
      : null;

  const activityRows: ActivityRowVm[] = r.activities.map((a) => ({
    id: a.id,
    name: a.name,
    teamId: a.teamId,
    teamName: a.team?.name ?? null,
    teamSpecialty: a.team?.specialty ?? null,
    peopleRequired: a.peopleRequired,
    durationDays: Number(a.durationDays),
    startDateIso: a.startDate ? a.startDate.toISOString().slice(0, 10) : null,
    endDateIso: a.endDate ? a.endDate.toISOString().slice(0, 10) : null,
    status: a.status,
    sortOrder: a.sortOrder,
    canEdit,
  }));

  const title = deriveTitle(r);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <Link
          href={"/renovations" as Route}
          className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors duration-120"
        >
          ← Ремонти
        </Link>
      </div>

      <header className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <h1 className="text-2xl text-neutral-900">{title}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <RenovationStatusInline
              renovationId={r.id}
              value={r.status}
              options={STATUS_OPTIONS}
              disabled={!canEdit}
            />
            {r.apartmentSize && (
              <StatusBadge tone="neutral">
                {APARTMENT_SIZE_LABELS[r.apartmentSize]}
              </StatusBadge>
            )}
            {r.bathroomCount !== null && (
              <StatusBadge tone="neutral-outline">
                {r.bathroomCount} {r.bathroomCount === 1 ? "баня" : "бани"}
              </StatusBadge>
            )}
            <Link
              href={`/properties/${r.property.id}` as Route}
              className="text-sm text-neutral-600 hover:text-accent-700 transition-colors duration-120"
            >
              <span className="text-neutral-500">Имот: </span>
              <span className="text-neutral-900">
                {r.property.building.displayName} · {r.property.name}
              </span>
            </Link>
            {r.requestedByContact && (
              <Link
                href={`/contacts/${r.requestedByContact.id}` as Route}
                className="text-sm text-neutral-600 hover:text-accent-700 transition-colors duration-120"
              >
                <span className="text-neutral-500">Заявител: </span>
                <span className="text-neutral-900">{r.requestedByContact.fullName}</span>
              </Link>
            )}
            <span className="text-sm text-neutral-600">
              <span className="text-neutral-500">Отговорник: </span>
              {r.manager ? (
                <span
                  className={cn(
                    "text-neutral-900",
                    r.manager.active === false && "italic text-neutral-500",
                  )}
                  title={r.manager.active === false ? "Този потребител е деактивиран" : undefined}
                >
                  {r.manager.fullName}
                </span>
              ) : (
                <span className="text-neutral-400">— Без отговорник</span>
              )}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Link href={`/renovations/${r.id}/edit` as Route}>
              <Button size="sm">Редактирай</Button>
            </Link>
          )}
          {canDelete && (
            <form action={deleteRenovation}>
              <input type="hidden" name="renovationId" value={r.id} />
              <Button type="submit" variant="ghost" size="sm">
                Изтрий
              </Button>
            </form>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ─── Dates + description (left, 2 cols) ──────────────────────── */}
        <section className="bg-neutral-0 rounded-lg p-6 space-y-4 lg:col-span-2">
          <h2 className="text-md font-medium text-neutral-900">График</h2>
          <RenovationDatesInline
            renovationId={r.id}
            plannedStartDate={r.plannedStartDate}
            plannedEndDate={r.plannedEndDate}
            actualStartDate={r.actualStartDate}
            actualEndDate={r.actualEndDate}
            canEdit={canEdit}
          />

          {r.description && (
            <div className="pt-4 border-t border-neutral-150 space-y-2">
              <h3 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
                Описание
              </h3>
              <p className="text-base text-neutral-800 whitespace-pre-wrap leading-relaxed">
                {r.description}
              </p>
            </div>
          )}
        </section>

        {/* ─── Relations (right, 1 col) ──────────────────────────────── */}
        <section className="bg-neutral-0 rounded-lg p-6 space-y-4">
          <h2 className="text-md font-medium text-neutral-900">Връзки</h2>
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-neutral-500">Имот</div>
              <Link
                href={`/properties/${r.property.id}` as Route}
                className="text-neutral-900 hover:text-accent-700 transition-colors duration-120"
              >
                {r.property.building.displayName} · {r.property.name}
              </Link>
              <div className="text-neutral-500 text-xs mt-0.5">
                {r.property.type} · {r.property.status}
                {r.property.entrance && ` · вх.${r.property.entrance}`}
                {r.property.floor !== null && ` · ет.${r.property.floor}`}
              </div>
            </div>
            <div>
              <div className="text-neutral-500">Заявител</div>
              {r.requestedByContact ? (
                <Link
                  href={`/contacts/${r.requestedByContact.id}` as Route}
                  className="text-neutral-900 hover:text-accent-700 transition-colors duration-120"
                >
                  {r.requestedByContact.fullName}
                </Link>
              ) : (
                <span className="text-neutral-400">
                  — Без заявител (вътрешен ремонт)
                </span>
              )}
            </div>
            {linkedContract && (
              <div>
                <div className="text-neutral-500">Договор</div>
                <Link
                  href={`/contracts/${linkedContract.id}` as Route}
                  className="text-neutral-900 hover:text-accent-700 transition-colors duration-120 truncate block"
                  title={linkedContract.title}
                >
                  {linkedContract.title}
                </Link>
              </div>
            )}
            <div>
              <div className="text-neutral-500">Създаден</div>
              <span className="tabular-nums">{formatDateTime(r.createdAt)}</span>
              {r.createdBy && (
                <span className="text-neutral-500 ml-2 text-xs">
                  от {r.createdBy.fullName}
                </span>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* ─── Activities ──────────────────────────────────────────────── */}
      <ActivitiesSection
        renovationId={r.id}
        activities={activityRows}
        apartmentSize={r.apartmentSize}
        bathroomCount={r.bathroomCount ?? 1}
        plannedStartDate={r.plannedStartDate}
        plannedEndDate={r.plannedEndDate}
        availableTemplates={availableTemplates}
        canEdit={canEdit}
        capacityDangerDays={
          capacity ? Array.from(capacity.overageDays).sort() : []
        }
        teamLoad={
          capacity
            ? Array.from(capacity.capacityByTeam.entries())
                // Only render rows for teams that THIS renovation references.
                .filter(([teamId]) =>
                  r.activities.some((a) => a.teamId === teamId),
                )
                .map(([teamId, totalPeople]) => ({
                  teamId,
                  name: capacity.teamLabel.get(teamId)?.name ?? "—",
                  specialty: capacity.teamLabel.get(teamId)?.specialty ?? null,
                  totalPeople,
                  loadByDay: Object.fromEntries(
                    capacity.loadByTeamDay.get(teamId) ?? new Map(),
                  ),
                }))
            : []
        }
      />

      {/* ─── Status history (vertical timeline) ──────────────────────── */}
      <section className="bg-neutral-0 rounded-lg p-6 space-y-4">
        <h2 className="text-md font-medium text-neutral-900">История на статуса</h2>
        {r.statusHistory.length === 0 ? (
          <p className="text-sm text-neutral-500">Няма промени по статуса.</p>
        ) : (
          <ol className="relative pl-6">
            <div className="absolute left-2 top-2 bottom-2 w-px bg-neutral-200" />
            {r.statusHistory.map((h, idx) => {
              const isCreate = h.fromStatus === null;
              return (
                <li
                  key={h.id}
                  className={cn(
                    "relative pb-5 last:pb-0",
                    idx === r.statusHistory.length - 1 && "pb-0",
                  )}
                >
                  <span
                    className={cn(
                      "absolute -left-[18px] top-1.5 inline-block w-3.5 h-3.5 rounded-full border-2",
                      isCreate
                        ? "bg-neutral-0 border-neutral-300"
                        : idx === 0
                          ? "bg-accent-500 border-accent-500"
                          : "bg-neutral-0 border-neutral-400",
                    )}
                  />
                  <div className="flex items-start gap-3 flex-wrap text-sm">
                    <span className="tabular-nums text-neutral-500 w-32 shrink-0">
                      {formatDateTime(h.createdAt)}
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      {isCreate ? (
                        <>
                          <span className="text-neutral-500">Създаване</span>
                          <span className="text-neutral-400">→</span>
                          <StatusBadge tone={RENOVATION_STATUS_TONES[h.toStatus]}>
                            {RENOVATION_STATUS_LABELS[h.toStatus]}
                          </StatusBadge>
                        </>
                      ) : (
                        <>
                          <StatusBadge tone={RENOVATION_STATUS_TONES[h.fromStatus!]}>
                            {RENOVATION_STATUS_LABELS[h.fromStatus!]}
                          </StatusBadge>
                          <span className="text-neutral-400">→</span>
                          <StatusBadge tone={RENOVATION_STATUS_TONES[h.toStatus]}>
                            {RENOVATION_STATUS_LABELS[h.toStatus]}
                          </StatusBadge>
                        </>
                      )}
                    </div>
                    <span className="text-neutral-600 ml-auto">
                      {h.author.fullName}
                    </span>
                  </div>
                  {h.note && (
                    <p className="mt-1 ml-32 text-sm text-neutral-500">{h.note}</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <ActivityFeed
        targetType="renovation"
        targetId={r.id}
        viewerId={me.id}
        viewerRole={me.role}
      />

      <p className="text-sm text-neutral-500">
        ID: <span className="font-mono">{r.id}</span>
      </p>
    </div>
  );
}
