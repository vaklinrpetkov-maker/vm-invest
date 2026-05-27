import Link from "next/link";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { PageHelp } from "@/components/ui/page-help";
import { CONTACT_TYPES } from "@/lib/contacts/constants";
import { listActiveBuildings } from "@/lib/buildings/queries";
import {
  CONTACTS_PAGE_SIZE,
  buildContactWhere,
  filterByUpcomingBirthdays,
  parseContactFilters,
  serializeFilters,
  type ContactSearchParams,
  type ParsedFilters,
} from "@/lib/contacts/filters";
import { requireProfile } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { ContactFilters } from "./filters";
import { ContactsTable, type ContactRow } from "./contacts-table";

export const dynamic = "force-dynamic";

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function computeAge(birth: Date): number {
  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - birth.getUTCMonth();
  const dayDiff = today.getUTCDate() - birth.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
  return age;
}

function birthdayThisYear(birth: Date): Date {
  const y = new Date().getUTCFullYear();
  return new Date(Date.UTC(y, birth.getUTCMonth(), birth.getUTCDate()));
}

function pageHref(filters: ParsedFilters, page: number): Route {
  const f = { ...filters, page };
  const qs = serializeFilters(f).toString();
  return (qs ? `/contacts?${qs}` : "/contacts") as Route;
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<ContactSearchParams>;
}) {
  const me = await requireProfile();
  const params = await searchParams;
  const filters = parseContactFilters(params);
  const where = buildContactWhere(filters);

  // When the "upcoming birthdays" filter is active we can't push it to SQL,
  // so we fetch a wider window and paginate after filtering in-memory. Without
  // that filter we paginate directly at the DB.
  const useInMemoryBirthdayFilter = filters.birthdaysWithinDays != null;

  let rawContacts;
  let totalCount: number;

  if (useInMemoryBirthdayFilter) {
    const fetched = await prisma.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 5000,
      select: {
        id: true,
        fullName: true,
        type: true,
        phone: true,
        email: true,
        egn: true,
        address: true,
        properties: true,
        notes: true,
        birthDate: true,
        createdAt: true,
        owner: { select: { id: true, fullName: true, active: true } },
        building: { select: { id: true, displayName: true } },
      },
    });
    const filtered = filterByUpcomingBirthdays(fetched, filters.birthdaysWithinDays);
    totalCount = filtered.length;
    const start = (filters.page - 1) * CONTACTS_PAGE_SIZE;
    rawContacts = filtered.slice(start, start + CONTACTS_PAGE_SIZE);
  } else {
    const [count, list] = await Promise.all([
      prisma.contact.count({ where }),
      prisma.contact.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * CONTACTS_PAGE_SIZE,
        take: CONTACTS_PAGE_SIZE,
        select: {
          id: true,
          fullName: true,
          type: true,
          phone: true,
          email: true,
          egn: true,
          address: true,
          properties: true,
          notes: true,
          birthDate: true,
          createdAt: true,
          owner: { select: { id: true, fullName: true, active: true } },
          building: { select: { id: true, displayName: true } },
        },
      }),
    ]);
    totalCount = count;
    rawContacts = list;
  }

  const rows: ContactRow[] = rawContacts.map((c) => ({
    id: c.id,
    fullName: c.fullName,
    type: c.type,
    phone: c.phone,
    email: c.email,
    egn: c.egn,
    address: c.address,
    buildingId: c.building?.id ?? null,
    buildingName: c.building?.displayName ?? null,
    properties: c.properties,
    notes: c.notes,
    ownerId: c.owner?.id ?? null,
    ownerName: c.owner?.fullName ?? null,
    ownerActive: c.owner?.active ?? null,
    birthDate: c.birthDate ? toIsoDate(c.birthDate) : null,
    age: c.birthDate ? computeAge(c.birthDate) : null,
    birthdayThisYear: c.birthDate ? formatDate(birthdayThisYear(c.birthDate)) : null,
    createdAt: formatDate(c.createdAt),
  }));

  const owners = await prisma.profile.findMany({
    where: { active: true },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true },
  });

  const buildingRows = await listActiveBuildings();
  const buildings = buildingRows.map((b) => b.displayName);

  const exportQs = serializeFilters(filters).toString();
  const exportHref = (exportQs ? `/api/contacts/export?${exportQs}` : "/api/contacts/export") as Route;

  const totalPages = Math.max(1, Math.ceil(totalCount / CONTACTS_PAGE_SIZE));
  const hasPrev = filters.page > 1;
  const hasNext = filters.page < totalPages;
  const rangeStart = totalCount === 0 ? 0 : (filters.page - 1) * CONTACTS_PAGE_SIZE + 1;
  const rangeEnd = Math.min(filters.page * CONTACTS_PAGE_SIZE, totalCount);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl text-neutral-900">Контакти</h1>
            <PageHelp
              content={
                <p>
                  Централният списък с всички контакти — клиенти, партньори,
                  доставчици. Филтрирай отгоре по тип, сграда или отговорник.
                  Кликни на име, за да отвориш контакта; кликни на което и да
                  е поле в таблицата (телефон, имейл, отговорник, бележки…),
                  за да го редактираш направо тук.
                </p>
              }
            />
          </div>
          <p className="text-base text-neutral-600">
            {totalCount === 0 ? (
              "Няма намерени контакти."
            ) : (
              <>
                Показани {rangeStart}–{rangeEnd} от {totalCount}.
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {me.role === "admin" && (
            <a href={exportHref}>
              <Button variant="ghost">Експорт към CSV</Button>
            </a>
          )}
          <Link href="/contacts/new">
            <Button>+ Създай контакт</Button>
          </Link>
        </div>
      </div>

      <ContactFilters types={CONTACT_TYPES} buildings={buildings} owners={owners} />

      <ContactsTable
        rows={rows}
        ownerOptions={owners}
        buildingOptions={buildingRows.map((b) => ({
          id: b.id,
          label: b.displayName,
          sublabel: b.complex ?? undefined,
        }))}
        contactTypes={CONTACT_TYPES}
        canDelete={me.role === "admin" || me.role === "manager"}
      />

      {totalPages > 1 && (
        <nav className="flex items-center justify-between gap-2 pt-1">
          <div className="text-sm text-neutral-500">
            Страница {filters.page} от {totalPages}
          </div>
          <div className="flex items-center gap-2">
            {hasPrev ? (
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
            {hasNext ? (
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
