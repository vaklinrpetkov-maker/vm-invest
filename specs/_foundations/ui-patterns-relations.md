# UI Pattern: Relations (Linked Records)

## 1. Purpose
A shared specification for how records in one module link to records in another — and how those links are surfaced, navigated, and edited across the system. This is the vminvest ERP equivalent of monday.com's "Connected Boards" feature, adapted to our data model.

Every module that references another module (Contact → Contracts, Property → Contact, Contract → Property, Lead → Contact, etc.) uses this pattern. Written once here, referenced from each module spec.

## 2. Principles
1. **Links are bidirectional by default.** If A links to B, B automatically shows a mirror link to A. Users never set up the relationship twice.
2. **Navigation preserves context.** Users can explore linked records without leaving the current view. Full navigation is always available as a secondary option.
3. **Many-to-many is the default shape.** Constraints (1:1, 1:many) are enforced on top, not via different field types. From the user's perspective, a relation field is always "a list of connected things."
4. **The link is live data.** Editing a linked record from a preview updates it everywhere instantly. No stale copies.

## 3. The relation field

### 3.1 What it looks like
A relation field in a table view renders as one or more **pills** inside the cell. Each pill shows the primary display value of the linked record (e.g. a contact's `fullName`, a property's `Сграда › Име`, a contract's number). Pills are color-tagged where the linked entity has a status or type that carries color meaning (see §3.4).

Empty relation fields show `—` in muted text. Fields with overflow (more than ~3 pills in the cell) collapse to `[pill 1] [pill 2] +N още` where `+N още` is a clickable counter that expands the full list in the side panel.

On the detail page, relations get their own tabbed section (as already specified in Contacts.md §4.2 and Properties.md §4.2). The pattern there is the same — list of pills, click for preview, click-through for full record.

### 3.2 How linking works
**Adding a link**: click the relation cell (or the `+ Добави` button in the detail-page relations panel). A searchable picker opens inline, scoped to the target entity. User types to filter, picks a record, pill appears. Multiple selections allowed unless the field is declared 1:1.

**Removing a link**: hover the pill, click the `×`. Soft confirm if the removal would leave the other side orphaned in a way that matters (e.g. removing the last Contact from a Contract — warn, don't block).

**Creating a new linked record from the picker**: if the search returns no matches, the picker shows `+ Създай нов [entity]` at the bottom. Clicking opens the creation modal for that entity, scoped to the minimum required fields. Once created, the new record is auto-linked to the current one and the picker closes.

This "create from picker" path is critical for fluid data entry. A sales rep entering a new Contract should not have to navigate away, create the Contact, come back, and re-start the Contract.

### 3.3 The side-panel preview
Clicking a pill does **not** navigate away. It opens a right-side panel (~40% viewport width on desktop, full-screen on mobile) showing the linked record's details.

**Contents of the preview:**
- Header with the record's primary display value and status/type badges.
- The same details panel from that entity's detail page — read-only by default, editable inline where the user has permission.
- Quick actions relevant to that entity (e.g. for a Contact: `Обади се`, `Изпрати имейл`; for a Contract: `Отвори плащанията`).
- A `Отвори` button top-right that takes the user to the full detail page for that record if they want to go deeper.

**Closing the preview** returns to the original view with state preserved — same scroll position, same filters, same inline-edit state on the row the user was working on.

**Preview stacking**: if a user clicks a pill inside a preview (linked Property inside a Contract preview), a second preview layer stacks on top. Breadcrumb at the top of the stacked preview shows the chain (`Иван Петров › C-2024-041 › Сердика Ап.14`). Max depth 3 — deeper than that, force full navigation.

### 3.4 Mirror columns (derived data)
Once two entities are linked, the relation field on either side can optionally pull specific fields from the linked record into the current view as **mirror columns**. These are read-only display columns, never editable from the source side.

**Configuration**: on the table's "Колони" menu, under the relation column, admins see a sub-menu `+ Огледални колони`. Pick a field from the linked entity, pick an aggregation if the relation is many-sided. Examples:
- On the Contacts table, mirror `Обща стойност на договорите` (sum of linked Contracts' `totalValue`).
- On the Contacts table, mirror `Последен договор` (latest linked Contract's signing date).
- On the Properties table, mirror `Телефон на собственика` (from linked Contact).

**Aggregations supported** when the relation is 1:many or many:many:
- `сума` — sum (numeric fields only)
- `среден` — average (numeric only)
- `брой` — count (any field)
- `най-ранен` / `най-късен` — min/max date
- `първи` / `последен` — first/last by created or updated timestamp
- `списък` — concatenated list, comma-separated

For 1:1 relations, no aggregation — the mirrored field is just pulled through.

**Performance note**: mirror columns are computed on query, cached per row. Expensive aggregations (e.g. sum across thousands of Payments) get flagged in the admin panel with a one-line warning so they know which views might slow down. Not a user-facing concern in Phase 1.

### 3.5 Cardinality constraints
Relation fields declare cardinality on both sides:

| Notation | Meaning | Example |
|---|---|---|
| 1:1 | Each side has at most one | Contract ↔ primary signing Contact |
| 1:many | One parent, many children | Contact → Leads |
| many:1 | Inverse of 1:many | Lead → Contact |
| many:many | Either side can have many | Contract ↔ Contacts (co-buyers), Property ↔ Renovations |

**Enforcement**: attempting to exceed a `1` cardinality shows an inline error: `Този запис вече е свързан с [name]. Искаш ли да замениш връзката?` with buttons `Замени` and `Отказ`. Never silent overwrite.

**Soft constraints**: some relations are technically many:many but have a "primary" concept (e.g. a Contract has a primary Contact, even if there are co-buyers). Model this with a separate `primary` boolean on the join record, surfaced as a star icon in the UI. One star per relation at a time, clicking another pill's star moves the primary designation.

## 4. Module-specific relations

The canonical relations for the vminvest ERP. Written here so every module spec can just reference this table.

| From | To | Cardinality | Primary field name | Mirror fields typically shown |
|---|---|---|---|---|
| Contact | Lead | 1:many | `leads` | count of open leads, latest lead date |
| Contact | Contract | many:many | `contracts` | sum of total value, list of contract numbers, latest signing date |
| Contact | Meeting | 1:many | `meetings` | count, next scheduled date |
| Contact | Property | many:many (via Contract) | `properties` | list of `Сграда › Име` |
| Lead | Contact | many:1 | `contact` | phone, email |
| Lead | Meeting | 1:many | `meetings` | count, next scheduled |
| Meeting | Lead | many:1 | `lead` | status |
| Contract | Contact | many:many | `contacts` | primary contact name, phone |
| Contract | Property | 1:many | `properties` | list of units, total area |
| Contract | Payment | 1:many | `payments` | sum, next due date, overdue count |
| Property | Contact | many:many (via Contract) | `owner` | phone, email |
| Property | Contract | many:1 | `contract` | contract number, signing date |
| Property | Renovation | 1:many | `renovations` | count active, latest status |
| Payment | Contract | many:1 | `contract` | contract number |
| Payment | Installment | 1:many | `installments` | sum, count, overdue flag |
| Renovation | Property | many:1 | `property` | building, unit name |
| Renovation | RenovationTask | 1:many | `tasks` | count open, % complete. RenovationTask is a **separate model** from the standalone `Task` module — see `renovations.md` §3.4. |
| Task | User | many:many | `assignees` | — |

New modules should be added to this table before their spec is finalized.

## 5. Permissions on relations
A relation field respects the permissions of both endpoints:

- **View**: user sees the pill only if they have read access to the linked entity. If they don't, the pill renders as `[Ограничен достъп]` with no click behavior.
- **Edit (add/remove links)**: user can modify the relation only if they have edit permission on the *owning* side. Adding a Contract to a Contact requires edit permission on Contact.
- **Preview content**: the side-panel preview applies the linked entity's own permissions. A user with edit access on Contacts but not on Contracts can see a linked Contract in preview (read-only), but can't edit fields inside it.

Per the vminvest role model (Context.md §7.2, and updated permissions in Contacts.md / Properties.md):
- All roles can view and edit most relations.
- Contract and Payment links are created only through their respective modules' workflows, not through free-form picker (see §6 below).

## 6. Links that are not user-created
Some relations are **system-managed** and cannot be edited by users through the picker:

- `Property.owner` and `Property.contract` — populated only when a Contract is created/amended in the Contracts module. Visible everywhere as pills, but read-only with the lock icon pattern (Properties.md §5.2).
- `Contact.properties` — derived from their Contracts. Displayed, not edited directly.
- `Payment.contract` — set at Payment creation, immutable afterwards.

The picker for these relations shows the existing link (if any) but no `+ Добави` button and no `×` on existing pills. Clicking an existing pill still opens the preview as normal.

Tooltip on the field: `Тази връзка се управлява автоматично от модул [X].`

## 7. Tooltips
- Relation pill → `Кликни за преглед, кликни "Отвори" за пълния запис.`
- Empty relation field → `Няма свързани записи.`
- `+ Огледални колони` menu → `Добави колона с данни от свързания модул.`
- System-managed relation → `Тази връзка се управлява автоматично от модул [X].`
- Primary star icon → `Основен контакт/имот за този запис.`

## 8. Out of scope (Phase 1)
- **No reverse-auto-creation.** Linking a Contact to a non-existent Contract requires creating the Contract explicitly — we don't auto-create skeleton records on the other side.
- **No cross-module bulk linking.** Users can't "link all selected Contacts to this Contract" in bulk. Matches the broader "no bulk actions in Phase 1" rule.
- **No complex join filters.** Filtering a Contacts list by "has an overdue Payment" requires the dashboard module, not the relation field itself. Phase 2.
- **No custom relation types.** Admins can't define new relations between entities without a deploy. The table in §4 is the closed set for Phase 1.
