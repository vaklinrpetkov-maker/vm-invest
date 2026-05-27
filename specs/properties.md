# Properties module

## 1. Purpose
Properties is the **read-focused catalogue** of every unit the company has ever built, sold, or is currently selling — apartments, garages, parking spots, storage rooms, commercial spaces. It exists to answer three questions fast:

1. What do we own / have we built?
2. What's the status of a given unit (available, reserved, sold, owner-occupied, etc.)?
3. Who owns it — which Contact, via which Contract?

The module is **informational, not operational**. Statuses are displayed, not workflow triggers. Changing a status here does not send an email, does not create a task, does not notify anyone. It just updates the record. This is deliberate, per Context.md §2 ("minimal surface area for human error"). The real workflow lives in Contracts → Payments → Installments; Properties is the Airtable-style index that hangs off the side.

Per Context.md §7.4, the module has one active integration point: **when a Contract is created and linked to a Property, that Property's `owner` field is set to the Contract's Contact.** Beyond that, this spec extends the integration slightly: **the Property's `status` is also updated to reflect the contract stage** (e.g. `Депозит → Предварителен договор → Продаден Нот. Акт`). Context.md §7.4 doesn't explicitly commit to the status write — it's a Properties-module decision because otherwise the status field drifts out of sync with the contract lifecycle and users have to keep both in mind. Both writes come *from* Contracts. Properties itself exposes no "sell this unit" button, no "reserve" flow. You edit the record inline if you need to correct something; otherwise contracts drive it.

## 2. Source of truth for structure
The existing property catalogue lives in `/files/Properties/` as a set of CSVs. There is one consolidated file, `all-properties.csv` (~2,158 records, 27 columns), which is the **canonical seed** for migration. The per-building files (асеневци.csv, битоля.csv, …) share the same schema minus the leading `Сграда` column — they are slices of the master, kept for the back-office team's own reference. **Migrate from `all-properties.csv`.** Ignore the per-building files after migration.

Treat the CSV as both the schema reference and the initial seed data.

## 3. Data model

### 3.1 Fields

All field names below map to the CSV columns 1:1 so migration is a direct mapping.

| Field (EN, code) | Label (BG, UI) | Type | Required | Notes |
|---|---|---|---|---|
| `buildingId` | Сграда | FK → Building | yes | FK to the Building record (see §3.3). On migration, each distinct `Сграда` CSV value becomes a Building row; every Property links to one. Not editable inline once set — use the detail-page form. |
| `name` | Име | string | yes | Unit identifier within the building, e.g. `Ап.14`, `Гараж 7`, `ПМ 11`, `Битоля - Апартамент 4 с двор`. Free-form on purpose — the team's naming varies by building and we mirror it. Must be unique within a `building`. |
| `status` | Статус | enum | yes | See §3.4. Default `Свободен` for new records. |
| `entrance` | Вход | string | no | Single character in existing data (`А`, `Б`, `В`, `Г`, `Д`, `Е`) or the literal `Не` (meaning "no entrance / standalone unit"). ~54% of rows are blank. |
| `floor` | Етаж | integer | no | Range in existing data: `-1` to `6`. `-1` = basement/underground. ~35% blank (typical for parking and storage). |
| `type` | Тип | enum | yes | See §3.5. |
| `description` | Описание | string (multiline) | no | Free-text, e.g. `дневна с к.бокс, 2 сп., баня и тераса`. |
| `sellers` | Продавач | `String[]` | no | Legal seller entities on the deed — usually 0 or 1 entries; can hold multiple in co-ownership cases (e.g. a deed naming `VMInvest, Петро Инвест ООД`). vminvest operates through multiple legal entities, and this field captures which one(s). ~70% populated. Free-text labels — **not** a managed entity table — with browser-native autocomplete (`<datalist>`) from existing distinct values when typing. The form input is a single text field; comma-separated values get split, canonicalised via `lib/properties/sellers-normalize.ts`, and de-duplicated on save. See §7.2 for the canonical-name rule set. |
| `expectedPriceEur` | Очаквана цена (EUR) | decimal(12,2) | no | Listing / target price. |
| `priceEur` | Цена (EUR) | decimal(12,2) | no | Actual sale price once sold. |
| `yardTerracePriceEur` | Цена двор/тераса (EUR) | decimal(12,2) | no | Separate line for yards and terraces that are priced apart from the unit itself (common in ground-floor apartments). |
| `priceBgnOriginal` | Цена (BGN, оригинал) | decimal(12,2) | no | Historical — some older deals were quoted in BGN. Read-only in the UI, display only if present. |
| `expectedPriceBgnOriginal` | Очаквана цена (BGN, оригинал) | decimal(12,2) | no | Same — historical only. |
| `yardTerracePriceBgnOriginal` | Цена двор/тераса (BGN, оригинал) | decimal(12,2) | no | Same — historical only. |
| `totalAreaM2` | Квадратура общо | decimal(8,4) | no | Total area including common parts. Store to 4 decimals to preserve CSV precision — deeds quote these to 2 d.p., but the internal calcs (ид.ч, %) run to 4. |
| `commonPartsM2` | Общи части | decimal(8,4) | no | |
| `netAreaM2` | Чиста площ | decimal(8,2) | no | |
| `idealPartsCoef` | Коеф. ид.ч | decimal(8,4) | no | Ideal-parts coefficient — Bulgarian legal concept for shared-ownership allocation. |
| `bathroomCount` | Брой бани | integer | no | |
| `yardM2` | Двор, м2 | decimal(8,2) | no | |
| `terraceM2` | Тераси, м2 | decimal(8,2) | no | |
| `landM2` | Земя, м2 | decimal(8,4) | no | |
| `landPct` | Земя, % | decimal(8,6) | no | Percentage of the plot this unit owns. Stored as decimal (`0.005118` = 0.5118%). Display as % with 4 d.p. |
| `yardPct` | Двор, % | decimal(8,6) | no | Same treatment. |
| `contractLabel` | Договор (описание) | string | no | Legacy free-text contract description from the CSV, e.g. `Румен Цонев Митев- ап.4`. Kept for migration. Once a real contract is linked via `contract` (below), this field is read-only. |
| `hasCredit` | Кредит | boolean | no | Whether the buyer financed with a bank loan. Migrated from `TRUE`/`FALSE`/blank in the CSV (2,068 FALSE, 90 TRUE). Informational only. |
| `buyerLabel` | Купувач (описание) | string | no | Legacy free-text buyer name from the CSV, e.g. `Румен Цонев Митев (Ивет Руменова Иванова)`. Kept for migration. Read-only once `owner` is linked. |
| `owner` | Собственик | contact reference | no | Link to the Contacts module. **Phase-1 interim:** manually editable from the property detail page (any role) via a contact picker, because Contracts doesn't exist yet and otherwise ownership cannot be expressed. **Auto-locks** once a `contract` is linked — from that moment Contracts is the single writer, matching the long-term design. Nullable (for available units, obezshteteni, etc.). |
| `contract` | Договор | contract reference | no | Link to the Contracts module. Stays locked unconditionally in Phase 1 — no Contracts table exists to point at. |
| `createdAt` | Дата на добавяне | timestamp | auto | |
| `createdBy` | Добавен от | user reference | auto | |
| `updatedAt` | Последна промяна | timestamp | auto | |
| `updatedBy` | Последна промяна от | user reference | auto | |

### 3.2 Fields deliberately not modelled
- **No photos or floor-plan uploads in Phase 1.** The team already has these in their drive and doesn't need them duplicated here. Revisit in Phase 2 if requested.
- **No `reservedUntil` date or reservation expiry logic.** Statuses like `Запазен` and `Депозит` are just labels; the team manages follow-up manually. Matches the "no workflow triggers" rule.
- **No price history.** The `expectedPrice` and `price` fields are the only two price points tracked. If a price changes, it's overwritten. The audit log (Context.md §4) captures who changed what when.

### 3.3 Building records

Buildings are their own table, not an enum on Property. Each Property carries a `buildingId` FK. Admins can add, rename, or deactivate buildings from `/admin/buildings` without a deploy — crucial as new projects launch. Renames propagate instantly because everything references the FK, not a string copy.

Seed from the distinct `Сграда` values in `all-properties.csv`. Storage uses the CSV's canonical upper-case Cyrillic form (`СЕРДИКА`, `СУТЕРЕН_ОБЩ`). The display name is **stored separately**, not derived — `СУТЕРЕН_ОБЩ → Сутерен (общ)` is a curated rename, not a title-case transform.

Seed values with record counts from the existing CSV:

| Storage value | Display | Count |
|---|---|---|
| `АСЕНЕВЦИ` | Асеневци | 231 |
| `БИТОЛЯ` | Битоля | 42 |
| `ВЕЛЕКА` | Велека | 24 |
| `ВП_МТМ` | ВП МТМ | 41 |
| `ДОБРУДЖА` | Добруджа | 76 |
| `МАКЕДОНИЯ` | Македония | 64 |
| `МИЗИЯ` | Мизия | 76 |
| `ОХРИД` | Охрид | 87 |
| `ПЛИСКА` | Плиска | 121 |
| `ПРЕСЛАВ` | Преслав | 102 |
| `ПРЕСПА` | Преспа | 41 |
| `СВЕТЛА` | Светла | 54 |
| `СЕРДИКА` | Сердика | 359 |
| `СРЕДЕЦ` | Средец | 65 |
| `СУТЕРЕН_ОБЩ` | Сутерен (общ) | 171 |
| `ТРАКИЯ` | Тракия | 76 |
| `ТРАПЕЗИЦА` | Трапезица | 52 |
| `ТРИАДИЦА` | Триадица | 86 |
| `ЦАРЕВЕЦ` | Царевец | 87 |
| `ШИПКА` | Шипка | 303 |

**Total: 2,158 records.**

#### 3.3.1 Building complexes
Some buildings are physically grouped with a shared structure (usually an underground parking that spans multiple buildings). Users think of these as one location but the units themselves belong to separate buildings. Model this as a `complex` field on the building definition (not on each property), so admins can group buildings in the UI without touching unit records.

**Label convention**: `<Short name> (<members joined by em-dash>)` — short name first because it's what appears in filters and the navigator tree; members listed in parens as a reminder of what the complex covers. Standalone complexes (where short name = the only member) skip the parens.

Seed complexes:

| Complex | Member buildings | Notes |
|---|---|---|
| `ПП (Плиска — Преслав)` | ПЛИСКА, ПРЕСЛАВ | Two adjacent buildings. No separate shared-parking entry — each has its own parking inline. |
| `ЦИТ (Царевец — Трапезица)` | ЦАРЕВЕЦ, ТРАПЕЗИЦА, СУТЕРЕН_ОБЩ | `СУТЕРЕН_ОБЩ` is the shared underground parking. The "ЦИТ" shorthand used in Contacts.md §3.3 refers to this complex. |
| `Сердика` | СЕРДИКА | Parking units live inline in СЕРДИКА — no separate building entry despite the separate CSV file. |
| `МТМ (Мизия — Тракия — Македония)` | МИЗИЯ, ТРАКИЯ, МАКЕДОНИЯ, ВП_МТМ | `ВП_МТМ` is the shared parking complex. The "МТМ" shorthand in Contacts.md §3.3 refers to this complex. |

All other buildings stand alone. A building belongs to zero or one complex. Complex membership is purely a grouping hint for filters and the building navigator (§4.1) — it has no effect on data model constraints.

#### 3.3.2 Reconciliation with Contacts.md
Contacts.md §3.3 currently ships with a hardcoded 18-value `BUILDINGS` constant in `lib/contacts/constants.ts`. **This is replaced by a runtime Building lookup in Phase 1, at the same time Properties ships** — no two-sources-of-truth window. Concretely:

1. The Building table is populated from the Properties migration (§7.1).
2. The Contacts `building` field switches from "free string validated against hardcoded list" to "FK → Building" (same pattern as Property).
3. `lib/contacts/constants.ts BUILDINGS` is deleted. The contacts UI loads building options from the Building table instead.

Legacy values in existing contact data are mapped as follows:
- `МТМ` → contacts tagged only with the complex get their `building` cleared and a note in the audit log (`Мигриран от комплекс МТМ — присвои сграда ръчно`). There's no way to auto-pick which member building (МИЗИЯ vs ТРАКИЯ vs МАКЕДОНИЯ vs ВП_МТМ) the contact belongs to.
- `ЦИТ` → same treatment; cleared with audit note for the ЦИТ complex.
- `Манастирски ливади` → Sofia district, not a vminvest building. Clear the field; log an audit note `Не е сграда на VM invest — изчистено при миграция.`

Users won't type the building field manually — it's auto-populated from Contracts links. Admins maintain the list via `/admin/buildings` (§3.3.3).

#### 3.3.3 Building record

| Field (EN, code) | Label (BG, UI) | Type | Required | Notes |
|---|---|---|---|---|
| `id` | — | uuid | yes | Referenced by `Property.buildingId`. |
| `storageName` | Системно име | string | yes | Upper-case Cyrillic, e.g. `СЕРДИКА`. Unique. This is the value migrated from the CSV `Сграда` column. |
| `displayName` | Име (показване) | string | yes | Curated label shown in UI and navigator, e.g. `Сердика`, `Сутерен (общ)`. Editable by admins. |
| `complex` | Комплекс | string, nullable | no | Complex label (see §3.3.1). Null for standalone buildings. Stored as a free string on the Building row to match "any admin can add a new complex" behaviour. |
| `active` | Активна | boolean | yes | Default `true`. Deactivation hides the building from the navigator and "create property" form but keeps historical records intact. |
| `createdAt`, `updatedAt` | — | timestamp | auto | |

Admin CRUD lives at `/admin/buildings` — a small table page similar in scope to `/admin/absence/anomalies`. Users don't see it. Deleting a building is blocked if any Property references it; admins deactivate instead.

### 3.4 `status` enum
Ordered by frequency in current data. Storage value = Bulgarian canonical string. These are **labels only** — no workflow triggers, no emails, no tasks.

1. `Продаден Нот. Акт` — Sold, notary deed signed. Terminal state.
2. `Свободен` — Available. Default.
3. `Предварителен договор` — Preliminary contract signed, notary deed not yet executed. The majority of sold-but-not-yet-deeded inventory.
4. `Обезщетение` — Compensation unit — given to the land owner as part of the plot-acquisition deal. Never for sale.
5. `Запазен` — Reserved informally (no deposit yet).
6. `Депозит` — Deposit paid, awaiting preliminary contract.
7. `Отложена продажба` — Sale postponed / on hold.
8. `Отказал се` — Buyer withdrew. Does not auto-revert to `Свободен` — kept as its own state for traceability; admin manually flips it to `Свободен` once the unit is back on the market.

All roles (admin, manager, user) can change a property's status. Only admins and managers can add, rename, or deactivate statuses in the enum itself — that's a config action, not a record edit. Renames propagate to all records.

Each status gets a color chip in the table, mapped to a design-system tone (see `./design-system/tokens.md`). The tone name is what the implementation consumes; the visual description is the design intent:

| Status | Tone | Visual |
|---|---|---|
| `Продаден Нот. Акт` | `neutral` | grey — settled, no attention |
| `Свободен` | `success` | green |
| `Предварителен договор` | `accent` | warm amber, the project's accent — active sales pipeline |
| `Обезщетение` | `info` | purple — special class, not for sale |
| `Запазен` | `warning-soft` | light amber |
| `Депозит` | `warning` | amber |
| `Отложена продажба` | `neutral-outline` | grey with dashed border |
| `Отказал се` | `danger` | red-muted |

### 3.5 `type` enum
Storage = Bulgarian canonical string. Seed from CSV (record counts in parens):

1. `Гараж` — garage (608)
2. `Друго` — other / uncategorized (606). Mostly older records where no type was assigned; accept as-is, don't force recategorization during migration. Note: 28% of inventory sits here, so filtering by a specific type (e.g. `Двустаен`) will miss real two-bedroom units hidden under `Друго`. This is expected — don't surprise users with it, just flag in onboarding.
3. `Двустаен` — two-room apartment (328)
4. `Тристаен` — three-room (172)
5. `ВПМ` — external parking space (143)
6. `ПМ` — parking space (79)
7. `Едностаен` — one-room / studio (73)
8. `Мазе` — basement storage (71)
9. `Четиристаен` — four-room (47)
10. `Апартамент` — generic apartment (12)
11. `Склад` — warehouse/storage (9)
12. `Офис` — office (8)
13. `Многостаен` — multi-room / 5+ rooms (1)

Counts sum to **2,157** — the 2,158th row has a blank `Тип` in the CSV (same row as the blank `Статус` flagged in §7.2). During migration, import that row with `type = Друго` and flag in the audit log for admin review. `type` remains `required: yes` on the schema — only the migration tolerates the single exception.

Admins can add/rename/deactivate. No cross-validation that a type matches floor or area — the team has enough edge cases (lofts, maisonettes, commercial units) that rigid rules would just cause friction.

## 4. Views

### 4.1 Table view (list)
Airtable-style table, all properties, sortable and filterable. This is the landing view for the module.

**Building navigator** (left sidebar, ~220px, collapsible):
- Grouped by complex, then building, with record counts in parentheses.
- `Всички` at the top — shows all buildings, no filter. Default.
- Clicking a complex filters the table to all member buildings.
- Clicking a building filters to that building.
- Collapse/expand per complex.

This is the primary way the team navigates. They think in terms of buildings, not a flat list of 2,000+ units.

**Table columns**, default left to right:

1. Сграда
2. Име
3. Статус
4. Тип
5. Етаж
6. Вход
7. Собственик (shows linked contact name, or `—` if unlinked)
8. Чиста площ
9. Цена (EUR)

**Hidden-by-default columns** (toggleable via a `Колони` menu): Описание, Продавач, Очаквана цена, Цена двор/тераса, Квадратура общо, Общи части, Коеф. ид.ч, Брой бани, Двор м2, Тераси м2, Земя м2, Земя %, Двор %, Кредит, Договор (описание), Купувач (описание), Договор (свързан), Дата на добавяне, Последна промяна.

**Default sort**: Сграда asc, then Име natural sort (so `Ап.2` comes before `Ап.10` — numeric-aware, not lexical).

**Filters** (top of table, collapsible):
- Статус (multi-select)
- Тип (multi-select)
- Вход (multi-select — only shows options for the currently-filtered buildings)
- Етаж (range slider, -1 to 10)
- Продавач (multi-select from existing values)
- Цена EUR (range)
- Чиста площ (range)
- Има собственик (yes / no / any) — quick toggle for "show me only sold units" / "show me only available"
- Кредит (yes / no / any)

**Search** (single input, top-right): fuzzy match across `name`, `description`, `seller`, `contractLabel`, `buyerLabel`, and the linked owner's `fullName`. Case-insensitive `ILIKE` — same approach as Contacts. Bulgarian Cyrillic rarely carries diacritics, so no special diacritic handling.

**Row click** → opens the property's detail page (§4.2). If the row has a linked `owner`, an icon in the Собственик cell opens the Contact profile directly without going through the property page.

**Inline edit**: status, type, seller, expectedPrice, description are directly editable from the table (click cell → edit → save on blur). Everything else goes through the detail page. Inline-edit cells respect §5.2 role restrictions — when the current user lacks write access to a field (e.g. a user hovering over `Продавач` or a price cell), the cell is read-only with a tooltip `Нямаш права да променяш това поле.`. Locked fields (`owner`, `contract`, `buyerLabel` and `contractLabel` when a real contract exists) are visually muted with a lock icon — tooltip: `Това поле се попълва от модул Договори.`

**Bulk actions**: none in Phase 1. Matches Contacts.md's deliberate stance — the team is non-technical and bulk ops carry the most risk.

**Empty / loading**: skeleton rows on load. Empty filtered result shows `Няма намерени имоти` with an `Изчисти филтрите` button.

**Export**: admin-only `Експорт към CSV` button, top-right. Exports the current filtered view. Useful for sharing inventory slices with brokers and for ad-hoc reporting until the Dashboard module lands.

### 4.2 Property detail page
Opened by clicking a row. URL-addressable (`/properties/[id]`).

**Header block**
- Сграда › Име breadcrumb (e.g. `Сердика › Ап.14`)
- Status badge (color-coded per §3.4)
- Quick-action buttons: `Редактирай`, `Отвори собственика` (only if linked), `Отвори договора` (only if linked), overflow menu (`Изтрий` — admin only)

**Details panel** (left column, ~1/3 width). Fields from §3.1 grouped into sections:
- **Основни** — building, name, status, type, entrance, floor
- **Описание** — description
- **Площи** — totalAreaM2, commonPartsM2, netAreaM2, bathroomCount, yardM2, terraceM2, landM2, landPct, yardPct, idealPartsCoef
- **Цена** — expectedPriceEur, priceEur, yardTerracePriceEur, plus the three BGN historical fields if populated
- **Правни** — seller, hasCredit, contractLabel (legacy), buyerLabel (legacy)
- **Връзки** — owner (linked Contact), contract (linked Contract)
- **Метаданни** — createdAt/By, updatedAt/By

**Relations panel** (right column, ~2/3 width, tabbed). Only show tabs that have at least one record:
- **Договор** — the linked contract, if any. Shows contract number, dates, total value, and a link to the Contracts module.
- **Собственик** — card view of the linked contact (name, phone, email, type) + link to their profile.
- **Ремонти** — list of renovations associated with this property (from the Renovations module, Phase 2 dependency).
- **История на статуса** — chronological log of status changes (see §4.3).

### 4.3 Status history
Since statuses are informational and change infrequently (a typical unit goes `Свободен → Запазен → Депозит → Предварителен договор → Продаден Нот. Акт` over months), keep a simple append-only log per property: timestamp, user, old status, new status, optional note.

Surfaces on the detail page under the **История на статуса** tab. Not exposed in the table view. Status changes driven by the Contracts module are tagged with the contract ID so the team can trace "why did this go to Предварителен договор on 12.03.2026?" back to the source.

### 4.4 Building overview strip (optional, Phase 1.5)
When the user drills into a single building via the navigator, show an optional header strip with aggregates:
- Total units
- Breakdown by status (stacked bar or pill row)
- Breakdown by type
- Available count (prominent)
- Sum of `priceEur` for sold units

Pure read. Useful for sales asking "how many units left in Сердика?" without building a dashboard. Make it collapsible, with the collapsed/expanded state remembered per user.

## 5. Create / Edit / Delete

### 5.1 Creation
**Manual create**, `+ Създай имот` button, top-right of the table view. Opens a form modal.

Required: `building`, `name`, `type`, `status` (defaults to `Свободен`). Everything else optional.

Duplicate detection runs on blur of `name` within the selected `building`: if a property with the same name exists in that building, hard-block with inline error `Имот с това име вече съществува в [сграда].` — this one is strict because `(building, name)` is the effective unique identifier.

**Who can create**: all roles (admin, manager, user). Matches Contacts.md's "everyone can create" stance — new units occasionally come up in sales conversations (e.g. a compensation unit that wasn't originally in the catalogue) and blocking users would just create friction.

### 5.2 Edit
Inline editing in the detail page's details panel and in the table (for the fields listed in §4.1). Click → edit → save on blur or Enter, cancel on Esc. Every change writes to the audit log and, for status changes, to the status history (§4.3).

**Implementation note.** The table-cell inline-edit primitives are the canonical foundation cells from `_foundations/ui-patterns-inline-edit.md` (`<InlineStatusCell>` for Статус + Тип, `<InlineTextCell>` for Продавач — with the `suggestions` prop wired to the distinct-sellers list for browser-native autocomplete, `<InlineMultilineCell>` for Описание, `<InlineNumberCell>` for Цена EUR + Очаквана цена — `disabled` toggles by `canWritePrices`). The earlier `app/(app)/properties/inline-cell.tsx` mode-switcher + the matching `updatePropertyField` switchboard server action were retired during the inline-edit foundation rollout — every editable column now hits a per-field server action in `app/(app)/properties/field-actions.ts` (`setPropertyType`, `setPropertyDescription`, `setPropertySellers`, `setPropertyPriceEur`, `setPropertyExpectedPriceEur`) plus `status-actions.ts` (`setPropertyStatus`, which also writes the status-history row inside the same transaction). The `<InlineOwnerCell>` is intentionally kept as a module-local primitive — it uses `<ContactPicker>` for the searchable contact relation, which doesn't map onto the generic foundation cells.

CSV-imported and system-managed columns surface visibly via `<ReadOnlyBadge>` (🔒) with a Bulgarian tooltip explaining where the value comes from — see `_foundations/ui-patterns-inline-edit.md` §3.12.

**Locked fields** (populated by the Contracts module, not editable here):
- `owner` — linked Contact. **Phase-1 exception:** editable from the detail page via a contact picker (any role), because the Contracts module doesn't exist yet and otherwise there's no way to express ownership. Auto-locks once a contract is linked (§3.1).
- `contract` — linked Contract. Unconditionally locked in Phase 1 (no Contracts table).
- `buyerLabel` (once `owner` is populated)
- `contractLabel` (once `contract` is populated)

Hover on the lock icon: `Това поле се попълва от модул Договори.`

**Who can edit what**:
- Admin: all fields.
- Manager: all fields.
- User: all fields **except** `seller` and the price fields (`expectedPriceEur`, `priceEur`, `yardTerracePriceEur`, and the three BGN historical fields). Those are admin/manager only because they affect legal and financial records.
- `owner` (when unlocked) — editable by every role. The legal-action concern doesn't apply here because owner assignment is reversible and audited; restricting it would force admins to touch every property during migration cleanup.
- Locked fields (`contract`, `buyerLabel`/`contractLabel` when a link exists, and `owner` once a contract is linked) are read-only for everyone — they're populated exclusively by the Contracts module.

### 5.3 Delete
Admin only. Hard-block deletion if the property has any of: a linked contract, a linked owner, or any renovations. Status history alone doesn't block — a manually-created property whose status flipped once is still safe to delete, because no legal trail is at stake yet.

Error message: `Имотът не може да бъде изтрит, защото има свързан договор/собственик/ремонт. Ако наистина искаш да го премахнеш, първо изтрий свързаните записи.`

For records with no such links, deletion shows a confirm modal and proceeds. The property record is soft-deleted (per the project's audit-trail pattern); status-history rows stay on the deleted record.

**Why this criterion**: the concern is orphaning a contract and losing the legal trail. As long as no contract or owner points at the property, deletion is safe. If a unit was entered by mistake but has a contract already wired, change status to `Отложена продажба` with a note instead.

## 6. Validation
- `name` unique within `building` — hard block (§5.1).
- Numeric fields (`totalAreaM2`, `netAreaM2`, `priceEur`, etc.): non-negative. Inline error, non-blocking — matches Contacts.md's tolerance, because historical data has anomalies.
- `floor`: integer in `[-3, 20]`. Blank allowed.
- `bathroomCount`: integer in `[0, 10]`. Blank allowed.
- Prices: if both `expectedPriceEur` and `priceEur` are set and `priceEur` > `expectedPriceEur` × 1.20, show a soft warning `Цената е значително по-висока от очакваната. Провери.` — non-blocking.
- No cross-field validation on area fields (e.g. `netAreaM2` + `commonPartsM2` ≈ `totalAreaM2`). The CSV has enough floating-point drift that strict enforcement would flag ~30% of records. Revisit in Phase 2 if needed.

## 7. Migration plan

### 7.1 Seed data
1. Parse `all-properties.csv` (**Windows-1251 encoded**). Verified by reading the file as raw bytes: the first 6 bytes are `D1 E3 F0 E0 E4 E0` — that's `С г р а д а` in CP-1251 (`Сграда`). In UTF-8 the same Cyrillic string would start `D0 A1 D0 B3 …` (two bytes per char). Decode at import using Node's built-in `new TextDecoder("windows-1251").decode(bytes)` before parsing CSV. Reading naïvely as UTF-8 produces one U+FFFD replacement per Cyrillic byte, collapses many buildings into the same mojibake string, and silently corrupts the import.
2. Create building records for each distinct `Сграда` value, assigning to the four complexes per §3.3.1.
3. Create property records — map columns 1:1 per §3.1.
4. For the 1,349 records with a populated `Купувач` field: store the raw string in `buyerLabel`. **Do not attempt to auto-link to Contacts during migration.** That's Phase 2 work, done manually by the back-office team once Contracts is live — the CSV buyer strings are too free-form (e.g. `Весела Янкова Станчева, Николай Константинов Станчев`) to auto-match reliably without false positives.
5. Same for `ДОГОВОРИ` column → `contractLabel`.
6. Set `createdAt` to migration timestamp, `createdBy` to the `Система` pseudo-user.
7. Initial status history entry per property: `null → [current status]`, authored by `Система`, with note `Мигриран от CSV`.

### 7.2 Data quirks to preserve
- **One record has a blank status and blank type.** Import as-is with `Свободен` and `Друго` respectively, flagged in the audit log so the admin can review (see §3.5).
- **`Тип = Друго` on 606 records.** Preserve; don't heuristically recategorize.
- **BGN prices** populate only where the original deal was quoted in BGN (pre-Euro transition pricing). Preserve exactly.
- **`Продавач` was a 69-variant mess** — e.g. `Сердика пропърти` vs `Сердика Пропърти Инвестмънт ЕООД`, `Пулев` vs `Пулев Инвест` vs `Пулевинвест`, `Росед ПропъртиЕООД` vs `Росед Пропърти`, `Яско Про сървис ЕООД` vs `Яско Про Сървиз`, `VMInvest` vs `ВМИнвест`. **Resolved in the seller→sellers migration:** the column type changed from `String?` to `String[]`, and `lib/properties/sellers-normalize.ts` carries canonical rules (substring-match, first-match-wins, case-insensitive):
  - any `Сердика пропърти` substring → `Сердика пропърти`
  - `Пулев` / `Pulev` → `Pulev Invest Group`
  - `Росед` → `Росед Пропърти ЕООД`
  - `Яско Про` → `Яско Про Сървиз`
  - `ВМ Инвест` / `VM Invest` / `VMInvest` → `VMInvest`
  - everything else: trimmed pass-through

  Comma-separated values like `VMInvest, Петро Инвест ООД` are split into two entries in the array. Normalization runs on every write (CSV import, in-form edit) so newly typed variants get auto-fixed. Long-tail values that match no rule (Хоумновейт, Друго, Росестейт, etc.) survive untouched — they're cleaned by inline editing on the property table (the `<datalist>` autocomplete from existing values nudges admins toward the canonical form).

  The previous `/admin/sellers` bulk-merge screen was retired alongside this migration since rule-based canonicalisation on every write makes it redundant for the typo cases that motivated it.
- **Numeric precision is silently truncated on import.** Some CSV columns carry up to 9 decimal places (e.g. `Земя, %` values like `0.049026611`). The storage types in §3.1 are deliberately coarser (`decimal(8,4)` for area, `decimal(8,6)` for `%` fields) because internal calcs don't need that precision and deeds quote to 2 d.p. anyway. The migration truncates trailing digits without a warning — this is accepted, not a bug. If a future feature needs the full precision back, bump the column type and re-import from the CSV (kept in `/files/Properties/` for exactly this reason).

### 7.3 Verification
The CSV has **2,158 rows** but only **1,847 distinct `(Сграда, Name)` pairs** — 311 rows are duplicates (same apartment listed twice, typically with different status/price data representing two sales cycles of the same unit). The migration uses the natural key `(buildingId, name)` as unique, so after import the database holds **1,847 property records**, not 2,158. The second occurrence of each duplicate wins (updates overwrite the first insert). The duplicates are skewed toward СЕРДИКА (81), ШИПКА (80), ЦАРЕВЕЦ (38) and a handful of others — see the migration's end-of-run log for the full breakdown.

Per-building counts post-migration (the real ones, not the raw CSV row counts from §3.3):

| Building | Post-migration count | CSV row count (§3.3) | Delta |
|---|---|---|---|
| АСЕНЕВЦИ | 231 | 231 | 0 |
| БИТОЛЯ | 42 | 42 | 0 |
| ВЕЛЕКА | 24 | 24 | 0 |
| ВП_МТМ | 41 | 41 | 0 |
| ДОБРУДЖА | 58 | 76 | −18 |
| МАКЕДОНИЯ | 49 | 64 | −15 |
| МИЗИЯ | 60 | 76 | −16 |
| ОХРИД | 72 | 87 | −15 |
| ПЛИСКА | 102 | 121 | −19 |
| ПРЕСЛАВ | 89 | 102 | −13 |
| ПРЕСПА | 41 | 41 | 0 |
| СВЕТЛА | 54 | 54 | 0 |
| СЕРДИКА | 278 | 359 | −81 |
| СРЕДЕЦ | 65 | 65 | 0 |
| СУТЕРЕН_ОБЩ | 171 | 171 | 0 |
| ТРАКИЯ | 60 | 76 | −16 |
| ТРАПЕЗИЦА | 52 | 52 | 0 |
| ТРИАДИЦА | 86 | 86 | 0 |
| ЦАРЕВЕЦ | 49 | 87 | −38 |
| ШИПКА | 223 | 303 | −80 |
| **Total** | **1,847** | **2,158** | **−311** |

If we later decide the duplicate CSV rows represent legitimately separate line items (e.g. re-sales where the first sale should stay on record), the fix is to rename one side of each duplicate (e.g. `Ап.1 → Ап.1-v2`) and re-import — the schema supports unlimited rows per building as long as `name` differs.

Audit checks: run the migration script's end-of-run summary (per-building / per-status / per-type counts) against this table.

## 8. Tooltips (Context.md §2)
Non-obvious UI elements, Bulgarian:
- `Статус` column header → `Текущото състояние на имота. Промените тук са само за информация — не изпращат имейли и не създават задачи.`
- `Собственик` field → `Свързва се автоматично при подписване на договор в модул Договори.`
- `Договор (описание)` → `Старо описание на договора от предишния списък. Новите договори се създават в модул Договори.`
- `Коеф. ид.ч` → `Коефициент на идеалните части — дял от общите части на сградата.`
- `ВПМ` type → `Външно паркомясто.`
- `ПМ` type → `Паркомясто.`
- Locked-field lock icon → `Това поле се попълва от модул Договори.`
- Building complex pill in navigator → `Сгради, които са физически свързани (общ сутерен или паркинг).`
- `Продавач` → `Юридическото лице или физическо лице, което продава имота (на чието име е нотариалният акт).`

## 9. Phase 1 / Phase 2 split

**Phase 1 (ship this):**
- Table view with building navigator, all filters and search
- Property detail page with details and (empty) relations panel
- Manual create/edit/delete for admins and managers
- Inline editing (all roles can edit, with field-level restrictions per §5.2)
- CSV migration from `all-properties.csv`
- Status history log
- Building and complex admin management at `/admin/buildings` (§3.3.3)
- Contacts reconciliation per §3.3.2 — delete the hardcoded `BUILDINGS` constant in `lib/contacts/constants.ts`, switch the Contacts `building` field to an FK on the same Building table, and migrate legacy `МТМ` / `ЦИТ` / `Манастирски ливади` contact values with audit notes
- Admin-only CSV export
- All tooltips

**Phase 1.5 (small follow-up screen, ships with or shortly after Phase 1):**
- ~~`Продавач` normalization screen~~ — shipped then retired. Replaced by rule-based canonicalisation on every write (see §7.2 + §3.1 `sellers`); the dedicated admin screen is no longer needed and has been removed from the menu.
- Building overview aggregates (§4.4), if demand warrants

**Phase 2 (after Contracts, Renovations exist):**
- `owner` and `contract` auto-population from Contracts module
- Relations panel tabs populated (Договор, Собственик, Ремонти)
- Manual linking of legacy `buyerLabel` → Contact records via a dedicated back-office screen
- Photo and floor-plan uploads, if requested

**Explicitly out of scope** (Context.md §9 reinforced):
- No public-facing property listing
- No price history beyond current + expected
- No reservation timers or auto-expiry
- No status-change notifications or email triggers
- No availability calendar or booking flow
