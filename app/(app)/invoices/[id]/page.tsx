import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ActivityFeed } from "@/components/ui/activity-feed/activity-feed";
import { requireProfile } from "@/lib/auth/session";
import { formatDate, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSignedUrl } from "@/lib/supabase/storage";
import { cn } from "@/lib/cn";
import { HeaderActions } from "./header-actions";
import { PreviewTab } from "./preview-tab";
import { PriceHistoryTab, type LineItemHistory } from "./price-history-tab";

export const dynamic = "force-dynamic";

// Detail page for a single invoice. Two tabs:
//   - Преглед           — split-screen PDF + editable header fields + read-
//                          only line items table. The preview modal during
//                          upload is the primary edit surface for line items;
//                          fixing a wrong line item post-save is rare enough
//                          that we keep that path manual (delete + re-upload
//                          while pending) for now.
//   - История на цените — per-line-item: last 5 prices the same (vendor,
//                          product) combo charged across prior invoices.
//
// Permissions per specs/invoices.md §11:
//   - user role: 404 (the module isn't visible to them at all)
//   - manager / admin: read access to any invoice; edit gating happens per-
//     field via the inline-cell `disabled` prop based on status + role.

type SearchParams = { tab?: string };

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const me = await requireProfile();
  if (me.role !== "admin" && me.role !== "manager") notFound();

  const { id } = await params;
  const { tab: tabRaw } = await searchParams;
  const tab: "preview" | "history" = tabRaw === "history" ? "history" : "preview";

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      section: { select: { id: true, labelBg: true } },
      uploadedBy: { select: { id: true, fullName: true, active: true } },
      paidBy: { select: { id: true, fullName: true, active: true } },
      lineItems: {
        orderBy: { rowNumber: "asc" },
        // Pull anomaly cross-reference for the price-history tab — even
        // though Round 4 fills these in, Round 3 already renders them when
        // present (forward-compatible).
        select: {
          id: true,
          rowNumber: true,
          description: true,
          descriptionNormalized: true,
          quantity: true,
          unit: true,
          unitPrice: true,
          lineTotal: true,
          vatRate: true,
          priceAnomalyPct: true,
          priceAnomalyRefInvoiceId: true,
        },
      },
    },
  });
  if (!invoice) notFound();

  // Signed URL for the PDF preview iframe. Server-rendered with a 5-minute
  // TTL — long enough for the user to read the page, short enough that a
  // shared link won't work past the session. The page is force-dynamic so
  // each refresh re-signs.
  const signed = await getSignedUrl(invoice.storagePath, {
    expiresInSeconds: 5 * 60,
  });

  // Price-history lookup: for each line item, the last 5 paid/pending line
  // items with the same (vendorNameNormalized, descriptionNormalized) and
  // invoiceDate strictly before this invoice's date.
  //
  // Originally implemented as `Promise.all(invoice.lineItems.map(findMany))`
  // — one round-trip per line item. With a serverless connection pool of
  // size 1 + the parallel `<ActivityFeed>` queries added later, this
  // pattern blew the 10s pool-acquire timeout on invoices with many line
  // items. Switched to one findMany covering every line item's
  // descriptionNormalized, then group + slice in JS.
  //
  // Trade-off: returns more rows than the per-item version's `take: 5`
  // when a vendor has long history on a description. Capped at 200 rows
  // overall — at realistic team scale (~50 historical invoices per
  // vendor) this comfortably covers the latest 5 per description.
  const vendorNorm = invoice.vendorNameNormalized;
  const descriptions = invoice.lineItems
    .map((li) => li.descriptionNormalized)
    .filter((d): d is string => d !== null && d !== undefined);
  const flatHistory =
    descriptions.length === 0
      ? []
      : await prisma.invoiceLineItem.findMany({
          where: {
            descriptionNormalized: { in: descriptions },
            invoiceId: { not: invoice.id },
            invoice: {
              vendorNameNormalized: vendorNorm,
              invoiceDate: { lt: invoice.invoiceDate },
            },
          },
          orderBy: { invoice: { invoiceDate: "desc" } },
          take: 200,
          select: {
            id: true,
            descriptionNormalized: true,
            unitPrice: true,
            unit: true,
            invoice: {
              select: { id: true, invoiceNumber: true, invoiceDate: true },
            },
          },
        });

  // Group the flat result by descriptionNormalized, slice top 5 per group.
  // `flatHistory` is already sorted by invoiceDate desc so the first 5
  // entries per group are the most recent.
  const historyByDesc = new Map<string, typeof flatHistory>();
  for (const row of flatHistory) {
    if (row.descriptionNormalized === null) continue;
    const arr = historyByDesc.get(row.descriptionNormalized) ?? [];
    if (arr.length < 5) {
      arr.push(row);
      historyByDesc.set(row.descriptionNormalized, arr);
    }
  }

  const history: LineItemHistory[] = invoice.lineItems.map((li) => {
    const rows = li.descriptionNormalized
      ? (historyByDesc.get(li.descriptionNormalized) ?? [])
      : [];
    return {
      lineItemId: li.id,
      description: li.description,
      currentUnitPrice: Number(li.unitPrice),
      currentUnit: li.unit,
      priceAnomalyPct: li.priceAnomalyPct ? Number(li.priceAnomalyPct) : null,
      history: rows.map((r) => ({
        invoiceId: r.invoice.id,
        invoiceNumber: r.invoice.invoiceNumber,
        invoiceDateIso: r.invoice.invoiceDate.toISOString().slice(0, 10),
        unitPrice: Number(r.unitPrice),
        unit: r.unit,
      })),
    };
  });

  const isPaid = invoice.status === "paid";
  // Per-field edit gate matches the action-side rule: manager edits only
  // while pending; admin always.
  const canEditFields = me.role === "admin" || (me.role === "manager" && !isPaid);
  // Status flip is open to both roles regardless of current status (flipping
  // a paid invoice back to pending is the recovery path; the action server
  // re-runs the check).
  const canEditStatus = me.role === "admin" || me.role === "manager";
  // Delete: uploader-while-pending OR admin.
  const canDelete = me.role === "admin" || (me.id === invoice.uploadedById && !isPaid);

  return (
    <div className="space-y-4">
      {/* Back link + top-right actions */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={"/invoices" as Route}
            className="text-sm text-neutral-500 hover:text-neutral-900"
          >
            ← Назад към Фактури
          </Link>
          <h1 className="text-xl text-neutral-900 mt-1">
            {invoice.vendorName} · №{invoice.invoiceNumber}
          </h1>
          <p className="text-base text-neutral-600">
            {invoice.section.labelBg} · {formatDate(invoice.invoiceDate)} · Качена от{" "}
            <span className={cn(!invoice.uploadedBy.active && "italic opacity-70")}>
              {invoice.uploadedBy.fullName}
            </span>{" "}
            на {formatDateTime(invoice.uploadedAt)}
          </p>
        </div>
        <HeaderActions
          invoiceId={invoice.id}
          status={invoice.status}
          canEditStatus={canEditStatus}
          canDelete={canDelete}
        />
      </div>

      {/* Tabs */}
      <nav className="flex items-center gap-1 border-b border-neutral-150">
        {([
          ["preview", "Преглед"],
          ["history", "История на цените"],
        ] as const).map(([key, label]) => {
          const isActive = tab === key;
          const href = (
            key === "preview"
              ? `/invoices/${invoice.id}`
              : `/invoices/${invoice.id}?tab=${key}`
          ) as Route;
          return (
            <Link
              key={key}
              href={href}
              className={cn(
                "inline-flex items-center gap-2 px-3 h-9 text-base transition-colors duration-120 -mb-px border-b-2",
                isActive
                  ? "border-accent-500 text-neutral-900"
                  : "border-transparent text-neutral-600 hover:text-neutral-900",
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {tab === "preview" ? (
        <PreviewTab
          invoice={{
            id: invoice.id,
            vendorName: invoice.vendorName,
            vendorVatNumber: invoice.vendorVatNumber,
            invoiceNumber: invoice.invoiceNumber,
            invoiceDateIso: invoice.invoiceDate.toISOString().slice(0, 10),
            dueDateIso: invoice.dueDate?.toISOString().slice(0, 10) ?? null,
            subtotal: Number(invoice.subtotal),
            vatAmount: Number(invoice.vatAmount),
            total: Number(invoice.total),
            notes: invoice.notes ?? "",
            parseConfidence: invoice.parseConfidence,
            parseReviewNeeded: invoice.parseReviewNeeded,
            paidAt: invoice.paidAt?.toISOString() ?? null,
            paidByName: invoice.paidBy?.fullName ?? null,
            status: invoice.status,
          }}
          lineItems={invoice.lineItems.map((li) => ({
            id: li.id,
            rowNumber: li.rowNumber,
            description: li.description,
            quantity: Number(li.quantity),
            unit: li.unit,
            unitPrice: Number(li.unitPrice),
            lineTotal: Number(li.lineTotal),
            vatRate: Number(li.vatRate),
            priceAnomalyPct: li.priceAnomalyPct ? Number(li.priceAnomalyPct) : null,
          }))}
          pdfSignedUrl={signed?.url ?? null}
          canEditFields={canEditFields}
        />
      ) : (
        <PriceHistoryTab lineItems={history} vendorName={invoice.vendorName} />
      )}

      <ActivityFeed
        targetType="invoice"
        targetId={invoice.id}
        viewerId={me.id}
        viewerRole={me.role}
      />
    </div>
  );
}
