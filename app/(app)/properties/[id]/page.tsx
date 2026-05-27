import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ActivityFeed } from "@/components/ui/activity-feed/activity-feed";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime } from "@/lib/format";
import { requireProfile } from "@/lib/auth/session";
import {
  PROPERTY_STATUS_TONES,
  type PropertyStatus,
} from "@/lib/properties/constants";
import { getPropertyById } from "@/lib/properties/queries";
import { canDeleteProperty, canEditField, isLockedField } from "@/lib/properties/permissions";
import {
  RENOVATION_STATUS_LABELS,
  RENOVATION_STATUS_TONES,
} from "@/lib/renovations/constants";
import { listRenovationsByProperty } from "@/lib/renovations/queries";
import { deleteProperty } from "../actions";
import { DeletePropertyButton } from "./delete-property-button";
import { OwnerPickerRow } from "./owner-picker-row";

export const dynamic = "force-dynamic";

// Detail page for a single property. URL-addressable at /properties/[id].
// Left column = grouped details, right column = relations panel (Phase 1
// shows only the status-history tab because owner/contract/renovations all
// depend on modules that don't exist yet).

function DetailRow({
  label,
  children,
  className,
  tooltip,
  locked,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  tooltip?: string;
  locked?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <span className="text-sm text-neutral-500 inline-flex items-center gap-1" title={tooltip}>
        {label}
        {locked && (
          <span title="Това поле се попълва от модул Договори." aria-label="заключено">
            🔒
          </span>
        )}
      </span>
      <span className="text-base text-neutral-900">{children}</span>
    </div>
  );
}

function nullDash(v: string | null | undefined): React.ReactNode {
  return v === null || v === undefined || v === "" ? (
    <span className="text-neutral-400">—</span>
  ) : (
    v
  );
}

function fmtDec(
  v: unknown,
  opts: { percentage?: boolean; decimals?: number } = {},
): React.ReactNode {
  if (v === null || v === undefined) return <span className="text-neutral-400">—</span>;
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (opts.percentage) {
    return (
      (n * 100).toLocaleString("bg-BG", { maximumFractionDigits: opts.decimals ?? 4 }) + "%"
    );
  }
  return n.toLocaleString("bg-BG", {
    minimumFractionDigits: opts.decimals ?? 0,
    maximumFractionDigits: opts.decimals ?? 4,
  });
}

function fmtMoney(v: unknown, currency = "EUR"): React.ReactNode {
  if (v === null || v === undefined) return <span className="text-neutral-400">—</span>;
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("bg-BG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireProfile();
  const { id } = await params;
  const p = await getPropertyById(id);
  if (!p) notFound();

  // Renovations attached to this property. Cheap query — typical units have
  // 0-5 historical renovations.
  const renovations = await listRenovationsByProperty(id);

  const statusTone = PROPERTY_STATUS_TONES[p.status as PropertyStatus] ?? "neutral";
  const lockCtx = { ownerId: p.ownerId, contractId: p.contractId };
  const hasBgnOriginals =
    p.priceBgnOriginal !== null ||
    p.expectedPriceBgnOriginal !== null ||
    p.yardTerracePriceBgnOriginal !== null;

  // Relations panel tabs — only renderable when they have content. In Phase 1
  // only status history has content (owner/contract/renovations are Phase 2).
  const tabs: Array<{ key: string; label: string; count: number }> = [];
  if (p.contractId) tabs.push({ key: "contract", label: "Договор", count: 1 });
  if (p.ownerId) tabs.push({ key: "owner", label: "Собственик", count: 1 });
  tabs.push({ key: "history", label: "История на статуса", count: p.statusHistory.length });

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Breadcrumb + header */}
      <div className="space-y-2">
        <div className="text-sm text-neutral-500">
          <Link href="/properties" className="hover:text-neutral-900 transition-colors">
            ← Имоти
          </Link>
          <span className="mx-2 text-neutral-300">/</span>
          <span>{p.building.displayName}</span>
          <span className="mx-2 text-neutral-300">›</span>
          <span className="text-neutral-900">{p.name}</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl text-neutral-900">
              {p.building.displayName} › {p.name}
            </h1>
            <div className="flex items-center gap-2">
              <StatusBadge tone={statusTone}>{p.status}</StatusBadge>
              <StatusBadge tone="neutral">{p.type}</StatusBadge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {p.ownerId && (
              <Link href={`/contacts/${p.ownerId}` as Route}>
                <Button variant="secondary" size="sm">
                  Отвори собственика
                </Button>
              </Link>
            )}
            {canDeleteProperty(me.role) && !p.ownerId && !p.contractId && (
              <form action={deleteProperty}>
                <input type="hidden" name="id" value={p.id} />
                <DeletePropertyButton />
              </form>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Details panel (left) */}
        <div className="space-y-6 lg:col-span-1">
          <section className="bg-neutral-0 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
              Основни
            </h2>
            <DetailRow label="Сграда">{p.building.displayName}</DetailRow>
            <DetailRow label="Име">{p.name}</DetailRow>
            <DetailRow label="Статус">
              <StatusBadge tone={statusTone}>{p.status}</StatusBadge>
            </DetailRow>
            <DetailRow label="Тип">{p.type}</DetailRow>
            <DetailRow label="Вход">{nullDash(p.entrance)}</DetailRow>
            <DetailRow label="Етаж">{p.floor ?? <span className="text-neutral-400">—</span>}</DetailRow>
          </section>

          {p.description && (
            <section className="bg-neutral-0 rounded-xl p-5 space-y-2">
              <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
                Описание
              </h2>
              <p className="text-base text-neutral-900 whitespace-pre-wrap">{p.description}</p>
            </section>
          )}

          <section className="bg-neutral-0 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
              Площи
            </h2>
            <DetailRow label="Квадратура общо">{fmtDec(p.totalAreaM2, { decimals: 4 })} {p.totalAreaM2 && "м²"}</DetailRow>
            <DetailRow label="Общи части">{fmtDec(p.commonPartsM2, { decimals: 4 })} {p.commonPartsM2 && "м²"}</DetailRow>
            <DetailRow label="Чиста площ">{fmtDec(p.netAreaM2, { decimals: 2 })} {p.netAreaM2 && "м²"}</DetailRow>
            <DetailRow
              label="Коеф. ид.ч"
              tooltip="Коефициент на идеалните части — дял от общите части на сградата."
            >
              {fmtDec(p.idealPartsCoef, { decimals: 4 })}
            </DetailRow>
            <DetailRow label="Брой бани">
              {p.bathroomCount ?? <span className="text-neutral-400">—</span>}
            </DetailRow>
            <DetailRow label="Двор">{fmtDec(p.yardM2, { decimals: 2 })} {p.yardM2 && "м²"}</DetailRow>
            <DetailRow label="Тераси">{fmtDec(p.terraceM2, { decimals: 2 })} {p.terraceM2 && "м²"}</DetailRow>
            <DetailRow label="Земя">{fmtDec(p.landM2, { decimals: 4 })} {p.landM2 && "м²"}</DetailRow>
            <DetailRow label="Земя %">{fmtDec(p.landPct, { percentage: true })}</DetailRow>
            <DetailRow label="Двор %">{fmtDec(p.yardPct, { percentage: true })}</DetailRow>
          </section>

          <section className="bg-neutral-0 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
              Цена
            </h2>
            <DetailRow label="Очаквана цена (EUR)">{fmtMoney(p.expectedPriceEur)}</DetailRow>
            <DetailRow label="Цена (EUR)">{fmtMoney(p.priceEur)}</DetailRow>
            <DetailRow label="Цена двор/тераса (EUR)">{fmtMoney(p.yardTerracePriceEur)}</DetailRow>
            {hasBgnOriginals && (
              <>
                <hr className="border-neutral-150" />
                <div className="text-xs text-neutral-500">Исторически (оригинал в BGN)</div>
                <DetailRow label="Цена (BGN)">{fmtMoney(p.priceBgnOriginal, "BGN")}</DetailRow>
                <DetailRow label="Очаквана цена (BGN)">{fmtMoney(p.expectedPriceBgnOriginal, "BGN")}</DetailRow>
                <DetailRow label="Цена двор/тераса (BGN)">{fmtMoney(p.yardTerracePriceBgnOriginal, "BGN")}</DetailRow>
              </>
            )}
          </section>

          <section className="bg-neutral-0 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
              Правни
            </h2>
            <DetailRow
              label="Продавач"
              tooltip="Юридическото лице или физическо лице, което продава имота (на чието име е нотариалният акт). Може да са повече от един при съсобственост."
            >
              {p.sellers.length === 0 ? (
                <span className="text-neutral-400">—</span>
              ) : (
                p.sellers.join(", ")
              )}
            </DetailRow>
            <DetailRow label="Кредит">
              {p.hasCredit === true ? "Да" : p.hasCredit === false ? "Не" : <span className="text-neutral-400">—</span>}
            </DetailRow>
            <DetailRow
              label="Договор (описание)"
              tooltip="Старо описание на договора от предишния списък. Новите договори се създават в модул Договори."
              locked={isLockedField("contractLabel", lockCtx)}
            >
              {nullDash(p.contractLabel)}
            </DetailRow>
            <DetailRow
              label="Купувач (описание)"
              locked={isLockedField("buyerLabel", lockCtx)}
            >
              {nullDash(p.buyerLabel)}
            </DetailRow>
          </section>

          <section className="bg-neutral-0 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
              Връзки
            </h2>
            {/* Owner row is rendered outside DetailRow because DetailRow
                wraps children in a <span>, and ContactPicker's root is a
                <div> with absolute-positioned children — the nesting
                collapses the picker's layout to zero width. */}
            <div className="flex flex-col gap-1">
              <span
                className="text-sm text-neutral-500 inline-flex items-center gap-1"
                title={
                  isLockedField("ownerId", lockCtx)
                    ? "Това поле се попълва от модул Договори."
                    : "Избери контакт, за да го свържеш като собственик на имота. След внедряване на модул Договори полето ще се попълва автоматично."
                }
              >
                Собственик
                {isLockedField("ownerId", lockCtx) && (
                  <span title="Това поле се попълва от модул Договори." aria-label="заключено">
                    🔒
                  </span>
                )}
              </span>
              <OwnerPickerRow
                propertyId={p.id}
                initial={
                  p.owner
                    ? {
                        id: p.owner.id,
                        fullName: p.owner.fullName,
                        phone: p.owner.phone,
                        email: p.owner.email,
                      }
                    : null
                }
                canEdit={canEditField(me.role, "ownerId", lockCtx)}
                lockMessage={
                  isLockedField("ownerId", lockCtx)
                    ? "Това поле се попълва от модул Договори."
                    : null
                }
              />
            </div>
            <DetailRow label="Договор" locked>
              {p.contractId ? (
                <span className="text-neutral-500 text-sm">
                  Ще се покаже след внедряване на модул Договори.
                </span>
              ) : (
                <span className="text-neutral-400">—</span>
              )}
            </DetailRow>
          </section>

          <section className="bg-neutral-0 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
              Метаданни
            </h2>
            <DetailRow label="Създаден">
              <span className="tabular-nums">{formatDateTime(p.createdAt)}</span>
              {p.createdBy && <span className="text-neutral-500 ml-2">от {p.createdBy.fullName}</span>}
              {!p.createdBy && <span className="text-neutral-500 ml-2">от Система</span>}
            </DetailRow>
            <DetailRow label="Последна промяна">
              <span className="tabular-nums">{formatDateTime(p.updatedAt)}</span>
              {p.updatedBy && <span className="text-neutral-500 ml-2">от {p.updatedBy.fullName}</span>}
              {!p.updatedBy && <span className="text-neutral-500 ml-2">от Система</span>}
            </DetailRow>
          </section>
        </div>

        {/* Relations panel (right) */}
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-neutral-0 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-4 border-b border-neutral-150 -mx-5 -mt-5 px-5 pt-4 pb-2">
              {tabs.map((t) => (
                <span
                  key={t.key}
                  className={cn(
                    "text-sm font-medium",
                    t.key === "history"
                      ? "text-neutral-900 border-b-2 border-accent-500 pb-1"
                      : "text-neutral-500",
                  )}
                >
                  {t.label}
                  <span className="ml-1.5 text-neutral-400">({t.count})</span>
                </span>
              ))}
            </div>

            <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
              История на статуса
            </h2>
            {p.statusHistory.length === 0 ? (
              <p className="text-sm text-neutral-500">Няма записани промени.</p>
            ) : (
              <ol className="space-y-3">
                {p.statusHistory.map((h) => (
                  <li key={h.id} className="flex items-start gap-3 text-sm">
                    <span className="tabular-nums text-neutral-500 w-32 shrink-0">
                      {formatDateTime(h.at)}
                    </span>
                    <div className="flex items-center gap-2">
                      <StatusBadge
                        tone={
                          h.fromStatus
                            ? PROPERTY_STATUS_TONES[h.fromStatus as PropertyStatus] ?? "neutral"
                            : "neutral"
                        }
                      >
                        {h.fromStatus ?? "—"}
                      </StatusBadge>
                      <span className="text-neutral-400">→</span>
                      <StatusBadge
                        tone={PROPERTY_STATUS_TONES[h.toStatus as PropertyStatus] ?? "neutral"}
                      >
                        {h.toStatus}
                      </StatusBadge>
                    </div>
                    <div className="flex-1 flex items-center gap-2 text-neutral-600">
                      <span>{h.author?.fullName ?? "Система"}</span>
                      {h.note && (
                        <>
                          <span className="text-neutral-300">•</span>
                          <span className="text-neutral-500">{h.note}</span>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>

      <section className="bg-neutral-0 rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-md font-medium text-neutral-900">
            Ремонти{" "}
            <span className="text-sm text-neutral-500 font-normal">
              ({renovations.length})
            </span>
          </h2>
          <Link href={(`/renovations/new?propertyId=${p.id}`) as Route}>
            <Button size="sm">+ Нов ремонт</Button>
          </Link>
        </div>
        {renovations.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Няма ремонти за този имот.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-150">
            {renovations.map((r) => {
              const done = r.activities.filter((a) => a.status === "done").length;
              const total = r.activities.length;
              // Derived title — `Ремонт — <building>/<unit>`. Building +
              // unit are the same property as the page so we shorten to
              // `Ремонт #<short-id>` if the renovation has no useful
              // identity beyond "another one on this property".
              const label = `Ремонт ${r.createdAt.toISOString().slice(0, 10)}`;
              return (
                <li
                  key={r.id}
                  className="py-2.5 flex items-center gap-3 text-sm"
                >
                  <StatusBadge tone={RENOVATION_STATUS_TONES[r.status]}>
                    {RENOVATION_STATUS_LABELS[r.status]}
                  </StatusBadge>
                  <Link
                    href={`/renovations/${r.id}` as Route}
                    className="text-neutral-900 hover:text-accent-700 transition-colors duration-120 flex-1 truncate"
                  >
                    {label}
                  </Link>
                  {total > 0 && (
                    <span className="text-neutral-500 tabular-nums">
                      {done} / {total}
                    </span>
                  )}
                  <span className="text-neutral-500 text-xs ml-auto">
                    {r.manager
                      ? r.manager.fullName
                      : "— Без отговорник"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ActivityFeed
        targetType="property"
        targetId={p.id}
        viewerId={me.id}
        viewerRole={me.role}
      />
    </div>
  );
}

// `formatDate` import kept for future use (relations tabs that show date-only
// fields). Not currently referenced in the JSX.
void formatDate;
