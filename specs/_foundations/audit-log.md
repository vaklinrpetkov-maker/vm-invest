# Audit log

System-wide append-only event ledger. Every meaningful mutation across every module writes one row. Two reasons it exists:

1. **Forensic**: when a record looks wrong, the admin can reconstruct what happened, who did it, and when — without trawling through Postgres backups or asking the team.
2. **Compliance**: GDPR + Bulgarian accounting practice both expect a who/what/when trail on legal records (contracts, payments, invoices). The audit log is that trail.

It is **not** the per-record activity feed users see on a detail page. That's a different surface drawing from the same underlying event stream — see `activity-feed.md` (pending) for the read pattern + permission rules. This document covers the *writing* side: schema, taxonomy, conventions.

Status: ✅ — fully shipped (table, helper, taxonomy, admin viewer). This spec catalogues the existing implementation so module authors have a single reference for "what should I log."

## 1. What gets logged

**Always log** every mutation that:

- Changes data a human cares about (status, owner, fields on `Contact` / `Property` / `Contract` / `Invoice` / etc.).
- Affects identity / access (login, logout, role change, invite, password reset).
- Affects security boundaries (file viewed, file downloaded, file deleted).
- Affects financial or legal records (contract created/updated/deleted, payment marked paid, invoice status changed).
- Triggers cross-system effects (lead converted to contract, property linked to a contract, invoice anomaly detected).

**Don't log**:

- Routine reads. Loading a list page is not logged. Opening a detail page is not logged. (Exception: opening a sensitive file IS logged — see §6.)
- System-internal jobs that don't touch the user-visible state (cache warmups, telemetry, cron heartbeats).
- Form-state changes that don't hit the database (typing in a draft, navigating filters, opening a modal that's then dismissed).
- Per-keystroke or per-tick noise — debounce on the action that commits.

If you're unsure: log it. Storage is cheap; the lack of a row is the painful case.

## 2. Schema — `AuditEvent`

Single Postgres table in the `public` schema. Indexed for the two common access patterns: `(actorId, at)` and `(action, at)`. Source of truth: `prisma/schema.prisma` lines 121–139.

| Column | Type | Notes |
|---|---|---|
| `id` | `BigInt @id @default(autoincrement())` | Insertion-ordered, monotonic. Never reused. |
| `actorId` | `String? @db.Uuid → Profile` | Nullable for system-emitted events (webhook ingest, cron, background parser). |
| `action` | `String` | Free string at the column level; constrained at the application level by the `AuditAction` union in `lib/auth/audit.ts`. Naming convention in §3. |
| `targetType` | `String?` | Lowercase singular noun (`contact`, `property`, `contract`, `lead`, `task`, `meeting`, `invoice`, `building`, `renovation`, `profile`). Used by viewers to scope queries to one entity type. |
| `targetId` | `String?` | UUID of the affected record. Nullable because some actions (e.g. `auth.bootstrap.first_admin`) have no single target. |
| `payload` | `Json?` | Free-form context that's neither before nor after. Conventions in §4. |
| `before` | `Json?` | Pre-change state, scoped to the fields that actually changed. |
| `after` | `Json?` | Post-change state, scoped to the fields that actually changed. |
| `ip` | `String? @db.Inet` | Best-effort capture from `x-forwarded-for`. Native Postgres `inet` type, so filtering by subnet is possible later. |
| `userAgent` | `String?` | Raw `User-Agent` header. |
| `at` | `Timestamptz @default(now())` | Server clock. Always UTC at rest; rendered in `Europe/Sofia` on read. |

Indexes:
- `@@index([actorId, at])` — answers "what did this user do recently?"
- `@@index([action, at])` — answers "every status change in the last week?"

The `id` is `BigInt` not `Int` because at ~1000 events/day we'd hit `Int32` overflow in ~5800 years which is laughable, but log volume historically grows faster than projected and `BigInt` costs nothing.

## 3. Action taxonomy

Action strings follow `<module>.<noun>.<verb>` or `<module>.<verb>`. The taxonomy lives in `lib/auth/audit.ts` as a TypeScript union — adding a new action requires updating that union (and the matching `AUDIT_LABELS` map in `lib/auth/audit-labels.ts` so the admin viewer renders a Bulgarian label).

### 3.1 Naming rules

- **Module prefix is lowercase.** `contact.*`, `leads.*`, `meetings.*`, `contracts.*`, `tasks.*`, `invoices.*`, `properties.*`, `buildings.*`, `auth.*`, `absence.*`. The singular-vs-plural inconsistency (`contact.field.updated` but `leads.create`) is historical — new actions should follow the existing module's pattern rather than introduce a third.
- **Verb is past-tense or imperative-noun.** `created`, `updated`, `deleted`, `status_changed`, `owner.changed`. Both styles coexist; pick the one that matches sibling actions on the same module.
- **Sub-noun for granularity.** `contracts.attachment.uploaded` rather than `contracts.upload_attachment`. Makes filtering `contracts.attachment.*` trivial.
- **`*.field.updated`** is the canonical action emitted by inline-edit cells. Payload carries `{ field }` plus `before` / `after` containing just the one field that changed. One audit row per field change. Shared shape across `contact.field.updated`, `tasks.field.updated`, `meetings.field.updated`. New modules with inline-edit cells emit their own `<module>.field.updated`.
- **`*.status_changed`** is emitted in addition to the granular `*.field.updated` when status moves. Lets reporting filter directly on status events without parsing payloads.

### 3.2 Canonical list

Always up-to-date in code (`lib/auth/audit.ts`). Below is the grouping by module for documentation purposes — module specs that emit events should reference this section.

| Module prefix | Examples | Owner spec |
|---|---|---|
| `auth.*` | `auth.invite.sent`, `auth.login.success`, `auth.login.failed`, `auth.password.reset_*`, `auth.role.changed`, `auth.account.deactivated`, `auth.bootstrap.first_admin` | `_foundations/authentication.md` |
| `contact.*` | `contact.field.updated`, `contact.owner.changed`, `contact.building_migrated` | `contacts.md` |
| `leads.*` | `leads.create/update/delete/restore`, `leads.owner.changed`, `leads.status.changed`, `leads.source.changed`, `leads.converted`, `leads.timer.*`, `leads.email.*` | `leads.md` |
| `meetings.*` | `meetings.create/update/cancel/restore`, `meetings.happened`, `meetings.field.updated` | `meetings.md` |
| `contract.*` + `contracts.*` | `contract.created/updated/deleted/imported`, `contracts.attachment.viewed/downloaded/uploaded/deleted` | `contracts.md` |
| `property.*` | `property.created/updated/deleted`, `property.status_changed`, `property.seed_flagged`, `property.imported`, `property.seller_normalized` | `properties.md` |
| `building.*` | `building.created/updated/deactivated/deleted` | `properties.md` §3.3 |
| `tasks.*` | `tasks.create/update/deleted`, `tasks.status_changed`, `tasks.owner_changed`, `tasks.field.updated` | `tasks.md` |
| `absence.*` | `absence.request.*`, `absence.balance.set`, `absence.calendar.*` | `absence.md` |
| `invoices.*` | `invoices.uploaded`, `invoices.parsed`, `invoices.metadata.edited`, `invoices.status.changed`, `invoices.deleted`, `invoices.attachment.*`, `invoices.section.*` | `invoices.md` |
| `renovation.*` (Phase 2) | `renovation.created/updated/deleted`, `renovation.field.updated`, `renovation.status_changed`, `renovation.task.*` | `renovations.md` §8 |

When in doubt, look at how a sibling module names its actions and mirror.

## 4. Payload conventions

The `before` / `after` / `payload` split is a recurring source of inconsistency in shipped code. The convention going forward:

### 4.1 `before` + `after`
Use when the action is a **mutation of one or more named fields** on a record. Both columns are JSON objects keyed by field name. Only include fields that actually changed — don't snapshot the entire row.

```ts
// contact.field.updated emitted by an inline-edit cell on "phone"
recordAuditEvent({
  action: "contact.field.updated",
  targetType: "contact",
  targetId: contactId,
  before: { phone: "+359 88 123 4567" },
  after:  { phone: "+359 88 999 9999" },
  payload: { field: "phone" },
});
```

For full-form updates that touch several fields at once, include each changed key on each side:

```ts
// contract.updated
recordAuditEvent({
  action: "contract.updated",
  targetType: "contract",
  targetId: id,
  before: { status: "draft",  reminderDate: null },
  after:  { status: "signed", reminderDate: "2026-06-01" },
});
```

### 4.2 `payload`
Use for context that isn't a field-level diff:
- Which field a generic `*.field.updated` event touched: `payload: { field: "title" }`. The viewer renders the field name in the Bulgarian label without unpacking before/after.
- Status transitions in the dedicated `*.status_changed` form: `payload: { from: "draft", to: "active" }`. Equivalent to `before/after` but flatter and historically the older form on properties/contracts.
- Deletion reasons / cancellation context: `payload: { reason: "Имотът е продаден извън платформата" }`.
- Import-batch identifiers: `payload: { batch: "csv_2026_05_15_001", rows: 872 }`.
- Outcome / classification: `payload: { outcome: "happened", duration: 45 }`.

### 4.3 Both
Either or both can be set per call. Most field-level edits set both: `payload: { field }` + the matching `before`/`after`. The viewer prefers `before/after` when both are present, falling back to `payload` otherwise.

### 4.4 Sensitive fields — redaction
The CLAUDE.md hard rule: **never surface ЕГН, phone, or email in logs, URLs, or error messages.** The audit log is the one exception by design — it's GDPR-grade access tracking, admin-only read — but with redaction rules:

- **`ЕГН`**: NEVER log the actual digits in `before` / `after`. Emit the event with `payload: { field: "egn", masked: true }` and `before/after: { egn: null }` (sentinel meaning "value redacted, change happened"). The admin viewer renders "ЕГН променено" without exposing either value. The full plain-text comparison only exists at the moment of write — once the row is committed, the digits are gone.
- **`phone`**: log values. The audit log is admin-only read; phones are needed in forensic flows ("which contact did the deleted lead point at?"). Still never surface them in toasts or page URLs (separate rule).
- **`email`**: same as phone — log values for forensic utility, never echo in user-facing surfaces.
- **`auth.login.failed`** logs `payload: { email }` because the whole point is "which account is being targeted." This is the canonical exception.

When you add a new module, audit any field that resembles personal-identifier weight (passport number, IBAN, etc.) and apply the same `masked: true` sentinel.

## 5. Recording — the `recordAuditEvent` helper

Source: `lib/auth/audit.ts`. Contract:

```ts
await recordAuditEvent({
  actorId,            // string | null — null for system-emitted
  action,             // typed AuditAction union
  targetType,         // optional, lowercase singular noun
  targetId,           // optional, UUID
  payload,            // optional JSON
  before, after,      // optional JSON
  ip, userAgent,      // optional, from request headers
});
```

### 5.1 Never block the business action
The helper wraps the insert in try/catch and logs to `console.error` on failure. **A failure to write the audit row must never block the business action.** A user editing a contact whose audit emission fails should still see the contact update succeed.

This is a deliberate trade — we'd rather lose an audit row to a transient Postgres hiccup than refuse a legitimate edit. If the database is in genuinely bad shape, the underlying business action will fail too, before we even reach the audit call.

The cost: we don't have at-least-once delivery on audit rows. Acceptable because:
- The failure mode requires Postgres being broken specifically on the audit table.
- The `console.error` surfaces in server logs, where the platform's log aggregator picks it up.
- Phase 1 doesn't ship to a regulated environment that requires guaranteed audit.

If a future phase requires guaranteed audit (banking-grade compliance), the path is: queue rows to a separate durable buffer (Redis stream, SQS) and reconcile asynchronously. Not in scope today.

### 5.2 Where to call from
- **Server actions** — almost all audit calls happen here, right after the Prisma mutation succeeds and before `revalidatePath` / `redirect`. Pattern is consistent across the codebase.
- **API routes** — for routes that mutate (`/api/properties/import`, `/api/files/sign` for view-tracking). Same shape.
- **Background jobs** (cron, parsers) — `actorId: null`, otherwise identical.

Do not call from client components. The helper is server-only.

### 5.3 Capturing IP + user-agent
The action handler reads `headers()` and passes through:

```ts
const hdrs = await headers();
await recordAuditEvent({
  // ...
  ip: hdrs.get("x-forwarded-for") ?? null,
  userAgent: hdrs.get("user-agent") ?? null,
});
```

Behind Vercel the `x-forwarded-for` header is set; locally it's `null`. The viewer handles `null` gracefully.

System-emitted events with no HTTP context (cron, webhook ingest after the request has terminated, etc.) pass both as `null`.

## 6. File-access events — special case

Per `_foundations/ui-patterns-files.md`, opening or downloading a file routes through `/api/files/sign` which mints a short-lived Supabase storage signed URL. That route logs **on the read path**:

- `contracts.attachment.viewed` / `contracts.attachment.downloaded`
- `invoices.attachment.viewed` / `invoices.attachment.downloaded`

This is the one place where a "view" is audited. Rationale: contract attachments and invoice files often contain financial/legal content. Knowing who has opened a specific file is a real compliance ask.

We do **not** log when a row appears in a list response or when a detail page loads. Only the explicit file-fetch action.

## 7. Read access — `/admin/audit`

Shipped at `app/(app)/admin/audit/page.tsx`. Admin role only — `requireRole("admin")`. Phase 1 surface:

- Latest 100 events, descending by `at`.
- Columns: Кога / Извършил / Действие / Подробности / IP.
- Bulgarian action label via `AUDIT_LABELS`, with a tone-coded `StatusBadge` (`info` / `success` / `warning` / `danger` / `neutral`).
- Falls back to the raw `action` string in monospace if the label map doesn't cover it — surfaces stale taxonomy at a glance.
- `payload` is rendered as a one-liner `key: value · key: value` collapse. The full JSON is in Postgres for ad-hoc queries.

**Not yet shipped** but designed-for:

- Filters (actor, action, date range, targetType, targetId).
- Search across `payload` / `before` / `after` (Postgres `jsonb` GIN).
- Pagination beyond the first 100.
- CSV export for the auditor.
- Linkbacks: clicking a target opens the related detail page in a new tab.

These move when the volume actually justifies them — currently the table is small enough that 100-row latest-only is enough for the admin to spot anomalies.

## 8. Per-record activity feed

A separate UI surface — the small "what happened to this record" panel on a Contact / Property / Contract / Lead detail page — reads from the same `AuditEvent` table but with:
- A `targetType` + `targetId` filter pinned to the current record.
- Role-scoped visibility (a user shouldn't see every audit row, only the relevant ones).
- Friendlier rendering (one-line summaries: "Иван Петров промени Телефон преди 3 часа").

This is the subject of `_foundations/activity-feed.md` (pending). The audit log is the data layer; the activity feed is one view of it. The same row may show up in `/admin/audit` (raw) and in a Contact's activity panel (formatted) without duplication.

## 9. Retention + GDPR

**Phase 1**: keep indefinitely. No TTL job, no archival.

Justification:
- Low volume — well under 100k rows expected in the first year.
- GDPR allows audit logging under *legitimate interest* for security + accountability, provided access is restricted and proportional. Admin-only read meets that.
- The taxonomy doesn't store profile data the user could ask to delete except via the `actor` FK. A user being deleted today is soft-deleted at the Profile level; the audit `actorId` becomes a dangling reference (Prisma `Profile?` is already nullable in the relation) — their name is no longer queryable, the action history persists.

**Future**:
- TTL job that hard-deletes events older than N years (likely 7, matching Bulgarian accounting-record retention). Run nightly, log how many rows it pruned.
- A GDPR subject-data-request export that pulls every event where `actorId = <subject>` OR where `payload`/`before`/`after` references the subject. Schema doesn't directly support the second case yet (no full-text index on JSON); when it ships the export becomes a `jsonb_path_ops` GIN scan.
- An archival tier — move events older than 1 year to a separate `audit_events_archive` table on slower storage. Premature today.

## 10. What this is not

- **Not an event sourcing log.** The audit table is supplementary; the source of truth is each module's own model. You cannot reconstruct the current state of a `Contact` by replaying audit events — that would require capturing every field change in `after`, which we deliberately don't (we only capture changed fields, never the full row).
- **Not real-time push.** Inserts are synchronous with the business action; readers poll. No websockets, no SSE. Activity feed reads happen on page load + nav.
- **Not a metrics pipeline.** Per-action volume + latency belongs in observability (server logs, future telemetry), not in this table. Querying `count(*) WHERE action = 'login.failed'` is fine for spot checks, not for dashboards.
- **Not a replacement for module-level history tables.** `PropertyStatusHistory` and `RenovationStatusHistory` (Phase 2) are denormalised for fast per-record reads. They duplicate information that's also in the audit log. The duplication is deliberate — see the rationale in `renovations.md` §11.

## 11. Adding a new event — checklist

When a new module or new mutation gets added:

1. **Pick the action name.** Follow §3.1 conventions; mirror a sibling module's pattern.
2. **Add it to the `AuditAction` union** in `lib/auth/audit.ts`. TypeScript enforces every caller from there on.
3. **Add a Bulgarian label** in `lib/auth/audit-labels.ts` with a tone (`info` / `success` / `warning` / `danger` / `neutral`). The admin viewer falls back to the raw string but every shipped action should have a label.
4. **Emit from the server action / API route.** Right after the Prisma mutation, before redirects/revalidations. Pass `actorId`, `targetType`, `targetId`, and the appropriate `before`/`after`/`payload`.
5. **Capture IP + UA** via `headers()` when in an HTTP context. Skip when in a cron/job.
6. **Apply redaction rules** (§4.4) for any sensitive field on the record.
7. **Update the module's spec** with a mention under its "Audit log" section (every shipped module has one).

If those six steps feel like a lot, that's the point — adding an audit action is small enough that it should never be skipped, structured enough that consistency is preserved.

## 12. Known gaps / future work

- No filtering / pagination / search in `/admin/audit` beyond "latest 100" (§7).
- No per-record activity feed surface yet (`activity-feed.md` pending).
- No CSV export from the viewer.
- No retention policy in code; events live forever.
- No write-side queue / durability guarantee. Acceptable for current scale (§5.1).
- No telemetry on audit-emission failures beyond `console.error`. A future log-aggregator integration could surface these.
- No PII-scrubbed export pathway for GDPR subject requests.

None of these block shipping; all of them are sensible next steps when usage justifies them.
