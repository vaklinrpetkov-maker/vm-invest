import Link from "next/link";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { PageHelp } from "@/components/ui/page-help";
import { listActiveBuildings } from "@/lib/buildings/queries";
import { requireProfile } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import {
  LEADS_PAGE_SIZE,
  buildLeadWhere,
  parseLeadFilters,
  serializeLeadFilters,
  type LeadSearchParams,
  type ParsedLeadFilters,
} from "@/lib/leads/filters";
import { prisma } from "@/lib/prisma";
import { LeadFilters } from "./filters";
import { LeadsTable, type LeadRow } from "./leads-table";

export const dynamic = "force-dynamic";

function pageHref(filters: ParsedLeadFilters, page: number): Route {
  const f = { ...filters, page };
  const qs = serializeLeadFilters(f).toString();
  return (qs ? `/leads?${qs}` : "/leads") as Route;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<LeadSearchParams>;
}) {
  const me = await requireProfile();
  const params = await searchParams;
  const filters = parseLeadFilters(params);
  const where = buildLeadWhere(filters);

  const [totalCount, list, owners, buildingRows] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * LEADS_PAGE_SIZE,
      take: LEADS_PAGE_SIZE,
      select: {
        id: true,
        status: true,
        source: true,
        properties: true,
        createdAt: true,
        contact: { select: { fullName: true } },
        owner: { select: { id: true, fullName: true, active: true } },
      },
    }),
    prisma.profile.findMany({
      where: { active: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
    listActiveBuildings(),
  ]);
  const buildings = buildingRows.map((b) => b.displayName);

  const totalPages = Math.max(1, Math.ceil(totalCount / LEADS_PAGE_SIZE));
  const rangeStart = totalCount === 0 ? 0 : (filters.page - 1) * LEADS_PAGE_SIZE + 1;
  const rangeEnd = Math.min(filters.page * LEADS_PAGE_SIZE, totalCount);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl text-neutral-900">Лийдове</h1>
            <PageHelp
              content={
                <p>
                  Заявки от потенциални клиенти. Идват от формата на сайта,
                  от имейл или ръчно. Когато постъпи нов имейл-лийд, се появява
                  в горната навигация бутон Входяща с брояч — кликни го, за
                  да видиш лийдовете чакащи първоначален отговор. Статусът,
                  източникът и отговорникът са редактируеми директно в таблицата.
                </p>
              }
            />
          </div>
          <p className="text-base text-neutral-600">
            {totalCount === 0
              ? "Няма намерени лийдове."
              : `Показани ${rangeStart}–${rangeEnd} от ${totalCount}.`}
          </p>
        </div>
        <Link href="/leads/new">
          <Button>+ Нов лийд</Button>
        </Link>
      </div>

      <LeadFilters buildings={buildings} owners={owners} />

      <LeadsTable
        rows={list.map<LeadRow>((l) => ({
          id: l.id,
          status: l.status,
          source: l.source,
          contactName: l.contact.fullName,
          ownerId: l.owner?.id ?? null,
          ownerName: l.owner?.fullName ?? null,
          ownerActive: l.owner?.active ?? null,
          properties: l.properties,
          createdAtFormatted: formatDate(l.createdAt),
        }))}
        ownerOptions={owners}
        canDelete={me.role === "admin"}
      />

      {totalPages > 1 && (
        <nav className="flex items-center justify-between gap-2 pt-1">
          <div className="text-sm text-neutral-500">
            Страница {filters.page} от {totalPages}
          </div>
          <div className="flex items-center gap-2">
            {filters.page > 1 ? (
              <Link href={pageHref(filters, filters.page - 1)}>
                <Button variant="secondary" size="sm">
                  ← Предишна
                </Button>
              </Link>
            ) : (
              <Button variant="secondary" size="sm" disabled>
                ← Предишна
              </Button>
            )}
            {filters.page < totalPages ? (
              <Link href={pageHref(filters, filters.page + 1)}>
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
      )}
    </div>
  );
}
