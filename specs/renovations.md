# Renovations

Project module for post-handover renovation work on units the company has already sold + delivered, with future-ready scope for pre-handover unit-prep work the company does on its own inventory. Phase 2 — depends on Properties (1) and Contacts (2). Not part of Phase 1.

This spec was rewritten to pivot from free-form tasks to a **template-driven activity model**: an admin-managed catalog of activities (each carrying duration-by-apartment-size + a fixed team + a fixed people-required count) gets `cherry-picked` onto each renovation via a checkbox loader; the Gantt then schedules them in catalog order and tracks team capacity day-by-day across the whole portfolio. The source of truth for the initial catalog is `files/Renovations Gantt Chart Activities and Resources/VM Home – дейности и време по обекти в дни-3.xlsx`.

Out of scope for Phase 2 (called out explicitly in §13): client billing, money/budget tracking, materials tracking, common-area building work, predecessor task links / proper PERT scheduling, drag-to-reschedule on the Gantt.

Cross-cutting foundations referenced throughout: `_foundations/ui-patterns-inline-edit.md`, `_foundations/ui-patterns-relations.md`, `_foundations/roles.md`, `_foundations/audit-log.md`, `_foundations/activity-feed.md`, `design-system/tokens.md`, `design-system/tables.md`, `design-system/modals.md`.

## 1. Purpose
After the company hands a unit over to a buyer, the buyer occasionally asks the company back to do renovation work (small repairs, partial refits, full refurbs). This module is the operational home of those projects: who, where, what scope, what timeline, what's the status, which company employee owns the execution.

A project is **one renovation = one property**. Property → Renovations is 1:many (cardinality already declared in `_foundations/ui-patterns-relations.md` §4). A single property can accumulate multiple renovation records over its lifetime; each renovation stands on its own.

Phase 2 scope is operational, not financial — see §13 for the deliberate exclusions.

## 2. Two creation paths (now + future)

**Phase 2 ships path A. Path B is a schema-ready future addition — the model accommodates it from day one so we don't migrate later.**

| Path | Trigger | `requestedByContactId` | Typical status start |
|---|---|---|---|
| A. Owner-requested (Phase 2 primary) | A previous buyer calls in asking for work on their unit. | The buying contact (Property.owner). | `draft` → operator drafts a scope → `quoted` |
| B. Pre-handover unit prep (future) | Internal decision by the company to refresh an inventory unit before listing or handover. | `null` — no external client. | `approved` → straight into execution (no quote step) |

The model supports both because `Renovation.requestedByContactId` is nullable from the start. UI affordances for path B (e.g. a "Вътрешен ремонт" toggle on the create form) will be added in Phase 2.5 when the workflow firms up; the spec mentions them so the schema does not need a migration.

**Explicitly not modelled** (see §13): resale refurbishment of returned units, common-area / building-level work. Both could be retrofitted onto this module but each has its own quirks — defer until the company actually does enough of them to justify the UX.

## 3. Data model

### 3.1 `Renovation`

The parent project row. Title is **not stored** — it's a derived display string `Ремонт — <building.displayName> / <property.name>` rendered at read time. This is the locked decision: with template-driven activities the renovation row is a header for the activity list, so a free-text label only added clutter and naming drift.

| Field | BG label | Type | Notes |
|---|---|---|---|
| `id` | — | UUID PK | — |
| `propertyId` | Имот | FK → Property | Required, the unit the project applies to. Hard-block deletion of the parent property while at least one renovation exists (already declared in `properties.md` §5.3). One renovation may exist concurrently with others on the same property — uncommon but allowed (e.g. a second floor-finish round after a partial refit). |
| `apartmentSize` | Размер | enum (§3.3) | Required. Auto-resolved at create time from `Property.type` when it matches one of the canonical four labels; otherwise the create modal asks the user to pick. Stored on the renovation row so a future change to `Property.type` doesn't shift durations under an in-flight project. |
| `bathroomCount` | Брой бани | int, ≥1 | Required, defaulted from `Property.bathroomCount` at create time (assumes 1 if the source is null). Stored on the renovation so changes to the property after kickoff don't retroactively rebuild the activity list. Used to multiply duration of bathroom activities (see §3.6). |
| `status` | Статус | enum (§3.2) | Required. Defaults to `draft`. |
| `description` | Описание | string?, ≤4000 | Long-form scope description. Plain text only. |
| `requestedByContactId` | Заявител | FK → Contact, nullable | The buyer who asked. `null` for internal pre-handover prep (path B). |
| `managerId` | Отговорник | FK → Profile, nullable | Company employee responsible for execution. Defaults to the creator on insert; assignable to any active profile thereafter. |
| `plannedStartDate` | Планирано начало | date?, optional | User input on create. Anchor for the chain-load (see §5.2). |
| `plannedEndDate` | Планиран край | date?, optional | **Derived + cached** as `MAX(activity.endDate)` across this renovation's non-cancelled activities. Recomputed on every activity write. Read directly by the portfolio Gantt (§5.3) and overdue KPIs (§5.4) so they don't need to join. |
| `actualStartDate` | Реално начало | date?, optional | Auto-stamped when `status` transitions into `in_progress` if blank; editable thereafter. |
| `actualEndDate` | Реално завършване | date?, optional | Auto-stamped when `status` transitions into `done` if blank; editable thereafter. |
| `createdAt`, `updatedAt`, `createdById` | — | system | — |
| `deletedAt` | — | timestamp?, soft-delete | System. |

### 3.2 Renovation statuses
Six states, locked in the original draft round and kept unchanged.

| Value | Bulgarian label | Tone | Meaning |
|---|---|---|---|
| `draft` | Чернова | `neutral` | Operator is still defining the scope; not communicated to the client yet. |
| `quoted` | Оферта | `info` | Scope + indicative timing communicated to the client (verbally or offline). Awaiting acceptance. |
| `approved` | Одобрена | `accent` | Client accepted; work hasn't started yet. Path B (pre-handover) enters here. |
| `in_progress` | В процес | `warning` | Work has started. Triggers auto-stamp of `actualStartDate` if blank. |
| `done` | Завършена | `success` | Work complete. Triggers auto-stamp of `actualEndDate` if blank. |
| `cancelled` | Отказана | `neutral-outline` | Project killed at any point. Captured as a terminal state distinct from `done` for reporting. |

Transitions are open: any state can move to any other. The audit log + per-record status history (§11) capture every transition.

### 3.3 `ApartmentSize` enum

Used by both `Renovation.apartmentSize` and the `ActivityTemplate` duration columns.

| Value | Bulgarian label |
|---|---|
| `studio` | Едностаен |
| `two_room` | Двустаен |
| `three_room` | Тристаен |
| `four_room` | Четиристаен |

The canonical labels match the values the Properties module already uses in `Property.type` (see screenshot in `decisions.md`). If a property's type is something else (Мезонет, Магазин, etc.), the create modal forces the operator to pick one of the four — the catalog only has columns for these four sizes.

### 3.4 `RenovationActivity`

**Replaces the previous `RenovationTask` model entirely.** The renovation activity is a per-renovation instance of an `ActivityTemplate` (§3.6) — at load time it snapshots the template's name, team, people-required, and duration, then carries its own scheduled dates and status independently.

| Field | BG label | Type | Notes |
|---|---|---|---|
| `id` | — | UUID PK | — |
| `renovationId` | — | FK → Renovation | Required. Cascade on parent soft-delete. |
| `templateId` | — | FK → ActivityTemplate, nullable | The template this was loaded from. Nullable because templates are soft-deletable (§3.6) — orphaned activities on completed renovations stay readable. |
| `name` | Дейност | string, ≤200 | **Snapshot** of `template.name` at load time. Editable inline if the operator wants to rename for a specific renovation (e.g. "Гранитогрес — баня 2"). |
| `teamId` | Екип | FK → Team, nullable | **Snapshot** of `template.teamId`. Nullable so an admin who deletes a team doesn't cascade-orphan history. |
| `peopleRequired` | Хора | int, ≥0 | **Snapshot** of `template.peopleRequired`. Editable inline (per-renovation override). |
| `durationDays` | Дни | decimal(4,1), ≥0 | **Snapshot** of `template.duration[apartmentSize] * bathroomMultiplier` (see §3.6). Editable inline. Half-day granularity (0.5 step). |
| `startDate` | Начало | date?, optional | Set by the chain-load (§5.2); editable inline. |
| `endDate` | Край | date?, optional | Set by the chain-load as `startDate + durationDays - 1` (calendar days, working-day calendar deferred); editable inline. |
| `status` | Статус | enum (§3.5) | Required. Defaults to `planned`. |
| `sortOrder` | — | int | Initial value = `template.sortOrder` from the catalog. User-reorderable inline (drag handle). Reordering does **not** auto-reschedule dates — see "Re-chain" button in §6.3. |
| `createdAt`, `updatedAt`, `createdById` | — | system | — |

**Snapshot, not live join, by deliberate decision.** When admin edits a template (e.g. "Гранитогрес/фаянс баня: 2 → 3 people"), in-flight renovations keep the snapshot they were loaded with; only new renovations see the new value. Documented in user-locked answer 14.

### 3.5 Activity statuses
Four states, matching the Excel's `Планирано / Работи се / Завършено` plus a cancelled escape hatch. The user explicitly kept `cancelled` (locked answer 8).

| Value | Bulgarian label | Tone |
|---|---|---|
| `planned` | Планирана | `info` |
| `in_progress` | В процес | `warning` |
| `done` | Завършена | `success` |
| `cancelled` | Отказана | `neutral-outline` |

### 3.6 `ActivityTemplate` (admin-managed catalog)

The catalog admins maintain. Each row is one entry in the activity library that can be loaded onto any renovation.

| Field | BG label | Type | Notes |
|---|---|---|---|
| `id` | — | UUID PK | — |
| `name` | Дейност | string, ≤200 | Required. Free text. |
| `teamId` | Екип | FK → Team, nullable | The team that performs the activity. `null` = "Outsourced — No Team" (zero people deduction, just adds days). |
| `peopleRequired` | Хора | int, ≥0 | Default 0 for outsourced rows. |
| `bathroomMultiplied` | Умножава се по брой бани | bool | When `true`, the duration loaded onto a renovation gets multiplied by `Renovation.bathroomCount`. Set on the 5 bathroom activities seeded from the Excel; see §3.6.1. |
| `durationStudio` | Едностаен (дни) | decimal(4,1), ≥0 | Half-day granularity (0.5 step). Apartment-size-specific duration. |
| `durationTwoRoom` | Двустаен (дни) | decimal(4,1), ≥0 | — |
| `durationThreeRoom` | Тристаен (дни) | decimal(4,1), ≥0 | — |
| `durationFourRoom` | Четиристаен (дни) | decimal(4,1), ≥0 | — |
| `sortOrder` | Ред | int | Order in the catalog AND default order at chain-load. Matches the Excel row order. Admin can reorder via drag handle. |
| `createdAt`, `updatedAt`, `createdById` | — | system | — |
| `deletedAt` | — | timestamp?, soft-delete | System. Soft-deleted templates are hidden from the activity-loader checkbox screen but readable from already-loaded activities (`RenovationActivity.templateId` resolution). |

#### 3.6.1 Bathroom multiplier

Five seeded templates flag `bathroomMultiplied = true` (the bathroom-specific activities from the Excel):

- Хидроизолация баня
- Окачен таван баня
- Монтаж структура баня
- Гранитогрес / фаянс — баня
- Монтаж врата/и — баня

When loaded, `RenovationActivity.durationDays = template.duration[apartmentSize] * renovation.bathroomCount`. So a two-bathroom тристаен apartment getting "Гранитогрес/фаянс баня" loads with 12 × 2 = 24 days. The user explicitly chose this over "load the activity multiple times" (locked answer 7).

#### 3.6.2 Initial seed

Seed script `scripts/seed-renovation-catalog.ts` loads the 29 activities + 8 teams from the Excel on first deploy. Values after the user's corrections (locked answers 1, 2, 3):

| # | Activity | Team | People | Edn | Dvu | Tri | Chet | Bath× |
|---|---|---|---|---|---|---|---|---|
| 1 | Подготовка на обекта | — (outsourced) | 0 | 1 | 1 | 1 | 1 | no |
| 2 | Саморазлична замазка (при нужда) | Шпакловка и боя | 1 | 1 | 1 | 1 | 1 | no |
| 3 | Монтаж гранитогрес — помещения | Гранитогрес | 2 | 3 | 3 | 4 | 5 | no |
| 4 | Промени по ел. инсталация | Електро | 1 | 2 | 2 | 2 | 3 | no |
| 5 | Разводка бойлер | Електро | 1 | 1 | 1 | 1 | 1 | no |
| 6 | Промени по инсталация газ | — (outsourced) | 0 | 2 | 2 | 2 | 2 | no |
| 7 | Окачен таван — помещения, подготовка | Картонаджия | 1 | 0.5 | 0.5 | 1 | 1 | no |
| 8 | Хидроизолация баня | Гранитогрес | 1 | 1 | 1 | 1 | 1 | **yes** |
| 9 | Гипсокартон структура — баня | Картонаджия | 1 | 0.5 | 0.5 | 1 | 1 | no |
| 10 | Окачен таван баня | Картонаджия | 1 | 1 | 1 | 1 | 1 | **yes** |
| 11 | Монтаж структура баня | ВиК | 1 | 1 | 1 | 2 | 2 | **yes** |
| 12 | Фина шпакловка и шкурене | Шпакловка и боя | 1 | 2 | 3 | 3 | 4 | no |
| 13 | Грунд | Шпакловка и боя | 1 | 0.5 | 0.5 | 0.5 | 0.5 | no |
| 14 | Латекс — 1-ва ръка | Шпакловка и боя | 1 | 1 | 2 | 3 | 4 | no |
| 15 | Гранитогрес / фаянс — баня | Гранитогрес | 2 | 8 | 8 | 12 | 12 | **yes** |
| 16 | Сифони монтаж | Гранитогрес | 1 | 1 | 1 | 1 | 1 | no |
| 17 | Монтаж врата/и — баня | — (outsourced) | 0 | 1 | 1 | 2 | 2 | **yes** |
| 18 | Латекс — 2-ра ръка | Шпакловка и боя | 1 | 1 | 1 | 2 | 2 | no |
| 19 | Ламиниран паркет и первази | Ламинат | 0 | 2 | 2 | 3 | 3 | no |
| 20 | Монтаж интериорни врати | — (outsourced) | 0 | 1 | 1 | 1 | 1 | no |
| 21 | Монтаж санитария | Санитария | 1 | 1 | 1 | 2 | 2 | no |
| 22 | Монтаж подпрозоречен камък | Гранитогрес | 1 | 0.5 | 0.5 | 0.5 | 0.5 | no |
| 23 | Монтаж климатици | — (outsourced) | 0 | 1 | 1 | 1 | 1 | no |
| 24 | Монтаж газово котле и радиатори | — (outsourced) | 0 | 2 | 2 | 3 | 3 | no |
| 25 | Монтаж бойлер | ВиК | 0 | 1 | 1 | 1 | 1 | no |
| 26 | Монтаж комарници | — (outsourced) | 0 | 0.5 | 0.5 | 0.5 | 0.5 | no |
| 27 | Монтаж на ел. консумативи | Електро | 1 | 1 | 1 | 1 | 1 | no |
| 28 | Други допълнения | — (outsourced) | 0 | 1 | 1 | 1 | 1 | no |
| 29 | Финално почистване | — (outsourced) | 0 | 1 | 1 | 2 | 2 | no |

### 3.7 `Team` (admin-managed catalog)

| Field | BG label | Type | Notes |
|---|---|---|---|
| `id` | — | UUID PK | — |
| `name` | Име | string, ≤80 | Required, unique among non-deleted rows. Display label e.g. "Team 1", "Гранитогрес", whatever the team is referred to as. |
| `specialty` | Специалност | string, ≤80 | Optional human-readable description (Шпакловка и боя / Ламинат / etc.). |
| `totalPeople` | Общо хора | int, ≥0 | Daily capacity. The capacity check (§8) compares `SUM(activity.peopleRequired)` for any given day across all overlapping non-cancelled activities of all non-cancelled renovations against this number. |
| `createdAt`, `updatedAt`, `createdById` | — | system | — |
| `deletedAt` | — | timestamp?, soft-delete | System. Soft-deleted teams disappear from new templates but `Team` references on existing activities + templates stay readable. |

Three fields by deliberate decision (locked answer 16) — no team-membership table assigning profiles to teams, no per-team-member tracking. The "4 people in Team 1" is just a number; who specifically those 4 people are is not the system's concern.

Seed values from the Excel:

| Name | Specialty | Total people |
|---|---|---|
| Team 1 | Шпакловка и боя | 4 |
| Team 2 | Ламинат | 2 |
| Team 3 | Гранитогрес | 6 |
| Team 4 | Електро | 2 |
| Team 5 | ВиК | 3 |
| Team 6 | Санитария | 3 |
| Team 7 | Картонаджия | 2 |

(There is no `Outsourced — No Team` row in the `Team` table. Templates with `teamId = null` represent outsourced work — duration counts on the Gantt, zero capacity impact.)

## 4. Routes

| Route | Purpose | Roles |
|---|---|---|
| `/renovations` | List view + portfolio Gantt toggle (§5) | All signed-in |
| `/renovations/new` | Create modal (property-pre-fill path also opens it) | All signed-in |
| `/renovations/[id]` | Detail page: activity list + Gantt + capacity overlay | All signed-in; edit gated per §7 |
| `/renovations/[id]/edit` | Full-form edit of the parent renovation header | Admin / Manager / assigned manager |
| `/admin/renovations/activities` | Catalog admin: list/create/edit/soft-delete activity templates | Admin only |
| `/admin/renovations/teams` | Catalog admin: list/create/edit/soft-delete teams | Admin only |

Activity create/edit happens inline on the renovation detail page — no separate routes per activity.

## 5. List + portfolio views

### 5.1 Default list (table view)
Standard Airtable-style table chrome, same as `/properties` and `/contacts`. Default columns:

1. Имот — building displayName + unit name (`<InlineRelationCell>` read-only, click-through)
2. Размер — `Renovation.apartmentSize` rendered via `APARTMENT_SIZE_LABELS`
3. Статус — `<InlineStatusCell>` with the 6 tones
4. Отговорник — `<InlinePersonCell>`, active profiles only
5. Планирано начало → Планиран край — combined cell `02.06.2026 → 18.07.2026`. Right side is derived from activities; cell is `<ReadOnlyBadge>` 🔒.
6. Прогрес — small bar showing % of activities in `done`. Tooltip lists the breakdown.
7. Капацитет — small chip showing the worst capacity overage across this renovation's planned days (e.g. `+2 Team 1` or `OK` in success tone). Empty for `draft` / `cancelled` renovations.
8. Създаден — read-only with 🔒 per `_foundations/ui-patterns-inline-edit.md` §3.12.

Hidden-by-default: Заявител, Реално начало, Реално завършване, Описание (truncated), Брой бани.

**Title column dropped** — the title is derived; the property+unit columns carry the same identity at a glance.

**Filters** (top of table, collapsible, same pattern as other lists):
- Статус (multi-select)
- Размер (multi-select)
- Отговорник (multi-select with "Без отговорник" option)
- Сграда — parses through `property.buildingId`
- Заявител — contact picker, single-select
- Период — date-range over `plannedStartDate`. Useful for "what's scheduled this quarter."
- "Само просрочени" toggle — renovations whose `plannedEndDate < today` and `status ∉ {done, cancelled}`
- "Само с превишен капацитет" toggle — renovations that contribute to any over-capacity day across their planned window (uses the §8 capacity index)

**Search**: ILIKE across the linked property's `name` + the linked contact's `fullName` + `description`. Same Bulgarian-aware behavior as Contacts search.

**Pagination**: 50 per page (renovations are heavier visually than contacts). URL-driven.

### 5.2 Create flow — the activity loader

The pivot lives here. Two entry points open the same multi-step modal:

1. **From `/renovations` → `+ Нов ремонт`** — property + buyer picker fields blank.
2. **From `/properties/[id]` → "Ремонти" relations panel → `+ Нов ремонт`** — `propertyId` pre-filled; `requestedByContactId` pre-filled from `property.owner`; `apartmentSize` auto-resolved from `property.type` when it matches one of the four canonical labels; `bathroomCount` pre-filled from `property.bathroomCount` (defaults to 1 if null).

**Step 1 — Header**:
- Property picker (`<PropertyPicker>` per relations primitives)
- Заявител (`<ContactPicker>`, optional)
- Отговорник (`<ProfilePicker>`, defaults to creator)
- Размер (radio: Едностаен / Двустаен / Тристаен / Четиристаен) — pre-selected when resolvable, mandatory otherwise.
- Брой бани (number input, default 1, min 1) — pre-filled from `property.bathroomCount`.
- Планирано начало (`<InlineDateCell>`-shaped date input) — the anchor for the chain-load; defaults to today.
- Описание (optional textarea).

**Step 2 — Activity loader**:
A checkbox list of all non-soft-deleted activity templates in `sortOrder`. Each row shows:
- Checkbox (initially unchecked)
- Activity name
- Team chip (or "Outsourced" pill)
- People required (`× 2 чов.`)
- Computed duration for the selected `apartmentSize` × (bathroom multiplier if applicable) — e.g. "8 дни" or "16 дни (× 2 бани)"
- A small `?` info icon with the raw per-size durations on hover

A "Избери всички" link selects every row; "Изчисти" clears.

The operator ticks the activities they want. The modal's footer shows a running total: "Маркирани: 18 дейности · общо ~62 дни".

**Step 3 — Confirm + load**:
On submit, the server-side handler:
1. Creates the `Renovation` row with `status = draft`, the user-input `plannedStartDate`, the resolved `apartmentSize` + `bathroomCount`.
2. For each ticked template, inserts a `RenovationActivity` row in template `sortOrder`. The chain-load schedules them sequentially:
   - First activity: `startDate = renovation.plannedStartDate`
   - Each subsequent activity: `startDate = previous.endDate + 1 day`
   - `endDate = startDate + durationDays - 1` (using calendar days; weekends + holidays not excluded in Phase 2)
   - `peopleRequired`, `durationDays`, `name`, `teamId` are snapshots of the template (with bathroom multiplication applied where flagged).
   - `status = planned`, `sortOrder = template.sortOrder`.
3. Computes + caches `renovation.plannedEndDate = MAX(activity.endDate)`.
4. Recomputes the §8 capacity index for the affected date range.

After load the user lands on the detail page with the activity list rendered and the Gantt tab adjacent.

### 5.3 Portfolio Gantt view
Toggleable from `/renovations` — a tab control above the table flips the table out for a Gantt strip. Each row is one renovation; each bar runs from `plannedStartDate` to the cached `plannedEndDate`. Bars are tinted by status using the 6 tones.

Days where any team is over capacity (from §8) get a vertical red tint band across all renovation rows on that day. The viewer scans for the bands first to spot crunch days.

Phase 2 ships a **read-only** portfolio Gantt — drag-to-reschedule is deferred.

Today's date renders as a vertical accent-tone line.

### 5.4 Header KPIs
A 5-tile strip above the list/Gantt, same shape as `/invoices`:

1. **Активни проекти** — count of renovations in `quoted` / `approved` / `in_progress`.
2. **В процес сега** — count in `in_progress`. Subtitle: total open activities in those projects.
3. **Просрочени** — count of renovations with `plannedEndDate < today` and not yet `done` / `cancelled`. Danger tone when non-zero.
4. **Превишен капацитет** — count of upcoming days (today → today+90) where at least one team is over capacity. Danger tone when non-zero. Click → opens the portfolio Gantt scrolled to the first overage day.
5. **Завършени тримесечие** — count moved to `done` in the current calendar quarter.

KPIs respect the active filters (same decision as invoices, `decisions.md` 12.05.2026).

## 6. Detail page

`/renovations/[id]` is the operational home for a single project.

### 6.1 Header block
- Title — **derived display** `Ремонт — <building.displayName> / <property.name>`; not editable.
- Status badge (`<InlineStatusCell>`)
- Three pills: property (link), buyer (link or "—"), responsible manager (avatar + name).
- Размер chip + Брой бани chip — read-only on the renovation row (these are baked in at create time and editing them would invalidate every snapshot duration; if the operator really needs to change them they delete + recreate the renovation).
- Edit button (full-form edit at `/edit`)
- Delete button (admin only)

### 6.2 Dates panel
- Планирано начало (`<InlineDateCell>`) — user-editable; changing this **does not** automatically re-chain existing activities (see §6.3 "Re-chain").
- Планиран край (`<ReadOnlyBadge>` 🔒, derived) — `MAX(activity.endDate)`; recomputed on every activity write.
- Реално начало / Реално завършване (`<InlineDateCell>`, auto-stamped on status transitions to `in_progress` / `done` when blank — see §3.1).

### 6.3 Activities tab (default)
Inline-editable list with one row per `RenovationActivity` in `sortOrder`. Columns:

- Drag handle (reorders `sortOrder`)
- Дейност — `<InlineTextCell>` (snapshot name, editable per-renovation)
- Екип — read-only chip showing the snapshot team (with `<ReadOnlyBadge>` 🔒; team is fixed once loaded)
- Хора — `<InlineNumberCell>` (peopleRequired override)
- Дни — `<InlineNumberCell>` (durationDays override; half-day step)
- Начало → Край — two `<InlineDateCell>`s
- Статус — `<InlineStatusCell>` (4 tones from §3.5)

Toolbar above the list:
- **`+ Добави дейност`** — opens a sub-modal with the same checkbox loader as §5.2 step 2, but only showing templates **not yet loaded** onto this renovation (strict one-of-each per locked answer 7). Newly checked activities append at the end with `startDate = current_last_activity.endDate + 1`.
- **`Преподреди по сегашния ред`** — rechains every activity from the renovation's `plannedStartDate` using the current `sortOrder`. Useful after a drag-reorder or after the user nudges `plannedStartDate`.
- **`Премахни`** (per-row action menu) — soft-deletes the activity row. The cached `plannedEndDate` recomputes.

A footer summary shows: total activities · sum of `peopleRequired × durationDays` (rough effort) · max simultaneous people-required across the whole project window.

### 6.4 Gantt tab
Same data as the activities tab, rendered as horizontal bars indexed by row (one bar per activity) along a time axis. Read-only in Phase 2 (drag-to-reschedule deferred).

**Half-day blocks** (locked answer 6): bar widths render in 0.5-day increments. The axis ticks every 7 days; the bar's visual width is `durationDays × pxPerDay`.

**Bar color**: by activity `status` (planned/info, in_progress/warning, done/success, cancelled/neutral-outline).

**Capacity overlay**:
- Below the bars, a per-team strip (one row per team referenced by this renovation's activities) shows the team's daily load **across the entire portfolio** for the renovation's window. Each cell renders the daily load value; cells exceeding the team's `totalPeople` get a red tint.
- A second visual cue is drawn directly on the activity bars: days that contribute to an over-capacity total get the same red tint band across the bar (same shade as the portfolio Gantt's day-bands).

**Activities not yet completed by their `endDate`** (status ≠ `done` and `endDate < today`): the bar gets a danger-tone left border to flag the slip. Same indicator pattern as overdue tasks.

Today's date renders as a vertical accent line. The time-axis range auto-fits to `[MIN(activity.startDate), MAX(activity.endDate)]` with a 7-day pad on each side. A "Покажи целия проект" toggle expands the range to the renovation's planned start/end (relevant only if some activities have manually-shifted dates outside the renovation envelope).

### 6.5 Связани записи (sidebar)
Per `_foundations/ui-patterns-relations.md`:
- Имот → link + summary chip (building, unit, status badge)
- Заявител → contact summary chip
- Договор (if the property has one) → link with contract number

The reverse direction lives on those records' detail pages (Property → Ремонти tab; Contact → Ремонти tab).

## 7. Permissions
Per `_foundations/roles.md`. Summary:

| Role | Create renovation | Edit own | Edit any | Delete renovation | Manage activity catalog | Manage teams | View |
|---|---|---|---|---|---|---|---|
| admin | ✅ | ✅ | ✅ | ✅ (soft) | ✅ | ✅ | all |
| manager | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | all |
| user | ✅ | only those they're assigned as manager on, or have an activity assigned on | ❌ | ❌ | ❌ | ❌ | all |

`Edit own` for users covers the `status` + per-activity inline cells on renovations where they're the responsible manager or have an activity-team membership. (Activity rows don't have an `assigneeId` — see §3.4 — so the gate is per-renovation, not per-activity.)

**Locked-field behavior** (`_foundations/ui-patterns-inline-edit.md` §3.12): when a user lacks permission, the cell renders disabled with a 🔒 and a Bulgarian tooltip explaining why.

## 8. Capacity tracking

The capacity check is **cross-renovation** (locked answer 11) — aggregated across every non-cancelled renovation in the system.

For any given date `D` and team `T`:

```
loadDT = SUM(activity.peopleRequired)
         over all RenovationActivity rows where
           activity.teamId = T
           AND activity.status != cancelled
           AND activity.renovation.status != cancelled
           AND activity.renovation.deletedAt IS NULL
           AND activity.startDate <= D <= activity.endDate
```

An over-capacity day for team `T` is `loadDT > T.totalPeople`.

**Storage**: there is **no precomputed capacity table**. The query is cheap (indexes on `(teamId, startDate)` + `(teamId, endDate)`) and the data volume is small (one company, maybe ~30 active activities at peak). Capacity is computed on demand by `lib/renovations/capacity.ts` whenever the portfolio Gantt or the renovation detail Gantt renders. The "max overage in next 90 days" KPI (§5.4 #4) caches its result via `unstable_cache` for 5 minutes — KPI staleness on this scale is acceptable.

**Absence module integration**: deliberately none (locked answer 12). The capacity check uses the static `Team.totalPeople`; team members on absence don't reduce the number. Reasoning: the Absence module operates at the individual-profile level, but Teams have no profile-membership table (locked answer 16) — there's no way to subtract a specific person from a specific team's daily capacity. Revisit if and when teams gain a membership table.

**Where the warning surfaces** (locked answer 13):
1. **Red tint** on the per-team strip + on the bars during overage days (renovation detail Gantt).
2. **Red vertical day-band** on the portfolio Gantt (§5.3).
3. **Превишен капацитет** KPI tile (§5.4 #4) showing the count of overage days in the next 90 days.

The "Само с превишен капацитет" filter on `/renovations` (§5.1) lets a manager scope the list to renovations that contribute to any overage day in their planned window — useful for triage.

## 9. Catalog admin pages

### 9.1 `/admin/renovations/activities`
Admin-only. Table view with one row per template, sortable + drag-to-reorder (reorder writes to `sortOrder`). Columns: Дейност, Екип, Хора, Едн / Дву / Три / Четири, "Умножава се по бани" (boolean toggle), Създадена, действия (edit / soft-delete).

Toolbar: `+ Нова дейност` opens a sub-modal with the same fields.

**Edits never propagate** to in-flight renovations — only new chain-loads use the updated values (locked answer 14). The admin UI surfaces this with a hint banner: "Промените се прилагат само върху бъдещи ремонти. Вече заредени дейности запазват своите стойности."

Soft-delete hides the activity from the loader; it stays readable on existing `RenovationActivity` rows.

### 9.2 `/admin/renovations/teams`
Admin-only. Three columns: Име, Специалност, Общо хора + actions. Soft-deletable. Same propagation rule (changes don't retroactively shift capacity; the next render of the Gantt picks up the new number for ALL days — capacity isn't snapshotted on activities, only the team reference is). So adjusting `totalPeople` **does** retroactively affect capacity displays, by design. The Activity snapshot rule applies to per-activity values (people-required, duration); team-capacity numbers are live.

## 10. Audit log
Per `_foundations/audit-log.md` — every mutation logs:

- `renovation.created`
- `renovation.updated` (full-form edits via `/edit`)
- `renovation.field.updated` — granular per-field audit from inline cells. Same shape as the rest of the system.
- `renovation.status_changed`
- `renovation.deleted` (soft)
- `renovation.activity.created` (loader-added or chain-loaded; payload `{ templateId, sortOrder }`)
- `renovation.activity.updated`
- `renovation.activity.status_changed`
- `renovation.activity.deleted` (soft)
- `renovation.activity.reordered` — emitted on drag-reorder; payload `{ before: [...ids], after: [...ids] }`
- `renovation.activity.rechained` — emitted on "Преподреди по сегашния ред"; payload `{ count, fromDate, toDate }`
- `activity_template.created` / `.updated` / `.deleted` (admin actions)
- `team.created` / `.updated` / `.deleted` (admin actions)

Activity-feed integration: the existing `targetType = "renovation"` polymorphic ActivityNote stream surfaces renovation + activity events together; admin-catalog events do **not** surface on per-renovation feeds (they're system-wide, not record-scoped).

## 11. Status history
`RenovationStatusHistory(renovationId, fromStatus, toStatus, authorId, note?, createdAt)` — every status change writes a row. Rendered on the detail page as a chronological vertical timeline under the relations sidebar.

`RenovationActivity.status` changes do **not** get a dedicated history table — the audit log's `renovation.activity.status_changed` entries are sufficient for retrospectives.

## 12. Integration with other modules

| Module | Direction | What |
|---|---|---|
| Properties | inbound | Renovation creation auto-pulls `Property.type` → `Renovation.apartmentSize` (with fallback to a manual picker) and `Property.bathroomCount` → `Renovation.bathroomCount` (defaulting to 1 if null). Deletion of the property is blocked while any renovation exists. |
| Contacts | inbound | A Contact may be the `requestedByContact` of N Renovations. Contact detail page lists them under the existing "Ремонти" tab. |
| Tasks | none | Renovation activities are a separate model; the standalone `/tasks` module never surfaces them. |
| Absence | none | Deliberate non-integration (§8 + locked answer 12). |
| Invoices | future | The `renovation` invoice section is seeded (`scripts/seed-invoice-sections.sql`). Phase 3 will link invoices to renovations for per-project cost tracking. |
| Audit log | outbound | Every mutation logs (§10). |
| Activity feed | outbound + inbound | Renovation + activity events render on the polymorphic ActivityNote stream. |

## 13. Out of scope (Phase 2)

- **Money / budget / actuals.** Cost tracking happens in the invoice module (Phase 3 integration).
- **Materials tracking.** Explicitly excluded by the user — materials don't enter the ERP.
- **Predecessor activity links.** Activities chain by load-time order but carry no `Activity → Activity` "depends on" edges. Manual reorder is supported; automatic dependency propagation is not.
- **Drag-to-reschedule on either Gantt.** Read-only in Phase 2.
- **Working-day / holiday-aware scheduling.** The chain-load uses raw calendar days. A weekend-aware variant + Bulgarian-holiday calendar can be added later without schema changes.
- **Re-snapshotting catalog changes onto in-flight renovations.** Locked answer 14 — admin edits only affect future renovations.
- **Team membership table.** Locked answer 16 — Teams have a `totalPeople` count but no list of which profiles belong. As a consequence, Absence integration is also out (§8).
- **Common-area / building work.** The schema requires `propertyId`; lobby/facade work would need a parallel model or a Property generalization.
- **Resale refurbishment of returned units.** Conceptually fits as a variant of path B; UI not added in v1.
- **On-hold renovation status.** Voted out of the 6-state lifecycle.
- **Bulk operations on renovations or activities.** Same parking decision as the rest of the system.
- **More than one of the same activity per renovation.** Strict one-of-each. The only "multiplicity" is via the bathroom multiplier on the 5 flagged templates (locked answer 7).

## 14. Open questions

None blocking; the user has locked every decision needed to write code.

The one item worth re-checking after early use:

- **Calendar-day vs working-day scheduling.** Currently every duration counts weekends. For a 12-day bathroom-tiling activity that's roughly 2 calendar weeks but ~16 actual work days if you skip weekends. If the team finds the Gantt unrealistic, swap to a working-day calendar in a Phase 2.5 cycle (no schema change — just the chain-load + `endDate` derivation logic moves into `lib/working-days.ts` already present from the Absence module).
