"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { signOut } from "./actions";

// User menu dropdown — opens from the name+role block in the top-right of the
// app header. Holds the role-gated navigation links (admin/manager) so the
// main header can stay lean for the public links (Контакти / Имоти / Лийдове /
// Срещи / Екип / Отсъствия / Календар) plus any team-wide inbox chips.
//
// The trigger itself carries a notification dot when the user has pending
// absence approvals — since Пощенска кутия moved inside this menu, the dot is
// the only passive signal that there's work waiting.

type Props = {
  fullName: string;
  roleLabel: string;
  role: "admin" | "manager" | "user";
  pendingAbsenceInbox: number;
};

type MenuItem = { href: Route; label: string; badge?: number };
type MenuGroup = { heading?: string; items: MenuItem[] };

export function UserMenu({ fullName, roleLabel, role, pendingAbsenceInbox }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Build menu groups per role. Managers don't currently have any gated links
  // of their own today — the gating happens page-side via requireRole() — so
  // for now only admins see any of these. This block is the single place that
  // changes when new admin/manager tools ship.
  const groups: MenuGroup[] = [];

  if (pendingAbsenceInbox > 0) {
    groups.push({
      items: [
        {
          href: "/absence/inbox" as Route,
          label: "Пощенска кутия",
          badge: pendingAbsenceInbox,
        },
      ],
    });
  }

  if (role === "admin") {
    groups.push({
      heading: "Потребители",
      items: [
        { href: "/admin/users" as Route, label: "Потребители" },
        { href: "/admin/employees" as Route, label: "Служители" },
      ],
    });
    groups.push({
      heading: "Отсъствия",
      items: [
        { href: "/admin/absence" as Route, label: "Табло" },
        { href: "/admin/calendar" as Route, label: "Работни дни" },
      ],
    });
    // The Лийдове admin group used to host:
    //   - "Парсър" (`/admin/leads/ingest`) — debug paste tool, redundant with
    //     the Resend webhook auto-ingest. Route is still live for ad-hoc
    //     debugging if an admin hits the URL directly.
    //   - "Кошче" (`/admin/leads/trash`) — soft-deleted lead recovery. Hidden
    //     per user direction; the route still works (`/admin/leads/trash`)
    //     so accidental deletes are recoverable by URL when needed.
    groups.push({
      heading: "Имоти",
      items: [
        { href: "/admin/buildings" as Route, label: "Сгради" },
        // "Продавачи" removed: the seller→sellers migration replaced the
        // bulk-normalize tool with rule-based canonicalisation that runs on
        // every write (`lib/properties/sellers-normalize.ts`) plus inline
        // <datalist> autocomplete from existing values. The /admin/sellers
        // route is gone.
        { href: "/admin/duplicates" as Route, label: "CSV дубликати" },
      ],
    });
    groups.push({
      heading: "Фактури",
      items: [{ href: "/admin/invoice-sections" as Route, label: "Секции" }],
    });
    // Renovations catalog — admin manages the activity library + work-team
    // headcounts that drive the create-modal loader + capacity check.
    // See specs/renovations.md §9.
    groups.push({
      heading: "Ремонти",
      items: [
        { href: "/admin/renovations/activities" as Route, label: "Дейности (каталог)" },
        { href: "/admin/renovations/teams" as Route, label: "Екипи" },
      ],
    });
    groups.push({
      items: [{ href: "/admin/audit" as Route, label: "Журнал" }],
    });
  }

  const hasMenu = groups.length > 0;
  // Pill on the trigger when something inside needs attention.
  const showDot = pendingAbsenceInbox > 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => hasMenu && setOpen((x) => !x)}
        aria-haspopup={hasMenu ? "menu" : undefined}
        aria-expanded={hasMenu ? open : undefined}
        className={cn(
          "inline-flex items-center gap-2 px-2 h-8 rounded-lg text-sm text-neutral-600 transition-colors duration-120",
          hasMenu && "hover:bg-neutral-100 cursor-pointer",
          !hasMenu && "cursor-default",
        )}
      >
        <span className="text-neutral-900">{fullName}</span>
        <span className="text-neutral-400">{roleLabel}</span>
        {showDot && (
          <span
            className="inline-block w-2 h-2 rounded-full bg-accent-500"
            aria-label={`${pendingAbsenceInbox} чакащи`}
          />
        )}
        {hasMenu && (
          <span className="text-neutral-400 text-xs" aria-hidden="true">
            ▾
          </span>
        )}
      </button>

      {open && hasMenu && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-dropdown bg-neutral-0 rounded-lg p-2 shadow-popover min-w-56"
        >
          {groups.map((g, gi) => (
            <div key={gi} className={cn(gi > 0 && "mt-2 pt-2 border-t border-neutral-150")}>
              {g.heading && (
                <div className="px-2 pt-1 pb-1 text-xs uppercase tracking-tight text-neutral-500">
                  {g.heading}
                </div>
              )}
              {g.items.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-md text-base text-neutral-700 hover:bg-neutral-50 transition-colors duration-120"
                >
                  <span>{it.label}</span>
                  {it.badge !== undefined && it.badge > 0 && (
                    <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-accent-500 text-neutral-0 text-xs font-medium tabular-nums">
                      {it.badge}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          ))}

          <div className="mt-2 pt-2 border-t border-neutral-150">
            <form action={signOut}>
              <button
                type="submit"
                role="menuitem"
                className="block w-full text-left px-2 py-1.5 rounded-md text-base text-neutral-700 hover:bg-neutral-50 transition-colors duration-120"
              >
                Изход
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
