# Contacts module

## 1. Purpose
Contacts is the **root object** of the system. Every lead, meeting, contract, payment, installment, and renovation attaches to a Contact. Every person or company the company ever interacts with — clients, land owners, brokers, subcontractors, walk-ins, cold phone enquiries — lives here.

This is the team's shared address book and the entry point into every client's history.

## 2. Source of truth for structure
The existing contact list lives in `/files/Contacts/Contacts.csv` (~1,270 records). The module must replicate that structure and migrate the existing data on launch. Treat the CSV as both the schema reference and the initial seed data.

## 3. Data model

### 3.1 Fields

| Field (EN, code) | Label (BG, UI) | Type | Required | Notes |
|---|---|---|---|---|
| `fullName` | Име | string | yes | Can be a person or a company (e.g. `Оренда България ЕООД (Петя Божкова-Димитрова)`). No separate company field — keep it one string to match existing data. |
| `type` | Тип | enum | yes | See §3.2. |
| `phone` | Телефон | string (E.164) | no | Store with country code (`+359...`, `+49...`, `+34...` all appear in existing data). Bulgarian formatting on display. |
| `email` | Имейл | string | no | Unique is **not** enforced — the same email can belong to multiple contacts (e.g. a family member handling a relative's account). |
| `birthDate` | Дата на раждане | date | no | DD.MM.YYYY on display. |
| `age` | Възраст | integer | derived | Computed from `birthDate`. Never stored, never editable. |
| `birthdayThisYear` | Рожден ден тази година | date | derived | Computed from `birthDate`. Used for upcoming-birthday views. |
| `egn` | ЕГН | string(10) | no | Bulgarian personal ID. Validate checksum on input (see §6). Companies use ЕИК in the same field (existing data mixes both); accept either 9- or 10-digit values. |
| `address` | Адрес | string (multiline) | no | Free-text, single field. |
| `owner` | Отговорник | user reference | no | The team member primarily responsible for this contact. Dropdown of active users. |
| `building` | Сграда | multi-select | no | Which of the company's buildings this contact owns property in. See §3.3. |
| `properties` | Имоти | string (multiline) | no | Free-text list of the specific apartments/garages/parking spots. **Phase 1: free text** to match CSV. Phase 2: link to the Properties module (see Context.md §7.4) once it exists — contracts will populate this automatically. |
| `contractLabel` | Договор | string | no | Legacy free-text contract description from the CSV. Kept for migration; once the Contracts module is live this field is read-only and new contracts come from there. |
| `notes` | Допълнителни бележки | string (multiline) | no | Free-text quick notes. Distinct from the activity feed (§4.2). |
| `createdAt` | Дата на добавяне | date | auto | Set on create. |
| `createdBy` | Добавен от | user reference | auto | Whoever clicked "Създай контакт" or whose inbox triggered the auto-create. |
| `updatedAt` | Последна промяна | timestamp | auto | For sort/audit. |

### 3.2 `type` enum (values ordered by frequency in current data)
Store the Bulgarian strings as the canonical values (that's what the CSV uses and what the team thinks in). Dropdown on input.

1. Клиент
2. Електронно запитване
3. Наш човек
4. Телефонно запитване
5. Обезщетен собственик
6. VIP Клиент
7. Собственик на парцел
8. Сфера на влияние
9. ПАРТНЬОР
10. От Брокер
11. Брокер
12. Подизпълнител
13. Архитект
14. Бохем и творец
15. Вещо лице
16. Система *(reserved — system-generated contacts, e.g. from inbound email parsing when no match found; not selectable by users)*

The list is **editable by admins** (add/rename/deactivate) without a deploy. Renames propagate to existing contacts.

### 3.3 `building` values
Seed the dropdown from the CSV's distinct buildings. Admins can add new ones as projects launch:

Сердика, МТМ, Царевец, Плиска, Триадица, Преслав, Трапезица, Охрид, ЦИТ, Шипка, Преспа, Битоля, Светла, Велека, Средец, Асеневци, Добруджа, Манастирски ливади.

Multi-select because existing data has contacts tied to multiple buildings (e.g. `Трапезица, ЦИТ`).

## 4. Views

### 4.1 Table view (list)
Airtable-style table, all contacts, sortable and filterable. Default columns, left to right:

1. Име
2. Тип
3. Телефон
4. Имейл
5. Отговорник
6. Сграда
7. Дата на добавяне (sort desc by default — newest first)

**Hidden-by-default columns** (toggleable via a "Колони" menu): ЕГН, Адрес, Възраст, Рожден ден тази година, Имоти, Бележки.

**Filters** (top of table, collapsible):
- Тип (multi-select)
- Отговорник (multi-select, with "Без отговорник" option — 89% of rows have none today)
- Сграда (multi-select)
- Дата на добавяне (date range)
- Рождени дни през следващите N дни (number input, default empty)

**Search** (single input, top-right): fuzzy match across `fullName`, `phone`, `email`, `egn`, `properties`, `notes`. Bulgarian-aware (case- and diacritic-insensitive).

**Bulk actions**: none in Phase 1. Deliberate — the team is non-technical and bulk ops are the highest-risk operation. Revisit later.

**Row click** → opens the contact's profile page (§4.2). Phone and email cells have an icon button for direct `tel:` / `mailto:` that doesn't open the profile.

**Empty / loading states**: skeleton rows on load. Empty filtered result shows `Няма намерени контакти` with a "Изчисти филтрите" button.

**Export**: admin-only `Експорт към CSV` button, top-right of the table. Exports the current filtered view (not the entire database) so admins can share subsets (e.g. all clients in a given building) without re-doing filters in a spreadsheet. Useful for ad-hoc reporting and back-office work.

### 4.2 Contact profile page
Opened by clicking a row. URL-addressable (`/contacts/[id]`) so links can be shared in Slack/email.

Layout, top to bottom:

**Header block**
- Full name (large), type badge, owner avatar/name.
- Quick-action buttons: `Обади се`, `Изпрати имейл`, `Редактирай`, overflow menu (`Изтрий`).

**Details panel** (left column, ~1/3 width)
All fields from §3.1.

**Relations panel** (right column, ~2/3 width, tabbed)
One tab per related entity — only show tabs that have at least one record, plus an always-visible "+ Нов" button inline in each:
- Запитвания (Leads)
- Срещи (Meetings)
- Договори (Contracts)
- Имоти (Properties — derived from Contracts)
- Плащания (Payments)
- Вноски (Installments)
- Ремонти (Renovations)

Each tab is a compact list with the key fields for that entity and a link to its full page.

**Activity feed** (full-width, below the panels)
The team's shared awareness surface for this contact — this is the feature Context.md §7.4 specifically calls out.

- Reverse-chronological list of entries.
- **Two entry types:**
  1. **Manual notes** — any user posts free-text. Supports `@mentions` of other users (notifies them via Resend).
  2. **System events** — auto-posted when something changes: contact created, field edited, lead created, meeting scheduled, contract signed, payment received, payment overdue, etc. Visually distinct from manual notes (smaller, muted).
- Each manual note supports **threaded replies** (one level deep — no nested trees, to keep it simple for non-technical users).
- Edit/delete own notes only. Admins can delete any.
- Timestamp + author on every entry.

## 5. Create / Edit / Delete

### 5.1 Creation paths

**Note on `building` and `properties`:** these fields are **not exposed in the manual create or edit form**. They're populated exclusively from the Contracts module — when a contract is signed, the linked building/properties propagate to the contact automatically. The fields exist on the model to hold legacy CSV data and (Phase 2) derived data from contracts, but users don't type them in.

Two entry points, per Contacts.md original spec:

**a) Manual** — `+ Създай контакт` button, top-right of the table view. Opens a form modal. `fullName` and `type` required; everything else optional. Duplicate detection runs on blur of phone/email/ЕГН fields: if a possible match is found, show a non-blocking warning `Възможен дубликат: [име] — [телефон]. Продължи или отвори съществуващия?` with buttons for both actions. Never hard-block creation.

Duplicate detection is **exact match only** on phone, email, or ЕГН. No fuzzy name matching — too many false positives on Bulgarian naming variants.

**b) Auto from inbound email** — when the Leads module parses an incoming enquiry email and cannot match the sender to any existing contact, it creates one automatically (see `Leads.md §7.2` for the parser and `Leads.md §7.3` for the tiered match-or-create logic) with:
- `type` = `Електронно запитване`
- `fullName` = parsed from the email's From header (or the email address's local part if no name)
- `email` = sender address
- `owner` = **blank** (left for a human to claim; mirrors current data where 89% of contacts have no owner)
- `createdBy` = the `Система` pseudo-user
- A system event in the activity feed: `Контактът е създаден автоматично от входящ имейл`.

The linked lead is created in the same transaction. If lead creation fails, the contact is not created (all-or-nothing).

### 5.2 Permissions
**Per Contacts.md original: everyone (admin, manager, user) can create and delete contacts.** Keep that as the explicit rule.

Deletion of a contact with children (leads, contracts, etc.) opens a confirmation modal listing what will be affected:
> Този контакт има 2 договора, 5 плащания и 3 срещи. Изтриването ще премахне връзките, но няма да изтрие договорите. Сигурен ли си?

Children are **orphaned, not cascaded**, so critical financial records (contracts, payments) are preserved even if someone deletes a contact by mistake. Admins can reassign orphans. Hard delete of a contract/payment is a separate, admin-only operation handled in those modules.

### 5.3 Edit
Inline editing in the profile page's details panel. Click a field → becomes editable → save on blur or Enter, cancel on Esc. Every change emits a system event in the activity feed.

## 6. Validation

**ЕГН validation**: 10 digits, Bulgarian checksum algorithm. If invalid, inline error: `Невалидно ЕГН`. Do not block save — it's optional and some historical records have malformed values — but show the error so the user knows. For company records, allow 9-digit ЕИК in the same field (no checksum, just length check).

**Phone validation**: must parse as E.164 with `libphonenumber` or equivalent. Default country: Bulgaria. Inline error on invalid, non-blocking.

**Email validation**: RFC-compliant. Inline error, non-blocking.

## 7. Tooltips (Context.md §2)
Every non-obvious UI element needs a tooltip in Bulgarian. Minimum set:
- `Тип` field → explain each enum option in one line.
- `Отговорник` → `Членът на екипа, който води комуникацията с този контакт.`
- `ЕГН` → `Български личен идентификатор. 10 цифри.`
- Activity feed `@mention` → `Въведи @ и започни да пишеш име, за да уведомиш колега.`

## 8. Phase 1 / Phase 2 split

**Phase 1 (ship this):**
- Table + profile + CRUD
- Manual create, activity feed (manual notes only — no system events yet)
- Bulgarian enum + building values seeded from CSV
- CSV migration
- ЕГН validation
- Duplicate detection warning
- Admin-only CSV export

**Phase 2 (after Leads, Properties, Contracts exist):**
- Auto-create from inbound email
- System events in the activity feed
- Relations panel tabs populated from child modules
- `properties` linked to the Properties module
