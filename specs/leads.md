# Leads module

## 1. Purpose
A Lead is a sales opportunity attached to a Contact. Every Meeting and every Contract flows from a Lead. Leads track inbound enquiries end-to-end: from first contact (manual entry or form email) through qualification and conversion to a signed contract (or long-term cold circulation).

Leads also measure how fast the sales team responds to inbound email enquiries — the module drives the company's email-responsiveness KPI.

## 2. Ideology
Two creation paths, two worlds:

- **Manual leads** are simple — a salesperson had a phone call, a walk-in, a referral. They click *Нов лийд*, pick the Contact, jot a line, done.
- **Email leads** are the high-value inbound channel and carry operational weight. They auto-link to Contacts, start an SLA timer, and land unassigned in a shared inbox until someone claims them.

**Leads are never "lost."** A quiet lead is in circulation. It can be re-invoked months later. Status `no_progress` replaces the traditional "lost" state.

**Everyone can delete any lead**, deliberately. This is a conscious deviation from the per-role delete rules on Contacts (see §10). Every delete leaves a trail in the audit log and the record is soft-deleted so an admin can restore it.

## 3. Source of truth
No seed CSV exists. Leads are a new surface — all data is created going forward. Inbound emails from the vminvest.bg website form will be the main volume driver once Phase 2 ships.

## 4. Data model

### 4.1 Fields

| Field (EN, code) | Label (BG, UI) | Type | Notes |
|---|---|---|---|
| `id` | — | uuid | PK |
| `contactId` | Контакт | FK → Contact | Required once the lead is saved. Email-parse flow may populate later (see §7.3). |
| `source` | Източник | enum | One of `manual`, `email_form`, `email_unparsed`, `phone`. |
| `status` | Статус | enum | One of `new`, `in_progress`, `converted`, `no_progress`. See §4.2. |
| `ownerId` | Отговорник | FK → Profile, nullable | The salesperson working the lead. Null = unassigned (email leads start here). |
| `properties` | Имоти | string[] | Free text entries, one per property of interest. Format: `"Сграда — Имот"` (e.g. `"Добруджа — B9"`) or `"Other — ..."`. Phase 2 migrates to FK when Properties ships. See §4.3. |
| `message` | Съобщение | text, nullable | Free-form text from the client (email body) or salesperson notes (manual). |
| `createdById` | Добавен от | FK → Profile | Who created the lead. For email leads, this is the `Система` pseudo-user. |
| `createdAt` | Дата на добавяне | timestamp | Auto. |
| `updatedAt` | Последна промяна | timestamp | Auto. |
| `deletedAt` | Изтрит | timestamp, nullable | Soft delete. |
| `deletedById` | Изтрит от | FK → Profile, nullable | Set on soft delete. |
| `deleteReason` | Причина | text, nullable | Optional note captured at delete time. |
| `convertedContractId` | Договор | FK → Contract, nullable | Set when this lead becomes a Contract. Status auto-flips to `converted` in the same transaction (see §9). |

#### Email-specific fields (null for manual leads)

| Field | Notes |
|---|---|
| `emailReceivedAt` | `Date:` header from the inbound email. Source of truth for the SLA timer. |
| `emailFrom` | `From:` address, verbatim. For `noreply@vminvest.bg` form emails this is always the same; the actual client address is in the parsed `Имейл` field (stored on the Contact). |
| `emailSubject` | For display and dedup debugging. |
| `emailMessageId` | `Message-ID:` header — deduplication key. The ingester skips emails whose `Message-ID` is already on a lead. |
| `rawEmailBody` | Plaintext body of the email, stored verbatim. Used by the human-review queue when parsing fails. |
| `parseError` | String code when `source = email_unparsed` (e.g. `missing_field:phone`, `no_plaintext_part`). Null otherwise. |

#### Contact-match metadata (email leads only)

| Field | Notes |
|---|---|
| `matchConfidence` | `high` / `medium` / `low`. See §7.3 for tiering. Null for manual. |
| `matchFlags` | string[] — e.g. `["possible_duplicate_contact"]` when `matchConfidence = low`. |

#### Response timer (email leads only)

| Field | Notes |
|---|---|
| `timerStartedAt` | Equals `emailReceivedAt` by definition. |
| `timerStoppedAt` | Null while open; set when someone stops it. |
| `timerStoppedById` | The user who stopped it. Stopping the timer also claims the lead (sets `ownerId` if null). |
| `timerStopComment` | Required text, **min 15 characters**. |
| `timerEscalatedAt` | Set when the daily job flags the lead as >24h unanswered. |

### 4.2 Status values

| Code | BG label | Meaning |
|---|---|---|
| `new` | Нов | Freshly created. No one's done anything yet. |
| `in_progress` | В процес | Someone's actively working it. |
| `converted` | Преобразуван | A Contract references this lead. Set automatically. |
| `no_progress` | Без прогрес | Stalled — client unreachable, went elsewhere, cooled off. **Not "lost" — can be re-invoked later by flipping back to `in_progress`.** |

Status transitions are free-form (any user who can edit can move between any two states), with one exception: `converted` is set only by the Contracts module creating a Contract that references this lead. Manually editing a status to `converted` is not allowed — the UI's status dropdown hides that option.

### 4.3 Properties (Phase 1 free text, Phase 2 FK)

Phase 1 stores `properties` as `string[]`. Each entry is a single human-readable description — the building name, an em-dash, and the unit identifier:

```
["Добруджа — B9", "Сердика — Ап.12"]
```

For the "client is looking at lots of things" case, use `"Other"` as the building:

```
["Other — разглежда многостайни в различни сгради"]
```

When the Properties module ships, `properties` migrates to a join table with `(leadId, propertyId)` pairs. A single `otherNote` text field will replace the `"Other — ..."` convention. The migration path is data-preserving — the strings are human-readable enough that a human can review edge cases during cutover.

## 5. Views

### 5.1 Table view (list)
Airtable-style table at `/leads`, same interaction model as Contacts:

**Default columns, left to right:**
1. Клиент (from the linked Contact's `fullName`)
2. Статус (badge)
3. Източник (badge)
4. Отговорник (with an "Unassigned" pill when null)
5. Имоти (first entry + "+N" indicator if more)
6. Създаден (date)
7. Таймер (only visible on email leads — shows elapsed time or "stopped ✓")

**Hidden-by-default columns:** Съобщение, Телефон (from Contact), Имейл (from Contact), Match confidence, Parse error.

**Inline editing** (per `_foundations/ui-patterns-inline-edit.md`):
- Статус — `<InlineStatusCell>`; `converted` is system-only (set by Contracts conversion flow).
- Източник — `<InlineStatusCell>`; only `manual` and `phone` user-selectable. `email_form` and `email_unparsed` are written by the Resend inbound webhook and rendered as current value only (systemOnly hides them from the picker).
- Отговорник — `<InlinePersonCell>` (all signed-in profiles, reassign anyone).
- Създаден — read-only with 🔒 badge.

**Filters** (top of table, collapsible):
- Статус (multi-select)
- Източник (multi-select)
- Отговорник (multi-select, with "Без отговорник" option)
- Сграда — parses the first token of each entry in `properties` before the em-dash
- Дата на добавяне (date range)
- "Само чакащи отговор" toggle — shows email leads with an open timer
- "Само изтекли >24ч" toggle — shows `timerEscalatedAt IS NOT NULL` and still open

**Search:** plain `ILIKE` across the Contact's `fullName` / `phone` / `email`, plus the lead's `message`, `properties` entries, and `emailSubject`.

**Pagination:** 100 per page, URL-driven, same pattern as Contacts.

### 5.2 Shared inbox view
A dedicated view (nav link "Входяща кутия") showing the subset of leads that need triage:
- `source = email_form` or `email_unparsed`
- `ownerId = null`
- `status IN (new, in_progress)`
- Not deleted

Sorted by `emailReceivedAt` asc (oldest first) — the point is to stop the oldest open timer next.

Visible to all roles. The "Таймер" column is prominent; color ramps from neutral → warning at 12h → danger at 24h.

### 5.3 Lead profile page
URL: `/leads/[id]`. Layout:

**Header block**
- Client name + link to the Contact profile
- Status badge, source badge, owner pill
- Elapsed-timer badge for email leads with open timers
- Action buttons: *Редактирай*, *Спри таймера* (email + open timer only), *Изтрий*

**Details panel** (left column, ~1/3 width)
- Source, status, owner, created-by/at, updated-at
- Properties list
- Message (full text)
- For email leads: `emailReceivedAt`, `emailSubject`, `emailMessageId`, match confidence + flags
- For `email_unparsed`: the `rawEmailBody` in a collapsed panel + `parseError` code

**Relations panel** (right column, ~2/3 width)
- Срещи (Meetings) — list, with *+ Нова среща* inline (Phase 2, once Meetings ships)
- Договори (Contracts) — list (Phase 2, once Contracts ships)

**Activity feed** (full-width below) — Phase 2. Same model as Contacts' activity feed (manual notes + system events). Phase 1 ships without it.

## 6. Create / Edit / Delete

### 6.1 Manual creation
`+ Нов лийд` button at top-right of the list or inbox views. Opens a form page.

**Required fields:**
- Contact (search/select existing; shortcut to `+ Нов контакт` if not found)
- Source (defaults to `manual`, can be set to `phone`)

**Optional on creation:**
- Properties (repeater: "Add property" → text input per row)
- Message / notes
- Owner (defaults to the creator; can be blanked or reassigned in the same form)

**Status on create:** `new`.

**Creator becomes owner by default.** The creator can unassign themselves or hand off to anyone on the team either during creation or from the profile page afterwards.

### 6.2 Email ingestion (Phase 2)
See §7 below.

### 6.3 Edit
Single *Редактирай* button opens a form page (consistent with the Contacts decision — no inline per-field editing). All lead fields are editable by anyone with edit permission (§10) except:
- `status = converted` can only be *set* by the Contracts module; users can't select it from the dropdown.
- Email-specific fields (`emailReceivedAt`, `emailMessageId`, etc.) are read-only.
- Timer fields are written only by the "stop timer" flow, not directly editable.

### 6.4 Delete
Soft delete: sets `deletedAt`, `deletedById`, `deleteReason`. The row remains in the DB; default list queries filter it out.

Confirmation modal before delete, with an optional reason textarea. Audit event recorded: `leads.delete` with actor + targetId + reason.

**Deleted leads can be restored** by an admin via `/admin/leads/trash` (Phase 2 — keep scope tight on C1).

**Cascade on Contact deletion:** per Contacts.md §5.2 contact children are *orphaned, not cascaded*. If a lead's Contact is deleted, `contactId` remains set (dangling) until an admin reassigns. The list view shows such leads with a "Липсващ контакт" badge.

## 7. Email ingestion (Phase 2)

### 7.1 Source
Inbound emails at `office@vminvest.bg` hosted on superhosting.bg (cPanel / Exim / Dovecot). All form emails arrive from `noreply@vminvest.bg` with subject exactly `[vminvest.bg] Форма за интерес към имот`. Emails not matching both criteria are ignored (no lead created, no record kept).

### 7.2 Parser
Read the `text/plain` part of the multipart email. Format is **label-newline-value-blank-line**:

```
Проект:
Добруджа

Имот:
B9

Име и фамилия:
Лъчезар Христов

Имейл:
lhristov_@abv.bg

Телефон:
088331803

Съобщение:
Здравейте, интересуваме се от ...

Съгласие за маркетинг:
не
```

**Mapping:**
- `Проект` + `Имот` → `properties[0] = "Проект — Имот"`
- `Име и фамилия` → used for Contact matching / creation; stored on the Contact, not the Lead
- `Имейл` → Contact's email
- `Телефон` → Contact's phone
- `Съобщение` → Lead's `message`
- **`Съгласие за маркетинг` is ignored** — we don't capture marketing consent anywhere in the system

**Parse failures** (any required label missing, `text/plain` part absent, malformed multipart):
- Create a lead with `source = email_unparsed`, `status = new`, `ownerId = null`, `rawEmailBody` populated, `parseError` set to a short code. The lead appears in the shared inbox — a human reads the raw body, fills the missing fields manually, flips `source` to `email_form`.

### 7.3 Contact matching (tiered)

Resolve the sender to a Contact using this ladder:

| Condition | Action | `matchConfidence` | `matchFlags` |
|---|---|---|---|
| A Contact matches on **both** email and phone | Link lead to that Contact | `high` | — |
| A Contact matches on email; phone is missing on the Contact record | Link lead to that Contact | `medium` | — |
| A Contact matches on email; phone differs | Link lead to that Contact | `low` | `["possible_duplicate_contact"]` |
| No email match | Create a new Contact per `Contacts.md §5.1b` (type = `Електронно запитване`, owner = null, createdBy = `Система`). Link lead to the new contact. | — | — |

**Ambiguity:** if multiple Contacts match on email, pick the one whose phone also matches (→ `high`). If none match phone, pick the most recently updated one and set `matchConfidence = low` with `matchFlags = ["multiple_email_matches"]`.

### 7.4 Deduplication
Two emails with the same `Message-ID` produce one lead (the second is ignored with an audit note). Two emails from the same client with different `Message-Id`s always produce separate leads — even if they arrive minutes apart, because they're distinct enquiries.

### 7.5 Implementation

The ERP exposes **a single POST endpoint** that the ingestion source calls: `/api/leads/ingest`. Bearer-token authed with `LEADS_INGEST_TOKEN` (see `.env.example`). Accepts the raw email either as `text/plain` body or `{"raw": "..."}` JSON. Idempotent via `Message-ID` dedup. This endpoint is source-agnostic — wiring it up is purely a "who POSTs to it" question.

Three viable sources:

**(a) IMAP polling.** A small Node script (or Supabase Edge Function, or external worker) connects to `mail.vminvest.bg:993`, fetches unseen messages, POSTs each raw source to `/api/leads/ingest`, marks them seen. Needs IMAP credentials in Supabase Vault. Runs on any cron (pg_cron, Vercel Cron, GitHub Actions, a cheap VPS).

**(b) cPanel "Pipe to Program" / `.forward`.** On some superhosting.bg plans you can pipe incoming mail into a program or forward to an external address. Forward to an inbound-mail-as-a-service provider (see (c)) or to a small Cloud Functions-style handler.

**(c) Inbound-email service webhook.** Configure a forwarding rule from `office@vminvest.bg` to an inbound address provided by Resend Inbound / Postmark / CloudMailin / Mailgun Routes. That service receives the email, POSTs a webhook to a thin adapter that re-POSTs the raw source to `/api/leads/ingest`. Cleanest but adds an external dependency.

Decision criteria — in priority order:
1. **Does superhosting.bg let you pipe/forward?** If yes → (b) or (c). If no, fall back to (a).
2. **Do you want to avoid a third-party mail vendor?** Then (a) is the only no-extras path.
3. **Do you want zero background work on your side?** Then (c).

Action items before picking:
1. In cPanel → Forwarders, test whether forwarding `office@vminvest.bg` to an external address works.
2. Check whether your hosting plan exposes "Pipe to Program" or `.forward` support.
3. Confirm IMAP is enabled (it usually is on Exim/Dovecot).

Once picked, the wiring is small: **one script or one webhook adapter that calls `/api/leads/ingest` with the raw email**. Everything downstream — parser, matcher, dedup, timer, escalation — is already live.

### 7.6 Scheduled work

A second endpoint `/api/leads/escalation-scan` (same bearer token, accepts GET or POST) runs the 24h-escalation sweep + sends the manager digest email. Call on any cron schedule — **every 15 minutes is plenty** since the scan is idempotent. The inbox page also opportunistically runs the scan on every render, so the cron is a backstop for periods when nobody's looking.

## 8. Response timer (Phase 2)

### 8.1 Applies to
Email leads only (`source = email_form` or `email_unparsed`). Manual leads have no timer — the creator's acknowledgement is implicit.

### 8.2 Start
Automatic at lead creation. `timerStartedAt = emailReceivedAt` (the email's `Date:` header).

### 8.3 Stop
Any authenticated user can click *Спри таймера* on a lead with an open timer. A modal opens:

- Textarea (required) — what happened / what was done. **Minimum 15 characters.** Submit disabled until the length condition is met.
- *Потвърди* button — on click:
  1. Validate comment length server-side (defense in depth against the client).
  2. Set `timerStoppedAt = now`, `timerStoppedById = actor.id`, `timerStopComment = comment`.
  3. If `ownerId` was null, set `ownerId = actor.id` (stopping the timer claims the lead).
  4. If `status = new`, bump to `in_progress`.
  5. Record audit event `leads.timer.stopped`.

### 8.4 Reassignment
If a lead is reassigned while the timer is still running, the timer **does not reset**. It continues counting from `timerStartedAt`. This is deliberate — the KPI measures the company's response time to the client, not the individual owner's time in seat.

### 8.5 Escalation
At 24h of elapsed time with the timer still open, a background job sets `timerEscalatedAt = now` and sends notifications:
- Email to all active managers + admins, listing every newly-escalated lead.
- In-app notification rows for the same recipients.

Once escalated, the lead remains "in the red" in the inbox view until the timer is stopped. No further escalations (this isn't a paging system).

### 8.6 KPI / reporting
Phase 2 scope — basic "median time-to-first-response" and "SLA breach rate" numbers on the sales dashboard (not built yet).

## 9. Lead → Contract conversion

When the Contracts module creates a Contract that references a Lead:

1. The `Contract` row is inserted with `leadId = X`.
2. In the same transaction, `Lead.convertedContractId = Contract.id` and `Lead.status = 'converted'`.
3. Audit event `leads.converted` is recorded.

The user cannot manually set `status = converted` — it's only set by the conversion flow. A converted lead becomes read-only except for its `message` (notes may still be appended).

## 10. Permissions

| Action | Admin | Manager | User |
|---|---|---|---|
| See the list of leads | ✅ | ✅ | ✅ |
| See a lead's profile | ✅ | ✅ | ✅ |
| Create a manual lead | ✅ | ✅ | ✅ |
| Edit a lead | ✅ | ✅ | 🟡 (only if assignee) |
| Reassign owner | ✅ | ✅ | 🟡 (only if current owner or unassigned) |
| Change status | ✅ | ✅ | 🟡 (if assignee) |
| Delete a lead (soft) | ✅ | ✅ | ✅ |
| Restore a deleted lead | ✅ | ❌ | ❌ |
| Stop a running timer | ✅ | ✅ | ✅ (claims ownership) |
| See the shared inbox view | ✅ | ✅ | ✅ |

**Deliberate deviation from the Contacts role pattern:** all roles can delete any lead. Rationale: inbound email leads often land on the wrong team member or are obvious spam/duplicates; junior salespeople shouldn't have to escalate every cleanup. Soft-delete + audit trail + admin restore provides the safety net.

→ **Roles.md needs updating** when this ships to document the deviation in the permissions matrix.

## 11. Validation
- `contactId` required on save (manual creation flow enforces this; email flow enforces it through the matcher/creator).
- `source` must be one of the four enum values.
- `status` must be one of the four enum values.
- `timerStopComment` min length 15 (server-side assertion, not only client-side).
- Properties entries trimmed, empty strings dropped.
- `properties[0]` for email leads: always `"Проект — Имот"` (parser guarantee). Manual leads impose no format.

## 12. Edge cases
- [ ] **Form email arrives while its Contact is soft-deleted.** The matcher considers only non-deleted Contacts. If the only email match is soft-deleted, treat as no match and create a new Contact.
- [ ] **Email lead's Contact is deleted after creation.** Lead survives with a dangling `contactId` (surfaced as "Липсващ контакт"); admin reassigns.
- [ ] **Two form emails from the same client in the same minute** — two separate leads (same Contact). Dedup only suppresses exact `Message-ID` repeats.
- [ ] **Manual lead where the Contact already has an open email lead** — allowed. Two leads for one Contact is fine (two separate enquiries in different channels).
- [ ] **Owner is deactivated while the timer is still running** — the lead stays assigned to them; inbox view shows the deactivated owner with a strikethrough. Any user can reassign.
- [ ] **User stops timer, then realises the comment was wrong** — a subsequent *Редактирай* can amend `timerStopComment` only by admin (audit-logged). Users cannot edit their own stop-comment after the fact.
- [ ] **Parse succeeds but `Имейл` is empty** — treat as parse failure (`parseError = missing_field:email`) because Contact matching requires it.
- [ ] **Sender forwards a form email from their personal mailbox** — `From:` will no longer be `noreply@vminvest.bg`; the ingester ignores the email. Such cases need manual lead entry.

## 13. Phase 1 / Phase 2 split

**Phase 1 (ship first):**
- Schema, migrations, `public.leads` table, soft-delete + audit wiring
- `/leads` list view (table, filters, search, pagination, column toggle)
- `/leads/new` manual create form
- `/leads/[id]` profile page (header + details, no relations panel, no activity feed)
- `/leads/[id]/edit` page
- Soft delete flow (any role, with reason)
- Status transitions (manual only for now; no `converted`)
- Owner assign/unassign
- Roles.md patched to document the delete deviation

**Phase 2 (post-Phase-1, not a single milestone — can be split):**
- Email ingestion (parser, matcher, auto-contact-create, duplicate handling)
- Response timer (start/stop/escalation/reporting)
- Shared inbox view (`/leads/inbox`)
- Admin restore trash view
- Activity feed (manual notes; system events when child modules exist)
- Relations panel tabs on the lead profile (meetings, contracts — once those modules exist)

## 14. Acceptance criteria (Phase 1)
- [ ] Manual lead creation requires a Contact and a source; all else optional.
- [ ] Creator is auto-assigned as owner; creator can unassign themselves in the same form.
- [ ] `/leads` renders a paginated, filterable, searchable table with a column toggle.
- [ ] Lead profile shows all details and a link to the Contact.
- [ ] Any user can delete any lead with a confirmation + optional reason; row is soft-deleted; audit event recorded.
- [ ] Deleted leads never appear in the list view; the DB row remains with `deletedAt` set.
- [ ] Edit respects the permission matrix in §10.
- [ ] All UI labels, buttons, and errors are in Bulgarian.
- [ ] Contacts.md §5.1b cross-reference updated to point here.
- [ ] Roles.md permissions matrix updated with the lead row.

## 15. Still to decide
1. **Soft vs hard delete retention window.** Currently soft-delete is forever. Should an admin be able to permanently purge leads older than N days? (Not urgent — revisit when DB size becomes relevant.)
2. **Number of properties per lead UI limit.** Practically unlimited, but we may want a soft cap (e.g. 10) to prevent runaway pastes.
3. **Contact relink confirm.** When editing a lead's `contactId`, should we surface a confirmation "Това ще премести лийда от [OLD] към [NEW]"? Phase 1 doesn't allow contact relink at all — it's read-only after creation — revisit if needed.
