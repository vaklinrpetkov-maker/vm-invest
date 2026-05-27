"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHelp } from "@/components/ui/page-help";
import { PropertyFilters } from "./filters";
import { PropertiesTable, type PropertyRow, type PropertyFieldPermissionsClient } from "./properties-table";
import { BuildingNavigator } from "./building-navigator";
import { BuildingOverviewStrip } from "./building-overview-strip";
import { CreatePropertyModal } from "./create-property-modal";
import type { BuildingOverview, NavigatorNode } from "@/lib/buildings/queries";

type BuildingOpt = { id: string; displayName: string };

type Props = {
  rows: PropertyRow[];
  navigatorTree: NavigatorNode[];
  navigatorTotal: number;
  buildings: BuildingOpt[];
  sellers: string[];
  entrances: string[];
  permissions: PropertyFieldPermissionsClient;
  totalCount: number;
  rangeStart: number;
  rangeEnd: number;
  page: number;
  totalPages: number;
  prevHref: Route | null;
  nextHref: Route | null;
  canExport: boolean;
  exportHref: Route;
  overview: BuildingOverview | null;
  canDelete: boolean;
};

export function PropertiesPageClient(props: Props) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex gap-6">
      <BuildingNavigator tree={props.navigatorTree} totalCount={props.navigatorTotal} />
      <div className="flex-1 space-y-6 min-w-0">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl text-neutral-900">Имоти</h1>
              <PageHelp
                content={
                  <p>
                    Каталог на всички имоти на компанията — апартаменти, гаражи,
                    паркоместа, складове. Навигаторът отляво филтрира по сграда;
                    лентата с филтри отгоре стеснява по статус, тип, етаж, цена и
                    други. Кликни на име на имот, за да отвориш детайла. Полета
                    като статус, тип и продавач са редактируеми директно в
                    таблицата (правата зависят от роля).
                  </p>
                }
              />
            </div>
            <p className="text-base text-neutral-600">
              {props.totalCount === 0 ? (
                "Няма намерени имоти."
              ) : (
                <>
                  Показани {props.rangeStart}–{props.rangeEnd} от {props.totalCount}.
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {props.canExport && (
              <a href={props.exportHref}>
                <Button variant="ghost">Експорт към CSV</Button>
              </a>
            )}
            <Button onClick={() => setCreating(true)}>+ Създай имот</Button>
          </div>
        </div>

        <PropertyFilters sellers={props.sellers} entrances={props.entrances} />

        {props.overview && <BuildingOverviewStrip overview={props.overview} />}

        <PropertiesTable
          rows={props.rows}
          permissions={props.permissions}
          sellerSuggestions={props.sellers}
          canDelete={props.canDelete}
        />

        {props.totalPages > 1 && (
          <nav className="flex items-center justify-between gap-2 pt-1">
            <div className="text-sm text-neutral-500">
              Страница {props.page} от {props.totalPages}
            </div>
            <div className="flex items-center gap-2">
              {props.prevHref ? (
                <Link href={props.prevHref}>
                  <Button variant="secondary" size="sm">
                    ← Предишна
                  </Button>
                </Link>
              ) : (
                <Button variant="secondary" size="sm" disabled>
                  ← Предишна
                </Button>
              )}
              {props.nextHref ? (
                <Link href={props.nextHref}>
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

        <CreatePropertyModal
          buildings={props.buildings}
          open={creating}
          onClose={() => setCreating(false)}
        />
      </div>
    </div>
  );
}
