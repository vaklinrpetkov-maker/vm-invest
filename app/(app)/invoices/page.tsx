import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageHelp } from "@/components/ui/page-help";
import { requireProfile } from "@/lib/auth/session";
import { formatDate, formatEUR } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  INVOICES_PAGE_SIZE,
  buildInvoiceWhere,
  parseInvoiceFilters,
  type InvoiceSearchParams,
} from "@/lib/invoices/filters";
import { DashboardKpis } from "./dashboard-kpis";
import { InvoiceFilters } from "./filters";
import { InvoicesList, type InvoiceRow } from "./invoices-list";
import { SectionCards, type SectionCard } from "./section-cards";

export const dynamic = "force-dynamic";

// Главна страница за модул „Фактури". Three sections, top to bottom:
//   1. Section cards   — one per active InvoiceSection, Upload + View buttons
//                        plus a compact "X чакащи · Y платени за този месец"
//                        line. Upload stub ships in Round 2.
//   2. Filter bar      — section dropdown + "Само мои" toggle. The toggle
//                        defaults to ON; off pins as &mine=0 so a manager can
//                        bookmark "everyone's invoices" if they want.
//   3. Invoices list   — standard table, status inline-editable.
//
// Visible to managers + admins only. The `user` role gets a 404 since the
// module isn't part of their workflow.

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<InvoiceSearchParams>;
}) {
  const me = await requireProfile();
  if (me.role !== "admin" && me.role !== "manager") notFound();

  const params = await searchParams;
  const filters = parseInvoiceFilters(params);
  const where = buildInvoiceWhere(filters, me.id);

  // Variant of `where` with the user's status filter stripped — used by
  // the Pending and Overdue tiles, which apply their own status condition.
  // Without this, filtering the list to `status=paid` would force those
  // tiles to read 0 regardless of underlying data, which is unhelpful.
  const { status: _statusFilter, ...whereWithoutStatus } = where;
  void _statusFilter;

  const hasDateFilter = filters.from !== null || filters.to !== null;

  // First-of-current-month + first-of-last-month + today, all at UTC midnight.
  // Reused for the "paid this month" count on each section card AND the
  // dashboard KPI strip below.
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  const [
    sections,
    uploaders,
    totalCount,
    list,
    thisMonthAgg,
    lastMonthAgg,
    pendingAgg,
    overdueAgg,
    anomalyInvoiceCount,
  ] = await Promise.all([
    prisma.invoiceSection.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { labelBg: "asc" }],
      include: {
        _count: {
          select: {
            invoices: { where: { status: "pending" } },
          },
        },
        // Separate sub-aggregate for paid-this-month — we can't pass two
        // counts through the same `_count` shape, so fetch paid rows in a
        // tight projection and tally in JS. Volumes are small (~25/week).
        invoices: {
          where: { status: "paid", paidAt: { gte: monthStart } },
          select: { id: true },
        },
      },
    }),
    // List of profiles that have uploaded at least one invoice. Drives the
    // uploader filter dropdown — only show people who actually have invoices
    // attributed to them so the picker stays tight.
    prisma.profile.findMany({
      where: { uploadedInvoices: { some: {} } },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      orderBy: { invoiceDate: "desc" },
      skip: (filters.page - 1) * INVOICES_PAGE_SIZE,
      take: INVOICES_PAGE_SIZE,
      include: {
        section: { select: { labelBg: true } },
        uploadedBy: { select: { id: true, fullName: true, active: true } },
        _count: {
          select: {
            lineItems: { where: { priceAnomalyPct: { not: null } } },
          },
        },
      },
    }),
    // KPI aggregations. Scoped to the active filter set so the dashboard
    // stays in sync with the list below — when the user filters by section
    // / uploader / "Само мои" / search / date range / anomalies-only, the
    // four tiles re-aggregate over the matching subset. Status-specific
    // tiles (Pending, Overdue) strip the user's `status` filter so they
    // always answer "of the rest of the filter, how many are pending/
    // overdue?" — otherwise they'd read 0 whenever the user filters to
    // `status=paid`.
    //
    // Tile 1 ("Обща стойност за месеца") handles the date filter specially:
    //   - No date filter: current calendar month, with month-over-month
    //     delta computed against last calendar month under the same other
    //     filters.
    //   - Date filter active: sum over the filtered range; the
    //     month-over-month delta is dropped (no apples-to-apples comparison).
    prisma.invoice.aggregate({
      where: hasDateFilter ? where : { ...where, invoiceDate: { gte: monthStart } },
      _sum: { total: true },
      _count: { _all: true },
    }),
    hasDateFilter
      ? Promise.resolve(null as null)
      : prisma.invoice.aggregate({
          where: { ...where, invoiceDate: { gte: lastMonthStart, lt: monthStart } },
          _sum: { total: true },
        }),
    prisma.invoice.aggregate({
      where: { ...whereWithoutStatus, status: "pending" },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.invoice.aggregate({
      where: { ...whereWithoutStatus, status: "pending", dueDate: { lt: todayUtc } },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.invoice.count({
      where: { ...where, lineItems: { some: { priceAnomalyPct: { not: null } } } },
    }),
  ]);

  const cards: SectionCard[] = sections.map((s) => ({
    id: s.id,
    labelBg: s.labelBg,
    slug: s.slug,
    pendingCount: s._count.invoices,
    paidThisMonthCount: s.invoices.length,
  }));

  const rows: InvoiceRow[] = list.map((inv) => ({
    id: inv.id,
    sectionLabelBg: inv.section.labelBg,
    vendorName: inv.vendorName,
    invoiceNumber: inv.invoiceNumber,
    invoiceDateFormatted: formatDate(inv.invoiceDate),
    dueDateFormatted: inv.dueDate ? formatDate(inv.dueDate) : null,
    // Decimal → number for the formatter. Invoice totals max out around
    // 100 000 EUR so the JS-number precision loss is non-issue at this scale.
    totalFormatted: formatEUR(Number(inv.total)),
    status: inv.status,
    uploaderId: inv.uploadedBy.id,
    uploaderName: inv.uploadedBy.fullName,
    uploaderActive: inv.uploadedBy.active,
    anomalyCount: inv._count.lineItems,
    // FileCell maps the single per-invoice PDF as an AttachedFile. We use
    // the invoice id as the `id` field because the sign route looks up by
    // invoice id (no separate InvoiceAttachment table — see app/api/files/sign).
    file: {
      id: inv.id,
      fileName: inv.fileName,
      storageKey: inv.storagePath,
      mimeType: "application/pdf",
      sizeBytes: inv.fileSize,
      uploadedAt: inv.uploadedAt,
      uploadedBy: { id: inv.uploadedBy.id, fullName: inv.uploadedBy.fullName },
    },
  }));

  const totalPages = Math.max(1, Math.ceil(totalCount / INVOICES_PAGE_SIZE));
  const rangeStart =
    totalCount === 0 ? 0 : (filters.page - 1) * INVOICES_PAGE_SIZE + 1;
  const rangeEnd = Math.min(filters.page * INVOICES_PAGE_SIZE, totalCount);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl text-neutral-900">Фактури</h1>
          <PageHelp
            content={
              <p>
                Качване и преглед на фактури от доставчици. Изберете секция и
                натиснете бутона Качи фактура, за да добавите нова — системата
                автоматично разпознава доставчик, номер, суми и позиции от
                PDF-а. По подразбиране виждате вашите фактури; превключете
                филтъра, за да видите фактурите на цялата компания. Просрочени
                или с необичайно завишена цена позиции се маркират директно в
                таблицата.
              </p>
            }
          />
        </div>
        <p className="text-base text-neutral-600">
          {totalCount === 0
            ? "Няма фактури по избраните филтри."
            : `Показани ${rangeStart}–${rangeEnd} от ${totalCount}.`}
        </p>
      </div>

      <DashboardKpis
        thisPeriod={{
          total: Number(thisMonthAgg._sum.total ?? 0),
          count: thisMonthAgg._count._all,
        }}
        lastMonth={
          lastMonthAgg ? { total: Number(lastMonthAgg._sum.total ?? 0) } : null
        }
        periodLabel={
          hasDateFilter
            ? formatPeriodLabel(filters.from, filters.to)
            : null
        }
        pending={{
          total: Number(pendingAgg._sum.total ?? 0),
          count: pendingAgg._count._all,
        }}
        overdue={{
          total: Number(overdueAgg._sum.total ?? 0),
          count: overdueAgg._count._all,
        }}
        anomalyInvoiceCount={anomalyInvoiceCount}
      />

      <SectionCards cards={cards} />

      <InvoiceFilters
        sections={sections.map((s) => ({ id: s.id, labelBg: s.labelBg }))}
        uploaders={uploaders}
      />

      <InvoicesList
        rows={rows}
        canEditStatus={me.role === "admin" || me.role === "manager"}
        canDelete={me.role === "admin" || me.role === "manager"}
      />

      {totalPages > 1 && (
        <PaginationNav
          currentPage={filters.page}
          totalPages={totalPages}
          searchParams={params}
        />
      )}
    </div>
  );
}

// Server-rendered pagination block. The filter bar resets `page` to 1 on
// every change; this just bumps it between consecutive pages while keeping
// every other filter in the URL intact.
function PaginationNav({
  currentPage,
  totalPages,
  searchParams,
}: {
  currentPage: number;
  totalPages: number;
  searchParams: InvoiceSearchParams;
}) {
  function hrefFor(page: number): Route {
    // Reconstruct URLSearchParams from the raw search params object — handles
    // multi-value keys (status, etc.) without dropping repeats.
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) {
        for (const item of v) sp.append(k, item);
      } else {
        sp.set(k, v);
      }
    }
    if (page > 1) sp.set("page", String(page));
    else sp.delete("page");
    return (`/invoices${sp.toString() ? `?${sp}` : ""}`) as Route;
  }
  return (
    <nav className="flex items-center justify-between gap-2 pt-1">
      <div className="text-sm text-neutral-500">
        Страница {currentPage} от {totalPages}
      </div>
      <div className="flex items-center gap-2">
        {currentPage > 1 ? (
          <Link href={hrefFor(currentPage - 1)}>
            <Button variant="secondary" size="sm">
              ← Предишна
            </Button>
          </Link>
        ) : (
          <Button variant="secondary" size="sm" disabled>
            ← Предишна
          </Button>
        )}
        {currentPage < totalPages ? (
          <Link href={hrefFor(currentPage + 1)}>
            <Button variant="secondary" size="sm">
              Следваща →
            </Button>
          </Link>
        ) : (
          <Button variant="secondary" size="sm" disabled>
            Следваща →
          </Button>
        )}
      </div>
    </nav>
  );
}

// Period label shown on the first KPI tile when the user has a date filter
// active. Handles either-or-both bounds: "от X", "до Y", "X – Y".
function formatPeriodLabel(from: Date | null, to: Date | null): string {
  if (from && to) return `${formatDate(from)} – ${formatDate(to)}`;
  if (from) return `от ${formatDate(from)}`;
  if (to) return `до ${formatDate(to)}`;
  return "";
}
