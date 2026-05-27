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
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_TONES,
  CONTRACT_TYPE_LABELS,
  CONTRACT_TYPE_TONES,
  INSTALLMENT_TRACK_LABELS,
  PAYMENT_MILESTONES,
  type ContractStatus,
  type ContractType,
  type InstallmentTrack,
} from "@/lib/contracts/constants";
import { computeCarryover } from "@/lib/contracts/carryover";
import { getContractById } from "@/lib/contracts/queries";
import type { AttachedFile } from "@/lib/files/types";
import { ContractFiles } from "./contract-files";

export const dynamic = "force-dynamic";

function DetailRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <span className="text-sm text-neutral-500">{label}</span>
      <span className="text-base text-neutral-900">{children}</span>
    </div>
  );
}

function fmtMoney(v: unknown, min = 0, max = 2): string {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("bg-BG", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });
}

function nullDash(v: string | null | undefined): React.ReactNode {
  return v === null || v === undefined || v === "" ? (
    <span className="text-neutral-400">—</span>
  ) : (
    v
  );
}

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireProfile();
  const { id } = await params;
  const c = await getContractById(id);
  if (!c) notFound();

  const contractType = c.contractType as ContractType;
  const statusKey = c.status as ContractStatus;
  // Per spec §8.1, attachment deletion is admin-only.
  const canDeleteAttachments = me.role === "admin";
  // Per spec §9: sales-users can't modify a signed contract. Managers and
  // admins can edit any state.
  const canEdit =
    me.role === "admin" || me.role === "manager" || (me.role === "user" && c.status !== "signed");

  // Whether to show both tracks or just bank. "BEZ_SMR" has only bank.
  const showCashTrack = contractType !== "BEZ_SMR";

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Breadcrumb + header */}
      <div className="space-y-2">
        <div className="text-sm text-neutral-500">
          <Link href={"/contracts" as Route} className="hover:text-neutral-900 transition-colors">
            ← Договори
          </Link>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <h1 className="text-2xl text-neutral-900 break-words">{c.title}</h1>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge tone={CONTRACT_STATUS_TONES[statusKey] ?? "neutral"}>
                {CONTRACT_STATUS_LABELS[statusKey] ?? c.status}
              </StatusBadge>
              <StatusBadge tone={CONTRACT_TYPE_TONES[contractType] ?? "neutral"}>
                {CONTRACT_TYPE_LABELS[contractType] ?? c.contractType}
              </StatusBadge>
              {c.usesCredit && <StatusBadge tone="info">С кредит</StatusBadge>}
              {c.preOrPost && (
                <StatusBadge tone="neutral">{c.preOrPost} Акт 16</StatusBadge>
              )}
            </div>
          </div>
          {canEdit && (
            <Link href={`/contracts/${id}/edit` as Route}>
              <Button variant="secondary">Редактирай</Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: details */}
        <div className="space-y-6 lg:col-span-1">
          <section className="bg-neutral-0 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
              Данни
            </h2>
            <DetailRow label="Купувач">
              {c.contact ? (
                <Link
                  href={`/contacts/${c.contact.id}` as Route}
                  className="text-neutral-900 hover:text-accent-700 transition-colors"
                >
                  {c.contact.fullName}
                </Link>
              ) : (
                c.buyerFullName
              )}
            </DetailRow>
            <DetailRow label="Консултант">
              {c.salespersonProfile ? (
                <span
                  className={c.salespersonProfile.active ? undefined : "italic opacity-70"}
                  title={
                    c.salespersonProfile.active
                      ? undefined
                      : "Този потребител е деактивиран."
                  }
                >
                  {c.salespersonProfile.fullName}
                </span>
              ) : (
                // Legacy: imported contracts only have the free-text column.
                nullDash(c.salesperson)
              )}
            </DetailRow>
            <DetailRow label="Сграда">{nullDash(c.building)}</DetailRow>
            <DetailRow label="Апартамент / състав">
              {nullDash(c.compositionStatus)}
            </DetailRow>
            <DetailRow label="Подписан">
              {c.signedAt ? formatDate(c.signedAt) : <span className="text-neutral-400">—</span>}
            </DetailRow>
            <DetailRow label="Дата напомняне">
              {c.reminderDate ? (
                formatDate(c.reminderDate)
              ) : (
                <span className="text-neutral-400">—</span>
              )}
            </DetailRow>
          </section>

          <section className="bg-neutral-0 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
              Финансово
            </h2>
            <DetailRow label="Обща дължима сума">
              <span className="text-lg font-medium tabular-nums">
                {fmtMoney(c.totalDueEur)}
              </span>
            </DetailRow>
            <DetailRow label="Платено">
              <span className="tabular-nums text-success-700">
                {fmtMoney(c.totalPaidEur)}
              </span>
            </DetailRow>
            <DetailRow label="Остава">
              <span
                className={cn(
                  "tabular-nums font-medium",
                  Number(c.totalRemainingEur) > 0.01
                    ? "text-warning-800"
                    : "text-success-700",
                )}
              >
                {fmtMoney(c.totalRemainingEur)}
              </span>
            </DetailRow>
          </section>

          <section className="bg-neutral-0 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
              Имоти по договора ({c.properties.length})
            </h2>
            {c.properties.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Не са свързани имоти в ERP. Справката в заглавието е от CSV-то.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {c.properties.map((cp) => (
                  <li key={cp.property.id}>
                    <Link
                      href={`/properties/${cp.property.id}` as Route}
                      className="text-sm text-neutral-900 hover:text-accent-700 transition-colors"
                    >
                      {cp.property.building?.displayName ?? "—"} › {cp.property.name}
                    </Link>
                    <span className="text-xs text-neutral-500 ml-2">{cp.property.type}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="bg-neutral-0 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
                Файлове ({c.attachments.length})
              </h2>
            </div>
            <ContractFiles
              contractId={c.id}
              canDelete={canDeleteAttachments}
              files={c.attachments.map<AttachedFile>((a) => ({
                id: a.id,
                fileName: a.fileName,
                storageKey: a.storageKey,
                mimeType: a.mimeType,
                sizeBytes: a.sizeBytes,
                uploadedAt: a.uploadedAt,
                uploadedBy: a.uploadedBy
                  ? { id: a.uploadedBy.id, fullName: a.uploadedBy.fullName }
                  : null,
              }))}
            />
            <p className="text-sm text-neutral-500">
              Качените тук файлове се виждат и от таблицата с договори.
            </p>
          </section>

          <section className="bg-neutral-0 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
              Метаданни
            </h2>
            <DetailRow label="Източник">
              {c.source === "imported" ? "CSV импорт" : "Ръчно създаден"}
            </DetailRow>
            <DetailRow label="Създаден">
              <span className="tabular-nums">{formatDateTime(c.createdAt)}</span>
              {c.createdBy && (
                <span className="text-neutral-500 ml-2">от {c.createdBy.fullName}</span>
              )}
            </DetailRow>
            <DetailRow label="Последна промяна">
              <span className="tabular-nums">{formatDateTime(c.updatedAt)}</span>
              {c.updatedBy && (
                <span className="text-neutral-500 ml-2">от {c.updatedBy.fullName}</span>
              )}
            </DetailRow>
          </section>
        </div>

        {/* Right column: payments */}
        <div className="space-y-6 lg:col-span-2">
          <section className="bg-neutral-0 rounded-xl p-5 space-y-5">
            <h2 className="text-sm font-medium text-neutral-700 uppercase tracking-tight">
              Вноски
            </h2>
            {c.payments.length === 0 ? (
              <p className="text-sm text-neutral-500">Няма заредени вноски.</p>
            ) : (
              <div className="space-y-4">
                {(() => {
                  const carry = computeCarryover(c.payments);
                  return carry.adjusted.map((adj, idx) => {
                  const p = c.payments[idx];
                  const milestoneLabel =
                    PAYMENT_MILESTONES[p.number - 1] ?? `Вноска ${p.number}`;
                  const cashInstallments = p.installments.filter((i) => i.track === "CASH");
                  const bankInstallments = p.installments.filter((i) => i.track === "BANK");
                  const paidNum = Number(p.paidEur);
                  const rawDueNum = Number(adj.rawDueEur);
                  const adjDueNum = Number(adj.adjustedDueEur);
                  const creditInNum = Number(adj.creditInEur);
                  const hasCarryoverIn = creditInNum > 0.01;
                  const hasAdjustment = Math.abs(rawDueNum - adjDueNum) > 0.01;
                  const hasAnyActivity =
                    rawDueNum > 0.01 || paidNum > 0.01 || hasCarryoverIn;

                  return (
                    <article
                      key={p.id}
                      className={cn(
                        "rounded-lg border border-neutral-150 p-4 space-y-3",
                        !hasAnyActivity && "opacity-60",
                      )}
                    >
                      <header className="flex items-baseline justify-between gap-4 flex-wrap">
                        <div className="flex items-baseline gap-2">
                          <span className="text-base font-medium">
                            Вноска {p.number}
                          </span>
                          <span className="text-sm text-neutral-600">{milestoneLabel}</span>
                        </div>
                        <div className="text-sm text-neutral-600 tabular-nums space-x-4">
                          <span>
                            Дължимо:{" "}
                            {hasAdjustment ? (
                              <>
                                <span className="text-neutral-400 line-through mr-1">
                                  {fmtMoney(adj.rawDueEur)}
                                </span>
                                <span className="text-neutral-900 font-medium">
                                  {fmtMoney(adj.adjustedDueEur)}
                                </span>
                              </>
                            ) : (
                              <span className="text-neutral-900 font-medium">
                                {fmtMoney(adj.adjustedDueEur)}
                              </span>
                            )}
                          </span>
                          <span>
                            Платено:{" "}
                            <span className="text-success-700">{fmtMoney(p.paidEur)}</span>
                          </span>
                          <span>
                            Остава:{" "}
                            <span
                              className={cn(
                                Number(adj.adjustedRemainingEur) > 0.01
                                  ? "text-warning-800"
                                  : "text-success-700",
                              )}
                            >
                              {fmtMoney(adj.adjustedRemainingEur)}
                            </span>
                          </span>
                        </div>
                      </header>

                      {/* Carryover notes: credit in (from previous) and overpayment out (to next). */}
                      {hasCarryoverIn && (
                        <div className="text-xs text-info-700 bg-info-50/60 rounded px-2 py-1">
                          Прехвърлено от предишна вноска:{" "}
                          <strong>{fmtMoney(adj.creditInEur)}</strong>
                          {hasAdjustment && (
                            <>
                              {" "}
                              (очакваното{" "}
                              <span className="tabular-nums">{fmtMoney(adj.rawDueEur)}</span>{" "}
                              се намалява до{" "}
                              <span className="tabular-nums">{fmtMoney(adj.adjustedDueEur)}</span>
                              )
                            </>
                          )}
                        </div>
                      )}
                      {Number(adj.overpaymentEur) > 0.01 && (
                        <div className="text-xs text-info-700 bg-info-50/60 rounded px-2 py-1">
                          Надплатено:{" "}
                          <strong>{fmtMoney(adj.overpaymentEur)}</strong>
                          {p.number < 4 && (
                            <> — прехвърля се към Вноска {p.number + 1}.</>
                          )}
                        </div>
                      )}
                      {Number(adj.backwardCreditAppliedEur) > 0.01 && (
                        <div className="text-xs text-success-700 bg-success-50/60 rounded px-2 py-1">
                          Покрито от бъдещо надплащане:{" "}
                          <strong>{fmtMoney(adj.backwardCreditAppliedEur)}</strong>
                          {" "}
                          (намалява «Остава» с тази сума)
                        </div>
                      )}

                      <div
                        className={cn(
                          "grid gap-3",
                          showCashTrack ? "md:grid-cols-2" : "grid-cols-1",
                        )}
                      >
                        {showCashTrack && (
                          <TrackCard
                            label={INSTALLMENT_TRACK_LABELS.CASH}
                            track="CASH"
                            installments={cashInstallments}
                          />
                        )}
                        <TrackCard
                          label={INSTALLMENT_TRACK_LABELS.BANK}
                          track="BANK"
                          installments={bankInstallments}
                        />
                      </div>

                      {/* Discrepancy note: imported rows whose dropped events produced a gap. */}
                      {paidNum > 0 && Math.abs(sumInstallments(p.installments) - paidNum) > 0.02 && (
                        <div className="text-xs text-neutral-500 italic">
                          Забележка: общата сума на показаните вноски ({fmtMoney(
                            sumInstallments(p.installments),
                          )}) се различава от «Платено» ({fmtMoney(p.paidEur)}). Вероятно
                          оригиналният CSV е съдържал събития от типове, които са пропуснати
                          при опростяването на схемата (Доплащане, Нотариален акт и др.).
                        </div>
                      )}
                    </article>
                  );
                  });
                })()}
                {(() => {
                  const carry = computeCarryover(c.payments);
                  if (Number(carry.unusedCreditEur) <= 0.01) return null;
                  return (
                    <div className="rounded-lg border border-info-100 bg-info-50/40 p-4 text-sm text-info-700">
                      Свободен кредит:{" "}
                      <strong className="tabular-nums">
                        {fmtMoney(carry.unusedCreditEur)}
                      </strong>
                      . Договорът е надплатен над общата сума — сумата може да
                      бъде възстановена или приспадната по друг договор.
                    </div>
                  );
                })()}
              </div>
            )}
          </section>
        </div>
      </div>

      <ActivityFeed
        targetType="contract"
        targetId={c.id}
        viewerId={me.id}
        viewerRole={me.role}
      />
    </div>
  );
}

function sumInstallments(
  installments: Array<{ amountEur: unknown }>,
): number {
  let s = 0;
  for (const i of installments) {
    const n = Number(i.amountEur);
    if (Number.isFinite(n)) s += n;
  }
  return s;
}

function TrackCard({
  label,
  track,
  installments,
}: {
  label: string;
  track: InstallmentTrack;
  installments: Array<{
    id: string;
    track: string;
    amountEur: unknown;
    paidAt: Date | null;
  }>;
}) {
  const tone = track === "CASH" ? "bg-warning-50/40" : "bg-info-50/40";
  return (
    <div className={cn("rounded-md p-3 space-y-2", tone)}>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-tight text-neutral-600 font-medium">
          {label}
        </span>
        <span className="text-sm text-neutral-700 tabular-nums">
          {fmtMoney(
            installments.reduce(
              (s, i) => s + (Number.isFinite(Number(i.amountEur)) ? Number(i.amountEur) : 0),
              0,
            ),
          )}
        </span>
      </div>
      {installments.length === 0 ? (
        <div className="text-xs text-neutral-400">—</div>
      ) : (
        <ul className="space-y-1">
          {installments.map((i, idx) => (
            <li
              key={i.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="text-neutral-500 tabular-nums">
                Плащане {idx + 1}
              </span>
              <span className="text-neutral-900 tabular-nums">{fmtMoney(i.amountEur)}</span>
              <span className="text-neutral-500 tabular-nums text-xs ml-auto">
                {i.paidAt ? formatDate(i.paidAt) : "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
