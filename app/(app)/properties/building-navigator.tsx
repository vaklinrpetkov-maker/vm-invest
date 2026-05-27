"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { NavigatorNode } from "@/lib/buildings/queries";

// Left-sidebar navigator: complexes (collapsible) → buildings. Clicking a
// building or complex updates the URL (`?building=<id>` or `?complex=<name>`)
// and lets the server page re-render the list. Collapsed state persists to
// localStorage per-user.

const STORAGE_KEY = "properties:nav-collapsed";

function buildHref(params: URLSearchParams): Route {
  const qs = params.toString();
  return (qs ? `/properties?${qs}` : "/properties") as Route;
}

export function BuildingNavigator({
  tree,
  totalCount,
}: {
  tree: NavigatorNode[];
  totalCount: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setCollapsed(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collapsed));
    } catch {
      /* ignore */
    }
  }, [collapsed, hydrated]);

  const activeBuilding = params.get("building") ?? "";
  const activeComplex = params.get("complex") ?? "";
  const anySelected = activeBuilding.length > 0 || activeComplex.length > 0;

  function selectAll() {
    const p = new URLSearchParams(params.toString());
    p.delete("building");
    p.delete("complex");
    p.delete("page");
    router.push(buildHref(p));
  }

  function selectComplex(name: string) {
    const p = new URLSearchParams(params.toString());
    p.delete("building");
    p.delete("page");
    p.set("complex", name);
    router.push(buildHref(p));
  }

  function selectBuilding(id: string) {
    const p = new URLSearchParams(params.toString());
    p.delete("complex");
    p.delete("page");
    p.set("building", id);
    router.push(buildHref(p));
  }

  function toggleCollapse(key: string) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  }

  return (
    <aside className="w-[220px] shrink-0">
      <nav className="text-sm">
        <button
          type="button"
          onClick={selectAll}
          className={cn(
            "flex items-center justify-between w-full px-2 py-1.5 rounded-md text-left",
            !anySelected ? "bg-accent-50 text-accent-700" : "text-neutral-700 hover:bg-neutral-100",
          )}
        >
          <span className="font-medium">Всички</span>
          <span className="text-neutral-500 tabular-nums">{totalCount}</span>
        </button>

        <div className="mt-2 space-y-1">
          {tree.map((node) => {
            const key = node.complex ?? "__standalone__";
            const isCollapsed = collapsed[key] === true;
            const isComplexActive = node.complex !== null && activeComplex === node.complex;

            if (node.complex === null) {
              // Standalone buildings — list directly, no complex header.
              return (
                <div key={key} className="pt-2 border-t border-neutral-150">
                  <div className="px-2 py-1 text-xs uppercase tracking-tight text-neutral-500">
                    Самостоятелни
                  </div>
                  {node.buildings.map((b) => (
                    <button
                      type="button"
                      key={b.id}
                      onClick={() => selectBuilding(b.id)}
                      className={cn(
                        "flex items-center justify-between w-full px-2 py-1 rounded-md text-left",
                        activeBuilding === b.id
                          ? "bg-accent-50 text-accent-700"
                          : "text-neutral-700 hover:bg-neutral-100",
                      )}
                    >
                      <span>{b.displayName}</span>
                      <span className="text-neutral-500 tabular-nums">{b.propertyCount}</span>
                    </button>
                  ))}
                </div>
              );
            }

            return (
              <div key={key} className="space-y-0.5">
                <div
                  className={cn(
                    "flex items-center justify-between w-full rounded-md",
                    isComplexActive ? "bg-accent-50" : "",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => selectComplex(node.complex!)}
                    className={cn(
                      "flex-1 flex items-center px-2 py-1.5 text-left",
                      isComplexActive ? "text-accent-700 font-medium" : "text-neutral-900",
                    )}
                    title="Сгради, които са физически свързани (общ сутерен или паркинг)."
                  >
                    <span className="truncate">{node.complex}</span>
                  </button>
                  <span className="px-2 text-neutral-500 tabular-nums text-xs">
                    {node.complexTotal}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleCollapse(key)}
                    className="px-2 py-1.5 text-neutral-500 hover:text-neutral-700"
                    aria-label={isCollapsed ? "Разгъни" : "Сгъни"}
                  >
                    {isCollapsed ? "+" : "–"}
                  </button>
                </div>
                {!isCollapsed && (
                  <div className="pl-3 space-y-0.5">
                    {node.buildings.map((b) => (
                      <button
                        type="button"
                        key={b.id}
                        onClick={() => selectBuilding(b.id)}
                        className={cn(
                          "flex items-center justify-between w-full px-2 py-1 rounded-md text-left",
                          activeBuilding === b.id
                            ? "bg-accent-50 text-accent-700"
                            : "text-neutral-600 hover:bg-neutral-100",
                        )}
                      >
                        <span>{b.displayName}</span>
                        <span className="text-neutral-500 tabular-nums text-xs">
                          {b.propertyCount}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}

// Re-export for type-safety at use sites that don't want to drill through
// lib/buildings/queries.
export type { NavigatorNode };
// `Link` kept imported for potential future usage (e.g. when the navigator
// becomes a server component with `prefetch={false}`).
void Link;
