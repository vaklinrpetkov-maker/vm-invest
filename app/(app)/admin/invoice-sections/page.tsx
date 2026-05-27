import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { InvoiceSectionsAdmin, type SectionRow } from "./invoice-sections-admin";

export const dynamic = "force-dynamic";

// Admin-only CRUD for the upload buckets shown on /invoices. Seeded with
// 4 sections (Офис / Строеж / Реновации / Архитектура); admin can add a 5th
// or deactivate any of the originals. See specs/invoices.md §5.

export default async function AdminInvoiceSectionsPage() {
  await requireRole("admin");

  const sections = await prisma.invoiceSection.findMany({
    orderBy: [{ sortOrder: "asc" }, { labelBg: "asc" }],
    include: { _count: { select: { invoices: true } } },
  });

  const rows: SectionRow[] = sections.map((s) => ({
    id: s.id,
    labelBg: s.labelBg,
    slug: s.slug,
    sortOrder: s.sortOrder,
    active: s.active,
    invoiceCount: s._count.invoices,
  }));

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl text-neutral-900">Секции за фактури</h1>
        <p className="text-base text-neutral-600">
          Кои бутони за качване на фактури се показват на страница Фактури.
          Името може да се преименува по всяко време; системното име е
          неизменно. Деактивираните секции изчезват от страницата, но
          съществуващите фактури в тях остават достъпни.
        </p>
      </div>

      <InvoiceSectionsAdmin rows={rows} />
    </div>
  );
}
