# Contracts Module

The contracts module is intentionally a **lightweight registry** — it captures the structured business data about a deal (parties, properties, money, status) and holds whatever documents the team prepared externally.

It deliberately does **not** generate documents inside the app. The team prepares contracts in Word using their existing templates outside the system, then uploads the finished `.docx` (and any additional supporting files) to the contract record here. This keeps the legal-document side of the workflow exactly where the team is comfortable with it, and avoids a heavy template-engine implementation that would carry its own fidelity risks.

The module has two main surfaces:

1. **Table view** at `/contracts` — Airtable-style listing showing the most important contract info (title, buyer, contact, properties, total, status, attachments) with filters, inline status edits, and a search box. Pagination + multi-column show/hide via the standard table pattern.
2. **Detail view** at `/contracts/[id]` — full contract data, attached files, embedded payments + installments tracker. Edit button routes to `/contracts/[id]/edit`.

Create is a single button `+ Нов договор` at the top right of the table; takes the user to `/contracts/new`.

## 1. Purpose

Let users record every contract the company signs, link it to the right Contact and Properties for cross-module navigation, attach the prepared documents (the contract itself + any supplementary files), and see vital information at a glance.

## 2. Ideology

- **Documents are prepared externally.** The team has long-standing Word templates and a workflow they know. The ERP doesn't try to take that over — it records the metadata and stores the resulting files.
- **The structured fields are the ERP's source of truth** (status, total, parties, properties). The attached `.docx` is the legal source of truth for the wording. Both coexist.
- **Permissions stay open for collaboration on files.** Any signed-in profile (admin/manager/user) can upload documents. Deletion is admin-only — files are tied to legal records and shouldn't be removed casually.
- **Lifecycle is binary-ish.** Status is `draft` / `signed` / `cancelled`; that's enough. No multi-stage approval workflow.

## 3. Create flow (happy path)

1. User clicks `+ Нов договор` on `/contracts`.
2. **Manual form** at `/contracts/new`:
   - **Identity** — title, buyer name (as it appears on the deed), optional Contact link via the `<ContactPicker>`.
   - **Properties** — multi-select via `<PropertyMultiPicker>`. At least one required. Apartment + parking + storage on one contract is typical.
   - **Context** — optional building label (free-text, denormalized for filtering), consultant on the deal (`<UserPicker>` over active profiles — the FK enables future "Моите договори" views), contract type (СМР Кеш / СМР Банка / СМР Комбиниран / Без СМР), uses-credit checkbox.
   - **Money** — total due in EUR (accepts both `12 500,50` BG locale and `12500.50`). Paid + remaining are derived later by the Payments module.
   - **Lifecycle** — status, optional signed date, optional reminder date.
3. Save → bounces to `/contracts/[id]`.
4. From the detail page, attach the prepared `.docx` (contract) + any supplementary documents via the **Файлове** section.

Edit follows the same form pre-filled with current values; routes to `/contracts/[id]/edit`.

## 4. File attachments

### 4.1 What goes here

Anything related to the contract: the contract `.docx` itself, the technical specification, scanned signed copies, additional appendices, communications, supporting documents that surface later (deeds, tax documents, photographs). The module is a **catch-all bucket** for the deal's paperwork.

### 4.2 Storage

Files live in Supabase Storage under `contracts/{contract_id}/{attachment_id}-{filename}`. Filenames are sanitized server-side (unsafe characters replaced with `_`). 25 MB per-file upload cap.

### 4.3 Table-side display

Per `_foundations/ui-patterns-files.md` — the file column on the list table renders as a stack of file-type icons, click to preview in the modal. Same component (`<FileCell>`) on the detail page with the upload affordance enabled.

### 4.4 Permissions

| Action | Admin | Manager | User |
|---|---|---|---|
| View attachments | ✅ | ✅ | ✅ |
| Upload new file | ✅ | ✅ | ✅ |
| Delete a file | ✅ | ❌ | ❌ |

User uploads is the deliberate choice — sales team members can add their own supporting docs (proof of payment receipts they scanned, photos of a signed exhibit) without bothering an admin. Delete stays admin-only because files attached to a contract are part of a legal record.

## 5. Data model

```
Contract
  ├─ id
  ├─ title                — short label, e.g. "Людмил Икономов — Царевец, Ап.27 + гараж 18"
  ├─ buyerFullName        — name as it appears on the deed
  ├─ contactId            — FK → Contact (optional; for CRM navigation)
  ├─ salespersonId        — FK → Profile, the "Консултант на сделката"
  ├─ salesperson          — legacy free-text mirror of profile.fullName; CSV-imported rows
  │                          may have only this column populated
  ├─ building             — free-text label, denormalized for filtering on the list page
  ├─ contractType         — "SMR_KESH" | "SMR_BANKA" | "SMR_KOMBINIRAN" | "BEZ_SMR"
  ├─ compositionStatus    — "А" | "А+Г/ПМ" | "А+ПМ" (optional)
  ├─ preOrPost            — frozen at "След" for all new records (system ships post-Акт-16);
  │                          legacy CSV rows may have "Преди"
  ├─ usesCredit           — boolean
  ├─ totalDueEur          — decimal(12,2), entered by user
  ├─ totalPaidEur         — decimal(12,2), maintained by Payments module
  ├─ totalRemainingEur    — decimal(12,2), recomputed on save (due − paid, floored at 0)
  ├─ status               — "draft" | "signed" | "cancelled"
  ├─ source               — "manual" | "imported"
  ├─ signedAt             — optional
  ├─ reminderDate         — optional
  ├─ createdAt / createdById
  ├─ updatedAt / updatedById
  └─ many-to-many → Property via ContractProperty
     one-to-many → ContractPayment → ContractInstallment
     one-to-many → ContractAttachment

ContractAttachment
  ├─ id
  ├─ contractId           — FK → Contract (cascade delete)
  ├─ type                 — "contract_pdf" | "tech_spec_pdf" | "other" (legacy enum values
  │                          retained for backwards-compatibility; new uploads default to "other"
  │                          and the distinction isn't surfaced in the UI)
  ├─ fileName / storageKey / mimeType / sizeBytes
  ├─ version              — integer, always 1 in the current implementation (kept on the
  │                          schema as a forward hook in case versioning is added later)
  ├─ uploadedAt / uploadedById
```

## 6. List view

Standard table per `design-system/tables.md`. Default columns: title, buyer, contact, properties, building, total, status, signed date, files. Hidden by default: consultant ("Консултант"), contract type, composition, credit flag.

**Filters**:
- Building (multi-select from distinct values)
- Status (multi-select)
- Consultant (text — matches against the legacy `salesperson` column, which the action layer keeps in sync with the FK's fullName so this filter works uniformly for both legacy and new contracts)

**Search**: fuzzy across title + buyerFullName + contact fullName.

**Inline edits** from the table: status (per `_foundations/ui-patterns-inline-edit.md` §3.1).

## 7. Detail view

Lives at `/contracts/[id]`. Sections, top-down:

1. **Header strip** — title + status badge + contract-type badge + uses-credit badge. Top-right: `Редактирай` button (visible per the permission rules in §10).
2. **Parties + Context** — buyer, contact (linked), consultant, building label.
3. **Properties** — list of attached properties with building + name. Each links to the property's detail page.
4. **Money** — totals + per-payment breakdown + per-installment rows (driven by the Payments module).
5. **Files** — the attachment cell from §4.3 with upload affordance.

## 8. Permissions

| Action | Admin | Manager | User |
|---|---|---|---|
| View `/contracts` + any contract | ✅ | ✅ | ✅ |
| Create a contract | ✅ | ✅ | ✅ |
| Edit while `draft` or `cancelled` | ✅ | ✅ | ✅ |
| Edit while `signed` | ✅ | ✅ | ❌ |
| Flip status (any direction) | ✅ | ✅ | ✅ |
| Upload attachments | ✅ | ✅ | ✅ |
| Delete attachments | ✅ | ❌ | ❌ |
| Delete a contract | ✅ | ❌ | ❌ |

A `signed` contract is treated as the company's legal record; sales-users can't modify it. Managers and admins can still correct mistakes — they're who the team escalates to.

## 9. Validation

- Title + buyerFullName required.
- Total ≥ 0 and finite.
- Contract type must be one of the four allowed values.
- Status must be one of `draft` / `signed` / `cancelled`.
- At least one property attached.
- Optional warnings (non-blocking): status=signed without signedAt, signedAt set with non-signed status.

## 10. Edge cases handled

- Property already linked to another active contract — warned but allowed (re-sale flow per `_foundations/context.md`).
- Consultant profile deactivated after assignment — the FK isn't auto-cleared; the table + detail page render the name in italic + opacity-70 with a "Този потребител е деактивиран" tooltip.
- Contact deleted — `contactId` becomes orphan; the detail page renders `—` for the contact row. (Cascade rules per `roles.md` keep the contract record itself intact.)
- CSV-imported contracts have `salesperson` as free text (sometimes a nickname). They display from the legacy column until the next manual edit, which writes the FK + mirrors the fullName.

## 11. Out of scope (explicitly)

- **Template-driven document generation inside the ERP.** Team prepares contracts in Word externally and uploads the finished file. Adding an in-app template engine isn't planned — the upload affordance covers the need without the fidelity risks of a `.docx` round-trip.
- **PDF generation.** Files stay in their uploaded format (typically `.docx`). If the team needs a PDF, they use "Save as PDF" in Word.
- **Versioning of attachments.** The `version` column exists on the schema but is always `1`. Re-uploading a file just creates a new attachment row. The "latest" interpretation is operational — admins curate.
- **Voiding individual files.** Admins delete instead.
- **Bulk contract create.** One at a time. CSV import was a one-off seed path.
- **Client-facing PDF sharing.** No client portal in Phase 1.
- **Branching logic on form fields.** No conditional question paths.

## 12. Bulgarian copy reference

Per `_foundations/bg-copy.md`. Key strings:

| English | Bulgarian |
|---|---|
| Contract (entity) | `Договор` |
| Buyer | `Купувач` |
| Consultant (on the deal) | `Консултант на сделката` |
| Salesperson (column label) | `Консултант` |
| Status: draft / signed / cancelled | `Чернова` / `Подписан` / `Отказан` |
| Type: cash / bank / mixed / no СМР | `СМР Кеш` / `СМР Банка` / `СМР Комбиниран` / `Без СМР` |
| Total due | `Обща сума за плащане` |
| Signed at | `Дата на подписване` |
| Reminder date | `Дата на напомняне` |
| File attachment column | `Файлове` |
| "+ New contract" button | `+ Нов договор` |
| Detail edit button | `Редактирай` |

## 13. Acceptance criteria

- Anyone with a profile can land on `/contracts` and see the list.
- The `+ Нов договор` button is enabled (not Phase-2 gated) and routes to `/contracts/new`.
- The create form covers all required fields with proper validation and Bulgarian error messages.
- A newly-created contract appears on the list immediately and is linked to its properties.
- The detail page shows all sections; the file cell exposes an upload affordance to every signed-in user.
- Admins can delete attachments; managers and users cannot.
- Sales-users cannot edit a `signed` contract; managers and admins can.
- The consultant FK uses the live `<UserPicker>` over active profiles; legacy text values render correctly for CSV-imported rows.
