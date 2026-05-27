# Invoices module

## 1. Purpose

Inbound supplier-invoice intake for vminvest. Managers upload PDF invoices through one of several admin-configured sections; the system extracts metadata automatically, stores the file and the parsed data, and surfaces price anomalies directly in the table view.

This is **accounts-payable-adjacent**, not accounts-payable. The system does not pay invoices, does not integrate with banks, does not move money. It ingests, parses, stores, displays, and flags. Humans do the actual paying and then mark the invoice as Paid.

**Not to be confused with the Payments module.** Payments (`payments.md`) are client-side milestone payments coming **into** vminvest (deposit, Акт 14, etc.). Invoices are supplier bills going **out** of vminvest. Different direction of money flow, different module.

- UI label for this module: `Фактури`.
- UI label for the Payments module: `Плащания`.

## 2. Ideology

- **File-first.** The uploaded PDF is the source of truth. Parsed data is a derived layer — when the parser is wrong, the original file is always one click away.
- **Parse, don't type.** Managers never enter invoice data by hand in the happy path. They upload → review what was extracted → confirm.
- **Detect, don't enforce.** Price anomalies are highlighted; they don't block anything. Matches the broader "informational, not operational" philosophy.
- **Keep the state machine small.** Two statuses only — Чакаща (pending), Платена (paid). No approval chains, no holds, no escalations.

## 3. Data model

```
InvoiceSection           — admin-configured upload sections (§5)
  ├─ id
  ├─ labelBg              — display label, e.g. "Офис", "Строеж", "Реновации", "Архитектура"
  ├─ slug                 — stable identifier, e.g. "office", "construction"
  ├─ sortOrder
  ├─ active               — soft-disable; deactivated sections are hidden from the main page
  ├─ createdAt / updatedAt

Invoice
  ├─ id
  ├─ section              — FK → InvoiceSection
  ├─ uploadedBy           — FK → Profile (the manager who clicked Качи фактура)
  ├─ uploadedAt
  ├─ storagePath          — Supabase Storage object key (PDF)
  ├─ fileName             — original filename
  ├─ fileSize             — bytes
  ├─ parseConfidence      — 0-100, parser self-assessment; null if parsed manually
  ├─ parseReviewNeeded    — true when parseConfidence < 80; surfaces a warning in the table
  ├─ vendorName           — free-text supplier name (no separate Vendor table — see §3.2)
  ├─ vendorNameNormalized — lowercase + collapsed whitespace, for price-tracking joins
  ├─ vendorVatNumber      — ДДС / ЕИК, nullable
  ├─ invoiceNumber        — supplier's own invoice number
  ├─ invoiceDate          — date on the invoice
  ├─ dueDate              — nullable
  ├─ subtotal             — decimal(12,2)
  ├─ vatAmount            — decimal(12,2)
  ├─ total                — decimal(12,2)
  ├─ status               — enum: pending | paid
  ├─ paidAt               — set when status flips to paid
  ├─ paidBy               — FK → Profile, nullable
  ├─ notes                — free-text, manager-editable
  ├─ createdAt / updatedAt

InvoiceLineItem
  ├─ id
  ├─ invoice              — FK → Invoice (cascade delete)
  ├─ rowNumber            — order on the invoice (1, 2, 3, …)
  ├─ description          — raw text
  ├─ descriptionNormalized — lowercase + collapsed whitespace, for price-tracking joins
  ├─ quantity             — decimal(12,4)
  ├─ unit                 — "кг", "бр.", "м2", "час", …
  ├─ unitPrice            — decimal(12,4)
  ├─ lineTotal            — decimal(12,2)
  ├─ vatRate              — decimal(5,2)
  ├─ priceAnomalyPct      — decimal(6,2), nullable; +12.50 means current unit price is 12.5% above the comparison baseline
  ├─ priceAnomalyRefInvoiceId — FK → Invoice, nullable; which prior invoice we compared against

InvoiceEvent (audit) — handled via the generic `recordAuditEvent` helper; no dedicated table.
  Actions: `invoices.uploaded`, `invoices.parsed`, `invoices.metadata.edited`,
  `invoices.status.changed`, `invoices.deleted`, `invoices.section.created`,
  `invoices.section.updated`, `invoices.section.deactivated`,
  `invoices.attachment.viewed`, `invoices.attachment.downloaded`,
  `invoices.attachment.uploaded`, `invoices.attachment.deleted`.
  (The last four already exist in `audit-labels.ts` for the contracts module
  and are reused here per `_foundations/ui-patterns-files.md` §10.)
```

### 3.1 Currency

**EUR only.** Every monetary field stores EUR. There is no `currency` column. Invoices arrive from suppliers in BGN or EUR; the parser converts BGN line items at the fixed peg (1 EUR = 1.95583 BGN) at upload time, and the original PDF remains the source of truth for the audit trail. The review screen shows the converted EUR figures with a small `← конвертирано от BGN` hint when the source was in BGN.

Display per `/CLAUDE.md`: `12 500,00 €`, space thousands, comma decimal, space before `€`.

### 3.2 Vendor handling — free-text, not a managed entity

There is no `Vendor` table in Phase 1. `vendorName` is free-text on the invoice. Price tracking groups by `(vendorNameNormalized, descriptionNormalized)` — so as long as the parser writes "Цимент 25кг" consistently per supplier, the price history works.

`vendorNameNormalized` is computed server-side on every write: `vendorName.trim().toLowerCase().replace(/\s+/g, " ")`. Same recipe for `descriptionNormalized`. Two invoices that wrote "Цимент 25кг" and "цимент  25 кг" land in the same price-history bucket.

This is a deliberate Phase-1 simplification. If reconciliation gets messy (typos, branch suffixes like "EOOD Sofia" vs "EOOD"), promote to a managed `Vendor` entity with an admin merge UI in Phase 2.

## 4. The upload flow

1. Manager clicks `Качи фактура` under any of the 4 sections (or admin-added ones).
2. Standard file picker — PDF only in Phase 1 (JPG/PNG are Phase 2). Single file at a time.
3. File uploads to Supabase Storage under `invoices/<section-slug>/<yyyy-mm>/<uuid>.pdf`.
4. **Synchronous parser call** — the LLM is invoked inside the upload server action and returns extracted metadata + line items. Total expected latency 5-15 s; the form shows a `Обработваме фактурата…` state. (See §10 for the parser contract.)
5. A **preview modal** opens (per `/specs/design-system/modals.md`) showing:
   - Vendor, invoice number, dates, subtotal/VAT/total (header fields, all inline-editable).
   - Line items table — description, quantity, unit, unit price, line total (all inline-editable, `+ Добави ред` to add a missed row, `×` to remove a hallucinated row).
   - Parse confidence indicator (color-coded badge: green ≥80, amber 60–79, red <60).
   - PDF preview in the left half (per `ui-patterns-files.md` §5).
6. Manager clicks `Запази`. The Invoice + InvoiceLineItem rows are created; the price anomaly detector runs (see §9). Status starts as `pending`.

If the manager closes the preview modal without saving, **the upload is discarded** — both the storage object and the parser result. Avoids littering Storage with abandoned files.

### 4.1 Duplicate detection (soft warning)

Before opening the preview modal, the server checks:
- `(vendorNameNormalized, invoiceNumber, invoiceDate)` exact match against an existing non-deleted invoice → soft warning at the top of the preview:
  `Възможно дублиране: фактура [номер] от [доставчик] на [дата] вече е качена. Прегледай преди да продължиш.` with a link to the existing invoice.
- The warning is informational — the manager can still save. Never hard-block.

## 5. Sections (admin-configured)

The 4 sections shown on launch (Офис, Строеж, Реновации, Архитектура) are seeded `InvoiceSection` rows. Admins can add a 5th (Маркетинг, ИТ, …) or deactivate any of the originals.

### 5.1 Per-section fields

| Field | Label (BG) | Notes |
|---|---|---|
| `labelBg` | Име | Shown on the section card on the main page. |
| `slug` | Системно име | Stable string identifier; used in storage paths. Immutable after creation. |
| `sortOrder` | Подредба | Integer; controls left-to-right card order. |
| `active` | Активна | When false, the card disappears from the main page; existing invoices in this section remain visible and editable from the list view. |

### 5.2 Admin screen

`/admin/invoice-sections` — table view mirroring `/admin/buildings` exactly (see `app/(app)/admin/buildings/buildings-admin.tsx`). Columns: Име, Системно име, Подредба, Брой фактури, Активна.

- `+ Нова секция` opens an inline create form.
- Deactivation: soft, reversible (sets `active = false`).
- Hard delete: blocked if any invoice references the section. Error message:
  `Секцията не може да бъде изтрита — има [N] свързани фактури. Деактивирай я вместо това.`

### 5.3 Seed

Initial migration seeds:
```
{ slug: "office",        labelBg: "Офис",       sortOrder: 1 }
{ slug: "construction",  labelBg: "Строеж",     sortOrder: 2 }
{ slug: "renovation",    labelBg: "Реновации",  sortOrder: 3 }
{ slug: "architecture",  labelBg: "Архитектура", sortOrder: 4 }
```

## 6. Views

### 6.1 Main page (`/invoices`)

Top of page: 4 (or however many) section cards in a horizontal row, each containing:
- Section label.
- `Качи фактура` button (primary).
- `Виж фактурите` button (ghost) — links to the list view filtered to that section.
- Compact counts: `X чакащи · Y платени за този месец`.

Below the cards: the **list view** of all invoices (see §6.2), with the section column visible. Filter chips above the table let managers narrow to one section.

### 6.2 Invoices list view

Standard table per `/specs/design-system/tables.md`.

**Default columns (left to right):**
1. Секция (small pill, color-coded by section)
2. Доставчик (vendor name)
3. Номер на фактура
4. Дата на фактура
5. Срок на плащане
6. Обща сума (EUR, right-aligned)
7. Статус (inline-edit pill — Чакаща / Платена)
8. Качена от (uploader)
9. Файл (one icon per `ui-patterns-files.md` §3)

**Hidden by default:** parse confidence, VAT amount, subtotal, paid at, paid by, notes, line item count, vendor ЕИК.

**Row indicator:** rows with at least one line item flagged as a price anomaly get a left-border in `warning-500` and the vendor cell gets a small ⚠ icon. Hovering shows: `[N] позиции с цена >5% над предишната за последния месец.`

**Filters:**
- Секция (multi-select).
- Статус (multi-select).
- Дата на фактура (range).
- Качена от (multi-select profiles).
- Само мои (toggle) — defaults to **on** when the user opens the page; turning it off shows all managers' invoices.
- Само с ценови сигнали (toggle).

**Search:** fuzzy across `vendorName`, `invoiceNumber`, line item descriptions, notes.

The default-on `Само мои` filter is the spec-level realization of "every manager sees their own first" from the workflow description. Toggling it off (and the filter chip remembering the toggle in the URL query) is "look into the pipeline of invoices for other managers."

### 6.3 Invoice detail page (`/invoices/[id]`)

Two tabs:

1. **Преглед** — split-screen: PDF on the left, parsed data on the right. Header fields + line items table, both inline-editable per `/specs/_foundations/ui-patterns-inline-edit.md`. Editing rules per §8 below.
2. **История на цените** — for each line item, the last 5 prices the same `(vendorNameNormalized, descriptionNormalized)` combination charged across all prior invoices (chronological list, plus a small sparkline). If no history exists, shows `Няма предишни данни за тази позиция.`

Top-right actions:
- `Маркирай като платена` / `Маркирай като чакаща` (toggles status; behind the same permissions as inline editing of the status cell).
- `Изтегли PDF` (per `ui-patterns-files.md` §4).
- `Изтрий` — visible only to the uploader (when status = pending) or to admins (always). Two-step destructive confirm per `bg-copy.md` §4.1.

## 7. Status workflow

Two statuses only:

| Status | When set | UI label |
|---|---|---|
| `pending` | Default after a successful upload. | `Чакаща` (tone: `info`) |
| `paid` | Manually flipped after the payer has paid. Stamps `paidAt` and `paidBy`. | `Платена` (tone: `success`) |

Flipping `paid → pending` un-stamps `paidAt`/`paidBy` and emits an audit row — useful when a payment is reversed.

Per the user's intent, there is **no `rejected` / `disputed` state in Phase 1**. If an invoice was uploaded by mistake, the uploader deletes it while it's still Pending (or an admin deletes it later).

## 8. Editing metadata after save

Per `/specs/_foundations/ui-patterns-inline-edit.md`, every header field and every line-item cell is editable from the detail page. Permissions on edit:

| Invoice status | Manager (any) | Admin |
|---|---|---|
| `pending` | ✅ all fields | ✅ all fields |
| `paid` | ❌ read-only (with 🔒 tooltip per §3.12 of inline-edit spec) | ✅ all fields |

Status itself is editable inline by **any manager + admin** (§6.2 default; see permission table in §11).

When the status flips `paid → pending`, the fields become manager-editable again.

`vendorName` / `description` edits write to both the raw column and the normalized column in the same transaction so price-history joins stay consistent.

## 9. Price anomaly detection

Runs in two places:
- **On upload**, after the new line items are inserted, before the preview modal returns to "save complete" state.
- **On line-item edit**, when `unitPrice` or `description` changes.

Per line item, the rule is:

1. Look up the **most recent** confirmed `InvoiceLineItem` where:
   - `vendorNameNormalized` matches the current row's vendor (joined through the parent invoice).
   - `descriptionNormalized` matches the current row's description.
   - `invoice.invoiceDate` falls within the past 30 days, **and** is strictly before the current invoice's `invoiceDate`.
   - `invoice.status` ∈ {pending, paid} (any non-deleted invoice).
   - `invoice.id ≠ current invoice id`.
2. If found and current `unitPrice > 1.05 × prior unitPrice`:
   - Set `priceAnomalyPct = ((current - prior) / prior) × 100`, rounded to 2 decimals.
   - Set `priceAnomalyRefInvoiceId` to the prior invoice's id.
3. If no comparable line item exists in the window, **no flag** — `priceAnomalyPct` stays null.

**No emails are sent.** This is the simplification the user asked for: the flag lives in the table (left-border, ⚠ icon, hover tooltip, dedicated `История на цените` tab on the detail page). No notifications, no separate alerting infrastructure.

**False positives:** since this is informational only, there's no dismiss flow. If a manager genuinely thinks the increase is legitimate, they note it in the invoice's `notes` field and move on. The flag persists as a record of "this jumped".

## 10. Parser engine

Implementation detail kept out of the main flow's spec but documented for whoever builds it:

- **Service**: Anthropic Claude API (matches `/CLAUDE.md` stack — no new vendor introduced).
- **Mode**: synchronous, called from inside the upload server action. The PDF is sent as a base64 `document` content block (Claude supports PDF input natively; no need to rasterize).
- **Output contract**: strict JSON schema matching the `Invoice` header + `InvoiceLineItem[]` shape. Confidence per field (0-100), aggregated to one `parseConfidence` value on the invoice (minimum across all extracted fields).
- **Threshold**: `parseConfidence < 80` → `parseReviewNeeded = true`. The preview modal shows a banner: `Автоматичното разпознаване е с ниска увереност — провери внимателно.`
- **Failure handling**: if the parser errors or returns malformed JSON, the upload server action returns `{ ok: false, error: "…" }` and the storage object is deleted. No partial Invoice rows are written.
- **Timeout**: 30 s. Past that, treat as a failure.
- **No retries** on the synchronous path (the user is waiting). If the parser fails, the manager retries the upload themselves.

The synchronous-on-upload choice differs from the old spec's async-worker design. Trade-off: simpler infra, no queue, no email follow-up; cost is that the manager waits during upload. With ~25 invoices per week expected, this is fine.

## 11. Permissions

| Action | Admin | Manager | User |
|---|---|---|---|
| See `/invoices` page (any section) | ✅ | ✅ | ❌ |
| Upload through any section | ✅ | ✅ | ❌ |
| View any invoice (incl. other managers') | ✅ | ✅ | ❌ |
| Edit metadata while `pending` | ✅ | ✅ | ❌ |
| Edit metadata while `paid` | ✅ | ❌ (🔒) | ❌ |
| Flip status (pending ↔ paid) | ✅ | ✅ | ❌ |
| Delete while `pending` | ✅ | ✅ (only if uploader) | ❌ |
| Delete while `paid` | ✅ | ❌ | ❌ |
| Manage sections (`/admin/invoice-sections`) | ✅ | ❌ | ❌ |

`user` role has zero access to this module. Adding `Фактури` to the top nav: visible only to managers and admins.

Add to `/specs/_foundations/roles.md` once the module is built.

## 12. Validation

- `total ≈ subtotal + vatAmount` within 0.02 EUR tolerance. Blocking on save (preview modal won't let you confirm).
- `invoiceDate` not in the future. Blocking with `Override` option (some suppliers pre-date).
- `dueDate ≥ invoiceDate` when set. Blocking.
- `total`, `subtotal`, `vatAmount`, `unitPrice`, `quantity`, `lineTotal` non-negative. Blocking.
- ДДС/ЕИК format check if supplied. Non-blocking (warning toast only).
- File: PDF MIME type, ≤ 10 MB. Blocking.
- `invoiceNumber` non-empty after parsing. If the parser couldn't find one, manager fills it in the preview before save.

## 13. Audit log

Every state-changing action emits one row via `recordAuditEvent` (see `_foundations/audit-log.md` when written). Actions enumerated in §3 above. Each row captures actor, before/after, and the invoice id as `targetId`.

The audit-log viewer (admin-only, future) groups all `invoices.*` events for a given invoice into a per-record activity feed.

## 14. Migration

**None.** Greenfield module. No legacy invoice CSV to import — historical invoices live in email / filing cabinets, and back-filling is manual and out of scope.

If the team wants to seed a couple of months of recent invoices to warm up the price-anomaly detector, they upload them manually through the normal flow. No special import path needed.

## 15. Phase 1 / Phase 2 split

**Phase 1 (ship this):**
- 4 admin-configurable sections, seeded with Office / Construction / Renovation / Architecture.
- Per-section Upload + View buttons on the main page.
- Synchronous LLM-based PDF parsing with preview-confirm modal.
- Invoices list with per-section filter, "Само мои" default-on filter, fuzzy search.
- Two-status state machine (pending / paid), inline-editable from the table.
- Inline-editable metadata per the permissions matrix.
- Price-anomaly detection — flag-in-table only, no emails.
- Per-invoice price-history tab.
- Admin section management (`/admin/invoice-sections`).
- Soft duplicate warning on `(vendor, number, date)` collision.

**Phase 2:**
- JPG/PNG upload (multimodal parser already supports it; just an MIME-allowlist change).
- Bulk upload (multiple files at once, with a queue indicator).
- Managed `Vendor` entity with admin merge UI (when free-text normalization gets messy).
- `rejected` / `disputed` statuses if business needs justify them.
- Dashboard page with charts (per-vendor spend, per-section spend, price-over-time per item).
- Email notifications (weekly digest of unpaid invoices, immediate alert on anomaly).
- Integration with Renovations — linking invoices to specific projects for per-project spend tracking.

## 16. Tooltips

- `Качи фактура` (when manager) → no tooltip; label is self-explanatory.
- `Виж фактурите` → no tooltip; goes to the list filtered to this section.
- Price anomaly ⚠ icon → `Цената на [N] позиции е >5% над предишната за този доставчик за последния месец.` (per-row count substituted).
- Parse confidence badge (low) → `Автоматичното разпознаване е с ниска увереност. Провери внимателно.`
- Locked field (🔒 on a `paid` invoice for a manager) → `Фактурата е платена — само администратор може да редактира. Прехвърли я обратно на „Чакаща“, ако трябва да бъде коригирана.`
- Section card count (`X чакащи · Y платени за този месец`) → no tooltip; the label is self-explanatory.

## 17. Open decisions

- **What month does "за този месец" mean on the section card counts?** Calendar month (resets on the 1st) or rolling 30 days? Default to **calendar month** unless accounting prefers rolling.
- **VAT rate per line item.** Some Bulgarian invoices have mixed VAT rates per line. The schema supports it; the parser needs to extract per-line. Flag for QA on real invoices during prototype.
- **Storage retention.** Per `_foundations/context.md` §4 GDPR notes, invoices typically aren't personal data, but vendor names + ЕИК can be. Confirm retention period with legal before launch.
- **Currency mid-flight.** Once Bulgaria adopts the euro formally, the BGN→EUR conversion at upload time becomes irrelevant. Until then, the fixed peg (1.95583) is law. No code change needed at the changeover — the conversion path simply stops being exercised.
