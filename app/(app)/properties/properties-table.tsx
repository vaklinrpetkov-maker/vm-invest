"use client";

import Link from "next/link";
import type { Route } from "next";
import { ColumnPicker, useColumnVisibility } from "@/components/ui/column-picker";
import { DeleteRowButton } from "@/components/ui/delete-row-button";
import { InlineMultilineCell } from "@/components/ui/inline-multiline-cell";
import { InlineNumberCell } from "@/components/ui/inline-number-cell";
import {
  InlineStatusCell,
  type StatusOption,
} from "@/components/ui/inline-status-cell";
import { InlineTextCell } from "@/components/ui/inline-text-cell";
import { ReadOnlyBadge } from "@/components/ui/read-only-badge";
import { Table, TBody, THead, TH, TR, TD, TableEmpty } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import {
  PROPERTY_STATUSES,
  PROPERTY_STATUS_TONES,
  PROPERTY_TYPES,
  type PropertyStatus,
  type PropertyType,
} from "@/lib/properties/constants";
import {
  setPropertyDescription,
  setPropertyExpectedPriceEur,
  setPropertyPriceEur,
  setPropertySellers,
  setPropertyType,
} from "./field-actions";
import { deleteProperty } from "./actions";
import { InlineOwnerCell } from "./inline-owner-cell";
import { setPropertyStatus } from "./status-actions";

// Table shape resolved server-side and passed in. Keeping all primitives as
// plain JSON-serialisable values so the client boundary is clean.
export type PropertyRow = {
  id: string;
  buildingDisplayName: string;
  buildingId: string;
  name: string;
  status: string;
  type: string;
  entrance: string | null;
  floor: number | null;
  description: string | null;
  sellers: string[];
  expectedPriceEur: string | null;
  priceEur: string | null;
  yardTerracePriceEur: string | null;
  priceBgnOriginal: string | null;
  expectedPriceBgnOriginal: string | null;
  yardTerracePriceBgnOriginal: string | null;
  totalAreaM2: string | null;
  commonPartsM2: string | null;
  netAreaM2: string | null;
  idealPartsCoef: string | null;
  bathroomCount: number | null;
  yardM2: string | null;
  terraceM2: string | null;
  landM2: string | null;
  landPct: string | null;
  yardPct: string | null;
  contractLabel: string | null;
  buyerLabel: string | null;
  hasCredit: boolean | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
  contractId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PropertyFieldPermissionsClient = {
  canWritePrices: boolean;
  canWriteSeller: boolean;
};

type ColumnKey =
  | "building"
  | "name"
  | "status"
  | "type"
  | "floor"
  | "entrance"
  | "owner"
  | "netArea"
  | "priceEur"
  | "description"
  | "sellers"
  | "expectedPriceEur"
  | "yardTerracePriceEur"
  | "totalArea"
  | "commonParts"
  | "idealCoef"
  | "bathrooms"
  | "yardM2"
  | "terraceM2"
  | "landM2"
  | "landPct"
  | "yardPct"
  | "hasCredit"
  | "contractLabel"
  | "buyerLabel"
  | "createdAt"
  | "updatedAt";

type ColumnDef = {
  key: ColumnKey;
  label: string;
  defaultVisible: boolean;
};

const COLUMNS: ColumnDef[] = [
  { key: "building", label: "Сграда", defaultVisible: true },
  { key: "name", label: "Име", defaultVisible: true },
  { key: "status", label: "Статус", defaultVisible: true },
  { key: "type", label: "Тип", defaultVisible: true },
  { key: "floor", label: "Етаж", defaultVisible: true },
  { key: "entrance", label: "Вход", defaultVisible: true },
  { key: "owner", label: "Собственик", defaultVisible: true },
  { key: "netArea", label: "Чиста площ", defaultVisible: true },
  { key: "priceEur", label: "Цена (EUR)", defaultVisible: true },
  { key: "description", label: "Описание", defaultVisible: false },
  { key: "sellers", label: "Продавач", defaultVisible: true },
  { key: "expectedPriceEur", label: "Очаквана цена", defaultVisible: false },
  { key: "yardTerracePriceEur", label: "Цена двор/тераса", defaultVisible: false },
  { key: "totalArea", label: "Квадратура общо", defaultVisible: false },
  { key: "commonParts", label: "Общи части", defaultVisible: false },
  { key: "idealCoef", label: "Коеф. ид.ч", defaultVisible: false },
  { key: "bathrooms", label: "Брой бани", defaultVisible: false },
  { key: "yardM2", label: "Двор м2", defaultVisible: false },
  { key: "terraceM2", label: "Тераси м2", defaultVisible: false },
  { key: "landM2", label: "Земя м2", defaultVisible: false },
  { key: "landPct", label: "Земя %", defaultVisible: false },
  { key: "yardPct", label: "Двор %", defaultVisible: false },
  { key: "hasCredit", label: "Кредит", defaultVisible: false },
  { key: "contractLabel", label: "Договор (описание)", defaultVisible: false },
  { key: "buyerLabel", label: "Купувач (описание)", defaultVisible: false },
  { key: "createdAt", label: "Добавен", defaultVisible: false },
  { key: "updatedAt", label: "Последна промяна", defaultVisible: false },
];

const STORAGE_KEY = "properties:visible-columns";

// Status options for the inline cell — driven by PROPERTY_STATUSES constant
// plus the canonical tone map. Mirrors the leads + tasks status-options arrays.
const PROPERTY_STATUS_OPTIONS: ReadonlyArray<StatusOption<PropertyStatus>> =
  PROPERTY_STATUSES.map((value) => ({
    value,
    label: value,
    tone: PROPERTY_STATUS_TONES[value],
  }));

// Type is a non-colored enum per `ui-patterns-inline-edit.md` §3.2 — reuse
// InlineStatusCell with neutral tones across the board (same approach
// Contacts uses for the "Тип" column).
const PROPERTY_TYPE_OPTIONS: ReadonlyArray<StatusOption<PropertyType>> =
  PROPERTY_TYPES.map((value) => ({
    value,
    label: value,
    tone: "neutral",
  }));

function formatNum(v: string | null): string {
  if (v === null) return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n.toLocaleString("bg-BG", { maximumFractionDigits: 4 });
}

function formatMoney(v: string | null): string {
  if (v === null) return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n.toLocaleString("bg-BG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPct(v: string | null): string {
  if (v === null) return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return (n * 100).toLocaleString("bg-BG", { maximumFractionDigits: 4 }) + "%";
}

function decimalStringToNumber(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type Props = {
  rows: PropertyRow[];
  permissions: PropertyFieldPermissionsClient;
  // Distinct sellers across all properties — fed into <InlineTextCell> as
  // <datalist> suggestions so the user gets autocomplete when typing.
  sellerSuggestions: readonly string[];
  // Admin-only row delete affordance (R12).
  canDelete: boolean;
};

export function PropertiesTable({ rows, permissions, sellerSuggestions, canDelete }: Props) {
  const { state: visible, toggle } = useColumnVisibility(STORAGE_KEY, COLUMNS);
  const visibleCount = Object.values(visible).filter(Boolean).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <ColumnPicker columns={COLUMNS} visible={visible} onToggle={toggle} />
      </div>

      <Table>
        <THead>
          <TR hover={false}>
            {COLUMNS.map(
              (c) =>
                visible[c.key] && (
                  <TH
                    key={c.key}
                    align={
                      c.key === "priceEur" ||
                      c.key === "expectedPriceEur" ||
                      c.key === "yardTerracePriceEur" ||
                      c.key === "netArea" ||
                      c.key === "totalArea" ||
                      c.key === "commonParts" ||
                      c.key === "idealCoef" ||
                      c.key === "bathrooms" ||
                      c.key === "yardM2" ||
                      c.key === "terraceM2" ||
                      c.key === "landM2" ||
                      c.key === "landPct" ||
                      c.key === "yardPct" ||
                      c.key === "floor"
                        ? "right"
                        : "left"
                    }
                  >
                    {c.key === "status" ? (
                      <span title="Текущото състояние на имота. Промените тук са само за информация — не изпращат имейли и не създават задачи.">
                        {c.label}
                      </span>
                    ) : (
                      c.label
                    )}
                  </TH>
                ),
            )}
            {canDelete && <TH align="right" className="w-10" />}
          </TR>
        </THead>
        <TBody>
          {rows.length === 0 && (
            <TableEmpty colSpan={visibleCount + (canDelete ? 1 : 0)}>Няма намерени имоти.</TableEmpty>
          )}
          {rows.map((r) => (
            <TR key={r.id}>
              {visible.building && (
                <TD muted className="text-sm">{r.buildingDisplayName}</TD>
              )}
              {visible.name && (
                <TD>
                  <Link
                    href={`/properties/${r.id}` as Route}
                    className="text-neutral-900 hover:text-accent-700 transition-colors duration-120"
                  >
                    {r.name}
                  </Link>
                </TD>
              )}
              {visible.status && (
                <TD>
                  <InlineStatusCell
                    value={r.status as PropertyStatus}
                    options={PROPERTY_STATUS_OPTIONS}
                    onSave={(next) => setPropertyStatus(r.id, next)}
                  />
                </TD>
              )}
              {visible.type && (
                <TD>
                  <InlineStatusCell
                    value={r.type as PropertyType}
                    options={PROPERTY_TYPE_OPTIONS}
                    onSave={(next) => setPropertyType(r.id, next)}
                  />
                </TD>
              )}
              {visible.floor && (
                <TD muted numeric>
                  {r.floor ?? <span className="text-neutral-400">—</span>}
                  <ReadOnlyBadge reason="Етажът се задава при създаване / редакция от пълната форма на имота." />
                </TD>
              )}
              {visible.entrance && (
                <TD muted>
                  {r.entrance ?? <span className="text-neutral-400">—</span>}
                  <ReadOnlyBadge reason="Входът се задава при създаване / редакция от пълната форма на имота." />
                </TD>
              )}
              {visible.owner && (
                <TD muted>
                  <InlineOwnerCell
                    propertyId={r.id}
                    initialOwner={
                      r.ownerId
                        ? {
                            id: r.ownerId,
                            fullName: r.ownerName ?? "",
                            phone: r.ownerPhone,
                            email: r.ownerEmail,
                          }
                        : null
                    }
                    canEdit={r.contractId === null}
                    lockMessage={
                      r.contractId !== null
                        ? "Това поле се попълва от модул Договори."
                        : null
                    }
                  />
                </TD>
              )}
              {visible.netArea && (
                <TD muted numeric>
                  {r.netAreaM2 ? formatNum(r.netAreaM2) : <span className="text-neutral-400">—</span>}
                  <ReadOnlyBadge reason="Чистата площ се задава при създаване / редакция от пълната форма на имота." />
                </TD>
              )}
              {visible.priceEur && (
                <TD numeric>
                  <InlineNumberCell
                    value={decimalStringToNumber(r.priceEur)}
                    onSave={(v) => setPropertyPriceEur(r.id, v)}
                    format="currency-eur"
                    min={0}
                    disabled={!permissions.canWritePrices}
                  />
                </TD>
              )}
              {visible.description && (
                <TD muted className={cn("text-sm", "max-w-xs")}>
                  <InlineMultilineCell
                    value={r.description}
                    onSave={(v) => setPropertyDescription(r.id, v)}
                  />
                </TD>
              )}
              {visible.sellers && (
                <TD muted className="text-sm">
                  <InlineTextCell
                    // The inline cell speaks strings, so we join the array
                    // with ", " for display + edit. Server-side
                    // `parseSellerInput` splits + canonicalises on save.
                    value={r.sellers.length === 0 ? null : r.sellers.join(", ")}
                    onSave={(v) => setPropertySellers(r.id, v)}
                    placeholder="напр. VMInvest, Pulev Invest Group"
                    suggestions={sellerSuggestions}
                    disabled={!permissions.canWriteSeller}
                    maxLength={500}
                  />
                </TD>
              )}
              {visible.expectedPriceEur && (
                <TD numeric>
                  <InlineNumberCell
                    value={decimalStringToNumber(r.expectedPriceEur)}
                    onSave={(v) => setPropertyExpectedPriceEur(r.id, v)}
                    format="currency-eur"
                    min={0}
                    disabled={!permissions.canWritePrices}
                  />
                </TD>
              )}
              {visible.yardTerracePriceEur && (
                <TD muted numeric>
                  {r.yardTerracePriceEur ? (
                    formatMoney(r.yardTerracePriceEur)
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                  <ReadOnlyBadge reason="Цената за двор/тераса се задава от пълната форма на имота." />
                </TD>
              )}
              {visible.totalArea && (
                <TD muted numeric>
                  {r.totalAreaM2 ? formatNum(r.totalAreaM2) : <span className="text-neutral-400">—</span>}
                  <ReadOnlyBadge reason="Площта се задава от пълната форма на имота." />
                </TD>
              )}
              {visible.commonParts && (
                <TD muted numeric>
                  {r.commonPartsM2 ? formatNum(r.commonPartsM2) : <span className="text-neutral-400">—</span>}
                  <ReadOnlyBadge reason="Общите части се задават от пълната форма на имота." />
                </TD>
              )}
              {visible.idealCoef && (
                <TD muted numeric>
                  {r.idealPartsCoef ? formatNum(r.idealPartsCoef) : <span className="text-neutral-400">—</span>}
                  <ReadOnlyBadge reason="Коефициентът на идеалните части се задава от пълната форма на имота." />
                </TD>
              )}
              {visible.bathrooms && (
                <TD muted numeric>
                  {r.bathroomCount ?? <span className="text-neutral-400">—</span>}
                  <ReadOnlyBadge reason="Броят бани се задава от пълната форма на имота." />
                </TD>
              )}
              {visible.yardM2 && (
                <TD muted numeric>
                  {r.yardM2 ? formatNum(r.yardM2) : <span className="text-neutral-400">—</span>}
                  <ReadOnlyBadge reason="Дворната площ се задава от пълната форма на имота." />
                </TD>
              )}
              {visible.terraceM2 && (
                <TD muted numeric>
                  {r.terraceM2 ? formatNum(r.terraceM2) : <span className="text-neutral-400">—</span>}
                  <ReadOnlyBadge reason="Терасите се задават от пълната форма на имота." />
                </TD>
              )}
              {visible.landM2 && (
                <TD muted numeric>
                  {r.landM2 ? formatNum(r.landM2) : <span className="text-neutral-400">—</span>}
                  <ReadOnlyBadge reason="Земята се задава от пълната форма на имота." />
                </TD>
              )}
              {visible.landPct && (
                <TD muted numeric>
                  {r.landPct ? formatPct(r.landPct) : <span className="text-neutral-400">—</span>}
                  <ReadOnlyBadge reason="Процентът земя се задава от пълната форма на имота." />
                </TD>
              )}
              {visible.yardPct && (
                <TD muted numeric>
                  {r.yardPct ? formatPct(r.yardPct) : <span className="text-neutral-400">—</span>}
                  <ReadOnlyBadge reason="Процентът двор се задава от пълната форма на имота." />
                </TD>
              )}
              {visible.hasCredit && (
                <TD muted>
                  {r.hasCredit === true ? "Да" : r.hasCredit === false ? "Не" : <span className="text-neutral-400">—</span>}
                  <ReadOnlyBadge reason="Маркерът за кредит идва от модул Договори." />
                </TD>
              )}
              {visible.contractLabel && (
                <TD muted className="text-sm max-w-xs truncate">
                  {r.contractLabel ?? <span className="text-neutral-400">—</span>}
                  {r.contractId !== null && (
                    <ReadOnlyBadge reason="Това поле се попълва от модул Договори." />
                  )}
                </TD>
              )}
              {visible.buyerLabel && (
                <TD muted className="text-sm max-w-xs truncate">
                  {r.buyerLabel ?? <span className="text-neutral-400">—</span>}
                  {r.ownerId !== null && (
                    <ReadOnlyBadge reason="Това поле се попълва от модул Договори." />
                  )}
                </TD>
              )}
              {visible.createdAt && (
                <TD muted numeric className="text-sm">
                  {r.createdAt}
                  <ReadOnlyBadge reason="Системно поле, попълва се автоматично." />
                </TD>
              )}
              {visible.updatedAt && (
                <TD muted numeric className="text-sm">
                  {r.updatedAt}
                  <ReadOnlyBadge reason="Системно поле, попълва се автоматично." />
                </TD>
              )}
              {canDelete && (
                <TD align="right">
                  <DeleteRowButton
                    label={`имот „${r.name}"`}
                    onDelete={() => {
                      const fd = new FormData();
                      fd.set("id", r.id);
                      return deleteProperty(fd);
                    }}
                  />
                </TD>
              )}
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
