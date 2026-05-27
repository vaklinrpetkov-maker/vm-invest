import Link from "next/link";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { PageHelp } from "@/components/ui/page-help";
import { requireProfile } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import {
  CONTRACTS_PAGE_SIZE,
  parseContractFilters,
  serializeContractFilters,
  type ContractSearchParams,
  type ParsedContractFilters,
} from "@/lib/contracts/filters";
import {
  listContractsForPage,
  listDistinctContractBuildings,
  listDistinctSalespeople,
} from "@/lib/contracts/queries";
import type { AttachedFile } from "@/lib/files/types";
import { ContractFilters } from "./filters";
import { ContractsTable, type ContractRow } from "./contracts-table";

export const dynamic = "force-dynamic";

function pageHref(filters: ParsedContractFilters, page: number): Route {
  const f = { ...filters, page };
  const qs = serializeContractFilters(f).toString();
  return (qs ? `/contracts?${qs}` : "/contracts") as Route;
}

function dec(v: unknown): string {
  if (v === null || v === undefined) return "0";
  return String(v);
}

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<ContractSearchParams>;
}) {
  const me = await requireProfile();
  // Per specs/contracts.md §9, status changes (draft/signed/cancelled) are
  // admin/manager only — surface this once at the page so the table cell
  // disables uniformly for users.
  const canEditStatus = me.role === "admin" || me.role === "manager";
  // Per spec §8.1, attachment deletion is admin-only ("Users cannot delete
  // attachments"). Threaded through to the FileCell so non-admin users
  // don't see the delete affordance at all.
  const canDeleteAttachments = me.role === "admin";
  // Per spec §139, contract deletion is admin-only. Same `canDelete` flag
  // is threaded into the table so the per-row × button only renders for
  // admins (server action enforces independently).
  const canDelete = me.role === "admin";
  const params = await searchParams;
  const filters = parseContractFilters(params);

  const [pageData, buildings, salespeople] = await Promise.all([
    listContractsForPage(filters, {
      skip: (filters.page - 1) * CONTRACTS_PAGE_SIZE,
      take: CONTRACTS_PAGE_SIZE,
    }),
    listDistinctContractBuildings(),
    listDistinctSalespeople(),
  ]);

  const rows: ContractRow[] = pageData.rows.map((c) => ({
    id: c.id,
    title: c.title,
    buyerFullName: c.buyerFullName,
    contactId: c.contactId,
    contactName: c.contact?.fullName ?? null,
    // Prefer the FK-resolved profile name (new contracts); fall back to
    // the legacy free-text column (CSV-imported rows). `salespersonActive`
    // tells the table whether to render the name in italic-muted style for
    // deactivated profiles.
    salesperson: c.salespersonProfile?.fullName ?? c.salesperson ?? null,
    salespersonActive: c.salespersonProfile ? c.salespersonProfile.active : null,
    building: c.building,
    contractType: c.contractType,
    compositionStatus: c.compositionStatus,
    preOrPost: c.preOrPost,
    usesCredit: c.usesCredit,
    totalDueEur: dec(c.totalDueEur),
    totalPaidEur: dec(c.totalPaidEur),
    totalRemainingEur: dec(c.totalRemainingEur),
    status: c.status,
    signedAtFormatted: c.signedAt ? formatDate(c.signedAt) : null,
    reminderDateFormatted: c.reminderDate ? formatDate(c.reminderDate) : null,
    propertyCount: c._count.properties,
    propertyPreview: c.properties
      .map((p) => `${p.property.building?.displayName ?? ""} › ${p.property.name}`.trim())
      .join(", "),
    files: c.attachments.map<AttachedFile>((a) => ({
      id: a.id,
      fileName: a.fileName,
      storageKey: a.storageKey,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      uploadedAt: a.uploadedAt,
      uploadedBy: a.uploadedBy
        ? { id: a.uploadedBy.id, fullName: a.uploadedBy.fullName }
        : null,
    })),
  }));

  const totalPages = Math.max(1, Math.ceil(pageData.total / CONTRACTS_PAGE_SIZE));
  const hasPrev = filters.page > 1;
  const hasNext = filters.page < totalPages;
  const rangeStart = pageData.total === 0 ? 0 : (filters.page - 1) * CONTRACTS_PAGE_SIZE + 1;
  const rangeEnd = Math.min(filters.page * CONTRACTS_PAGE_SIZE, pageData.total);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl text-neutral-900">Договори</h1>
            <PageHelp
              content={
                <p>
                  Всички подписани договори (импортирани от изходния CSV).
                  Кликни на заглавие, за да видиш вноските и прикачените
                  файлове в детайла. Файлове могат да се качват директно в
                  колоната Файлове (PDF-та, документи); админи могат да ги
                  изтриват. Статусът и колоната Кредит са редактируеми за
                  админи и мениджъри.
                </p>
              }
            />
          </div>
          <p className="text-base text-neutral-600">
            {pageData.total === 0 ? (
              "Няма намерени договори."
            ) : (
              <>Показани {rangeStart}–{rangeEnd} от {pageData.total}.</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={"/contracts/new" as Route}>
            <Button>+ Нов договор</Button>
          </Link>
        </div>
      </div>

      <ContractFilters buildings={buildings} salespeople={salespeople} />

      <ContractsTable
        rows={rows}
        canEditStatus={canEditStatus}
        canDeleteAttachments={canDeleteAttachments}
        canDelete={canDelete}
      />

      {totalPages > 1 && (
        <nav className="flex items-center justify-between gap-2 pt-1">
          <div className="text-sm text-neutral-500">
            Страница {filters.page} от {totalPages}
          </div>
          <div className="flex items-center gap-2">
            {hasPrev ? (
              <Link href={pageHref(filters, filters.page - 1)}>
                <Button variant="secondary" size="sm">← Предишна</Button>
              </Link>
            ) : (
              <Button variant="secondary" size="sm" disabled>← Предишна</Button>
            )}
            {hasNext ? (
              <Link href={pageHref(filters, filters.page + 1)}>
                <Button variant="secondary" size="sm">Следваща →</Button>
              </Link>
            ) : (
              <Button variant="secondary" size="sm" disabled>Следваща →</Button>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
