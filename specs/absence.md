# Absence & Leave Management Module — Design Plan

## Context

This is a theorycrafting plan (no implementation yet) for a new module in a bigger ERP system. A Bulgaria-based company of ~25 employees needs to replace an ad-hoc, paper-only process with a digital absence/vacation system. Goals:

- Make **submission** near-zero-friction: pick a period, pick a category, attach a photo of the signed paper form, done.
- Make **approval** a single green/red click for managers.
- Give **employees** a clear live view of their balance and pace.
- Give **admins** real-time KPI dashboards and proactive anomaly alerts.
- Honor Bulgarian labor law: 20 annual paid days + up to 10 carryover, sick/parental tracked separately (NOI-governed), working-days calendar uploaded yearly by admin.
- Make the **calendar** a shared source of truth — everyone sees who is out, when, and under what category.

Confirmed decisions captured from the conversation:

| Topic | Decision |
|---|---|
| Auth | Inherited from parent ERP session (Supabase Auth, `auth.uid()`) |
| Platform | Responsive web app (phone + desktop) |
| Stack | Supabase (Postgres + Auth + Storage + Realtime + Edge Functions + pg_cron) + Next.js |
| Notifications | Email + in-app (no Slack/SMS for MVP) |
| 5-day notice rule | Soft (warn, don't block); flag tracked |
| Half-days | Supported |
| Retroactive sick leave | Allowed |
| Manager routing | One `manager_id` per employee; auto-delegate up the chain when approver is themselves absent |
| Cancellation | Pending = anytime; approved = needs re-approval |
| Admin override | Yes, full; every action audit-logged |
| New-hire quota | Admin enters pro-rata manually |
| Calendar privacy | Full transparency — everyone sees names + category colors |
| Anomaly rules | Oversize (>50% quota in one request), pace-ahead, late submission, team overlap |
| Quota accounting | Only PAID counts against 20+10; UNPAID/SICK/PARENTAL/WFH tracked separately |
| WFH approval | Requires manager approval (same flow as other categories) |
| Mail hosting | superhosting.bg (shared hosting), `mail.vminvest.bg` — Phase 4 approach depends on what this server supports (see §Phase 2 — Mail/OOO) |
| OOO (Thunderbird) | Phase 2 — sketched, not MVP |

## Architecture at a glance

- **Schema isolation:** all tables live in a `absence` Postgres schema.
- **Identity:** `absence.employees.id = auth.users.id`. The parent ERP syncs employee records (or we treat `absence.employees` as authoritative — decide at integration time).
- **Frontend:** Next.js App Router under `app/absence/`, grouped by role (`(employee)`, `(manager)`, `(admin)`). Tailwind + shadcn/ui, TanStack Query, `date-fns` + `date-fns-tz` pinned to `Europe/Sofia`.
- **Realtime:** Supabase Realtime subscriptions drive manager inbox and admin dashboard.
- **Scheduled work:** `pg_cron` for daily jobs (starting-today notification, re-routing, pace anomaly, year-end rollover).
- **Email:** Edge Function `send-notifications` dispatches emails via Resend/Postmark, triggered by `pg_net` webhook from an `AFTER INSERT` trigger on `notifications`.

## Data model (schema `absence`)

All tables: `id uuid PK default gen_random_uuid()`, `created_at timestamptz default now()`, `updated_at` (trigger). Dates for absence periods are `date` (not `timestamptz`) — pure calendar math, no DST drift.

### `absence.employees`
- `id uuid PK` (= `auth.users.id`)
- `full_name`, `email citext unique`
- `is_manager bool`, `is_admin bool` (orthogonal; both default false)
- `manager_id uuid` self-ref (nullable)
- `department text`
- `hire_date date`
- `annual_days numeric(4,1) default 20` (half-day granularity)
- `carryover_days numeric(4,1) default 0 check (<= 10)`
- `carryover_year int`
- `digest_mode text default 'instant'` — `'instant'` or `'daily_9am'`
- `ooo_template text` (Phase 2)
- `active bool default true`

RLS: name/email visible to all authenticated; balance columns visible via view filtered to self + admins.

### `absence.categories` (seed)
`code PK` (`PAID`, `UNPAID`, `SICK`, `PARENTAL`, `WFH`, `BEREAVEMENT`), labels EN/BG, `deducts_from_paid bool`, `allows_half_day bool`, `requires_approval bool` (all categories = true), `allows_retroactive bool`, `requires_document bool` (WFH = false, others = true), `color_hex text`.

### `absence.absence_requests`
- `employee_id`, `category_code`
- `start_date`, `end_date`, `start_half bool`, `end_half bool`
- `working_days_count numeric(4,1)` — snapshotted at submit, recomputed if calendar edited
- `status` ∈ `pending | approved | rejected | cancelled | cancel_pending`
- `current_approver_id uuid` — whose inbox owns this right now
- `submitted_at`, `decided_at`, `decided_by`, `rejection_comment`
- `document_path text` — Storage path
- `late_submission bool` (computed at submit: `start_date - submitted_at::date < 5`)
- `oversize_flag bool`
- `created_via text` ∈ `self | admin_override`
- `notes text`

Indexes: `(employee_id, start_date)`, `(status, current_approver_id)`, GIST on `daterange(start_date, end_date, '[]')` for overlap queries.

RLS:
- `select`: self, self's manager chain, any admin. Separate narrowed view for shared calendar (name + category + dates, no document, no notes).
- `insert`: self only; admins for anyone (`created_via = 'admin_override'`).
- `update`: `current_approver_id` or admin. Employee can set own status to `cancelled` (when pending) or `cancel_pending` (when approved). Hard constraint: `current_approver_id <> employee_id`.

### `absence.calendar_years` + `absence.calendar_days`
- `calendar_years(year PK, uploaded_by, uploaded_at, locked bool)`
- `calendar_days(day PK, is_working bool, holiday_name text, year int FK)`
- One row per day of the year. Admin flips weekends/holidays/shifted-working-Saturdays. Read = all; write = admin only.

### `absence.balances_view` (VIEW, computed)
Computed on demand from `absence_requests` where `status='approved'` and current calendar year. At 25 employees × ~50 requests/year, live computation is trivial. Promote to a materialized view only if performance bites.

### `absence.audit_log`
`actor_id`, `action` (e.g. `request.submit`, `request.approve`, `request.reject`, `request.admin_override`, `calendar.edit`, `balance.set`), `target_type`, `target_id`, `before jsonb`, `after jsonb`, `at`. Read = admin only; insert = triggers/service-role only.

### `absence.notifications`
`recipient_id`, `kind` (`request.submitted`, `request.approved`, `request.rejected`, `absence.starting_today`, `anomaly.*`, `year_end.carryover_risk`), `payload jsonb`, `read_at`, `email_sent_at`. Self-read; admin read all.

### `absence.anomaly_flags`
`request_id`, `rule` ∈ `late_submission | oversize_request | pace_ahead | team_overlap`, `severity` ∈ `info | warn | high`, `detected_at`, `resolved_at/by/note`.

### `absence.ooo_templates` (Phase 2)
Per-employee `subject`, `body_text`, `body_html`, `use_default bool`.

## Core algorithms

### Working-days calculation
**Postgres function** `absence.fn_working_days(start, end, start_half, end_half) returns numeric`. Sums `is_working` in `calendar_days` between dates, subtracts 0.5 per half-day flag if that boundary day is a working day. Called via RPC from the Submit form for live preview and by the `INSERT` trigger to snapshot `working_days_count`.

When admin edits `calendar_days` mid-year, a trigger recomputes `working_days_count` for every `pending`/`approved` request whose date range overlaps changed days **and fires an admin notification listing affected requests**. Never silently shift a balance without telling anyone. Locked (`calendar_years.locked = true`) past years are read-only unless admin explicitly unlocks.

### Manager-delegation routing
At submit time and whenever the assigned approver starts their own absence:
1. Start with requester's `manager_id`.
2. If candidate has an `approved` absence covering today → climb to their manager. Repeat (with cycle detection).
3. If chain ends → pick any active admin who is not the requester and not absent today.
4. **Self-approval is hard-blocked** via DB check constraint.

A daily `pg_cron` job re-routes pending requests whose `current_approver_id` started an absence since yesterday; a notification fires to the new approver. Admins can manually reassign any pending request (audit-logged).

### Anomaly detection
| Rule | When it runs | Severity |
|---|---|---|
| Late submission (<5 days) | On-submit trigger | `info` |
| Oversize (>50% annual quota single request) | On-submit trigger | `warn` |
| Pace ahead (used% / year-elapsed% > 1.5) | Daily `pg_cron` at 03:00 | `warn` |
| Team overlap (≥2 in same department off same day) | On-approve trigger | `warn` |

"Alert admins" = row in `anomaly_flags` + in-app notification + email (for `warn`/`high` only — never spam `info`) + realtime toast on open admin sessions.

## Notifications pipeline

1. **DB triggers** write rows to `absence.notifications` transactionally with the business state change.
2. **`pg_net` webhook** on `AFTER INSERT` of `notifications` calls Edge Function `send-notifications`, which fetches Resend/Postmark credentials from Supabase Vault and sends email. Updates `email_sent_at`.
3. **Scheduled (`pg_cron`, `Europe/Sofia`):**
   - 02:00 daily — `absence.starting_today`: find approved requests with `start_date = today`, notify all admins ("Vaklin will be absent starting today until Friday, 5 Mar").
   - 02:15 daily — re-route pending requests whose approver is newly absent.
   - 03:00 daily — pace anomaly scan.
   - Nov 15 annually — year-end carryover reminder emails (employees + admins).
   - Jan 1 02:00 — year rollover (see §Year-end).
4. **Digest mode**: managers with `digest_mode='daily_9am'` get a single 09:00 email summarizing all approvals requested the prior day instead of per-request emails.

## File upload

- **Bucket** `absence-documents` (private).
- **Path** `{employee_id}/{request_id}/{uuid}.{ext}` — folder prefix = employee id makes RLS policies trivial.
- **Accepted MIME**: `image/jpeg`, `image/png`, `image/heic`, `image/webp`, `application/pdf`.
- **Max 10 MB**, client-side JPEG transcode to ≤ 2 MB before upload.
- **Upload flow**: client calls Edge Function `create-document-upload` → function pre-creates `absence_requests` row in `status='draft'` and returns a signed upload URL → client uploads → client calls `submit-request` to flip to `pending`. Avoids orphan files and orphan rows.
- **Storage RLS**:
  - `SELECT`: `auth.uid() = (storage.foldername(name))[1]::uuid` (self) OR in requester's manager chain OR admin.
  - `INSERT`: path prefix must match `auth.uid()`.
  - `UPDATE/DELETE`: admin only.
- **Retention**: 5 years from end of the relevant calendar year (Bulgarian Labor Code art. 128a). `pg_cron` monthly job archives or deletes past retention, writing to `audit_log`. Retention period is a settings row, not hard-coded.

## UI screens

All under `app/absence/`, grouped by role.

| Screen | Path | Who | What it shows |
|---|---|---|---|
| Submit Request | `app/absence/(employee)/submit/page.tsx` | self | Category, date range, half-day toggles, live working-days count (RPC), document uploader, 5-day warning banner if applicable, submit button |
| My Dashboard | `app/absence/(employee)/my/page.tsx` | self | BalanceCard (paid taken/remaining/scheduled, sick YTD), PaceIndicator, upcoming approved, pending, history table |
| Manager Inbox | `app/absence/(manager)/inbox/page.tsx` | managers | Pending list, Approve (green) / Reject (red) buttons, reject-comment modal, DocumentViewer for the attached photo |
| Admin Dashboard | `app/absence/(admin)/dashboard/page.tsx` | admins | KPIs, realtime-subscribed |
| Admin: Employees | `app/absence/(admin)/employees/page.tsx` | admins | Table with `annual_days`, `carryover_days`, manager, role flags; row-edit drawer |
| Admin: Calendar | `app/absence/(admin)/calendar/page.tsx` | admins | Month grid; click a day to toggle working/holiday; bulk JSON/CSV upload for a new year |
| Shared Calendar | `app/absence/calendar/page.tsx` | all | Day/Week/Month; horizontal bars colored by category with employee name printed on the bar; public holidays shown as grayed column headers |
| Anomalies | `app/absence/(admin)/anomalies/page.tsx` | admins | Open flags, resolve action |
| Audit Log | `app/absence/(admin)/audit/page.tsx` | admins | Filter by actor/action/date |
| Profile (OOO) | `app/absence/(employee)/profile/page.tsx` | self | OOO template editor (Phase 2) |

**Shared components**: `AbsenceBar`, `BalanceCard`, `PaceIndicator`, `DocumentViewer`, `CalendarGrid`, `CategoryPill`.

**WFH**: goes through the same approval flow as any other category. The only difference vs. PAID/SICK: `requires_document = false`, so the uploader is hidden for WFH requests.

## Dashboard KPIs (16)

**Individual (admin drill-down):**
1. Paid days: taken / remaining / scheduled-future
2. Sick days YTD
3. Unpaid days YTD
4. Pace ratio (used% / year-elapsed%) — green <1.0, yellow 1.0–1.5, red >1.5
5. Carryover at risk (projected unused by Dec 31)

**Team / company:**
6. Who's out today / this week / this month
7. Category breakdown YTD (pie)
8. Days-taken distribution across 25 employees (histogram — spots outliers)
9. Department coverage heatmap by week
10. Average time-to-approve (hours)

**Anomaly / risk:**
11. Open anomaly flags by rule
12. Late submissions (last 30/90 days, per employee + total)
13. Rejected requests YTD (count + rate)
14. Company-wide carryover at risk (days that would be lost if Dec 31 passed today)
15. Upcoming long absences (>5 consecutive days in next 60 days)
16. Sick-leave frequency per employee per quarter — **admin-only KPI**, not surfaced anywhere else (sensitive)

## Year-end / carryover

Semi-automatic:

- **Dec 20** `pg_cron` — preview email to each admin + nudge to each employee showing projected year-end balance and carryover (capped at 10). Two weeks to burn days or plan for loss.
- **Jan 1 02:00 Europe/Sofia** `pg_cron` → `fn_year_rollover()`:
  - `new_carryover = min(10, annual_days + old_carryover - paid_taken_last_year)` per active employee
  - `annual_days` reset to policy default (admin-configurable per-employee)
  - `carryover_year = new_year`
  - `calendar_years.locked = true` for the year that ended
  - Every change → `audit_log`
- Admin can review and adjust in the first two weeks of January; adjustments also audit-logged.
- Usage order when deducting: oldest carryover first, then current-year allocation.

## Phase 4 — Mail / OOO integration (honest sketch)

**Mail setup:** `mail.vminvest.bg` is hosted on **superhosting.bg** — a Bulgarian shared-hosting provider running **cPanel + Exim + Dovecot**. Thunderbird is only the client; all OOO logic must live on the server. This changes the realistic options vs. what I originally sketched:

**A. cPanel Autoresponder API (preferred).** cPanel has a first-class Autoresponders feature on every email account, with a public API (`UAPI Email::add_auto_responder` and `Email::delete_auto_responder`). Each approved absence triggers an Edge Function that calls cPanel's API with the employee's email, subject, body (from `ooo_templates`), start/end timestamps. cPanel natively supports date-ranged autoresponders, so we don't need our own cron to enable/disable.
- **Pros:** works with existing hosting, no per-user IMAP credentials needed, uses hosting-level API token (admin-provisioned, stored in Supabase Vault).
- **Unknowns to verify:** (1) does superhosting.bg allow API token access to `UAPI` on their shared-hosting plan, or only via cPanel UI? Their control panel may be a custom skin. (2) is there rate limiting? (3) does the hosting plan include a way to manage autoresponders programmatically, or is it reserved for reseller/VPS tiers?

**B. ManageSieve + vacation script (fallback).** If cPanel autoresponder API isn't exposed, check whether superhosting.bg enables Dovecot ManageSieve (RFC 5804). If yes, we install a `vacation` script per user over port 4190. Needs per-user IMAP credentials in Supabase Vault, which means each employee enters their mail password once at profile setup (not ideal for password hygiene).

**C. Thunderbird WebExtension helper (last resort).** An add-on installed on each employee's Thunderbird polls an Edge Function `/ooo/current` and toggles the built-in Vacation Response filter. Fragile — works only while Thunderbird is open, so OOO breaks the moment the laptop closes.

**D. Re-scope to Google Workspace / Microsoft 365.** If a mail migration is ever on the table, both have clean server-side OOO APIs and this becomes trivial. Worth a cost/benefit discussion separately.

**Action items before starting Phase 4:**
1. Log into superhosting.bg control panel and check whether API tokens are available on the current plan.
2. Try to connect to `mail.vminvest.bg:4190` (ManageSieve) from a test script to see if it's open.
3. Test the cPanel autoresponder UI manually to confirm the date-range fields behave as documented.

Once those three checks are done, the approach picks itself. **Recommendation: attempt A first**, fall back to B, avoid C unless nothing else works.

## Highly-recommended additions you didn't mention

Already folded into the plan above; flagging explicitly because you asked:

- **Audit log** of every approval/rejection/override/balance-edit.
- **Manager rejection comment** (optional, text field).
- **Year-end reminder emails** (Dec 20 preview).
- **CSV export** `/api/absence/export?year=YYYY` — per-employee day counts by category + raw-requests dump. Essential for payroll.
- **Bereavement leave** as a 6th seeded category (Bulgarian Labor Code grants 2 days).
- **Coverage conflict warnings** via the `team_overlap` anomaly.
- **Manager digest mode** so a manager approving 5 requests in one morning gets one email, not five.
- **ICS calendar feed per employee** (`/api/absence/ical?token=...`) — subscribe in personal Google/Outlook calendar.
- **Localization EN + BG from day one**; dates in `dd.MM.yyyy` (Bulgarian convention).
- **Timezone pinning to Europe/Sofia** everywhere; `date` (not `timestamptz`) for absence periods.
- **HR access to sick-note documents gated behind a reason prompt**, logged to audit — protects employee privacy under GDPR.
- **Two-person rule for balance edits > ±5 days** — a second admin confirms. Cheap safeguard against typos and misuse.
- **Soft-delete everywhere** (`deleted_at`) rather than hard deletes, except for GDPR-mandated removals.

## Implementation phasing

**Phase 0 — Foundation (~1 week)**
- Schema, RLS, seed categories, storage bucket + policies
- Employee sync from parent ERP, auth wiring
- Audit-log write path

**Phase 1 — MVP (~2–3 weeks)** — thinnest viable product
- Submit request (PAID + SICK only) with document upload
- `fn_working_days` RPC, live preview on form
- Manager Inbox: approve/reject with comment
- Employee Dashboard: balance card + pace indicator + history
- Shared calendar — month view
- Admin: Employees & Balances, Calendar upload
- Basic notifications (in-app + email on submit/approve/reject)

**Phase 2 — Completeness (~2 weeks)**
- Remaining categories: UNPAID, PARENTAL, WFH, BEREAVEMENT
- Half-day support
- Admin override + retroactive sick leave
- Anomaly flags + admin anomaly page
- Manager re-routing / delegation
- Daily `pg_cron` jobs: starting-today, pace, re-route
- Cancellation flow (pending + approved-with-re-approval)

**Phase 3 — Polish (~1–2 weeks)**
- Admin dashboard full KPIs + realtime subscriptions
- Week/Day calendar views
- CSV export, ICS feed
- Year-end rollover + Dec 20 preview
- Digest mode
- BG localization pass

**Phase 4 — Mail / OOO integration**
- Depends on cPanel API / ManageSieve availability check. See §Phase 4 — Mail / OOO integration.

## Critical files to create (at implementation time)

- `supabase/migrations/0001_absence_schema.sql` — all tables, RLS, seed categories, `fn_working_days`, triggers
- `supabase/migrations/0002_absence_cron.sql` — `pg_cron` schedules
- `supabase/functions/send-notifications/index.ts` — email dispatcher
- `supabase/functions/create-document-upload/index.ts` — signed upload + draft row
- `supabase/functions/submit-request/index.ts` — finalize draft → pending
- `app/absence/(employee)/submit/page.tsx` — core submission UX
- `app/absence/(employee)/my/page.tsx` — self dashboard
- `app/absence/(manager)/inbox/page.tsx` — approval inbox
- `app/absence/(admin)/dashboard/page.tsx` — KPIs + realtime
- `app/absence/(admin)/employees/page.tsx` — balance management
- `app/absence/(admin)/calendar/page.tsx` — working-days editor
- `app/absence/calendar/page.tsx` — shared team calendar
- `lib/absence/workingDays.ts` — client-side helpers mirroring `fn_working_days` for UX (optimistic preview before server validates)
- `lib/absence/routing.ts` — manager-delegation algorithm (used by submit trigger and daily re-route job)

## Verification

Since this is theorycrafting with no implementation, "verification" here means validating the design itself:

1. **Walk through user stories end-to-end**:
   - Employee submits a 3-day PAID request → see expected balance deduction, notification, calendar bar, pace impact.
   - Manager approves → employee notification, admin notification, calendar updates, KPI refresh.
   - Manager rejects with comment → balance unchanged, employee sees comment.
   - Employee cancels pending → balance unchanged, disappears from manager inbox.
   - Employee requests cancellation of approved (future) → manager sees cancel request, approves, balance restored.
   - Admin logs retroactive sick leave for someone → balance untouched (SICK doesn't deduct), calendar populated, audit entry written.
   - Admin edits calendar mid-year to add a shifted holiday → `working_days_count` of overlapping approved requests recomputed, admins notified of affected requests.
   - Manager A (approver for Employee X) is themselves on approved vacation today → X's new request routes to A's manager automatically.
   - Jan 1 rollover → each employee's balance reset, carryover capped at 10, old-year calendar locked, audit entries written.

2. **Walk through security edge cases**:
   - Self-approval attempt blocked at DB constraint.
   - Non-admin trying to read another employee's document → 403 via Storage RLS.
   - Non-admin trying to read sensitive KPI (sick frequency) → view filtered to admin only.

3. **Walk through the anomaly rules** with made-up examples to confirm thresholds feel right.

4. **Review RLS policies** line-by-line with the user before writing migrations.

5. **Confirm mail server** for Phase 4 scoping.

Once implementation begins, verification becomes: Supabase test suite for RLS (`supabase test db`), Playwright for the end-to-end flows above, and manual smoke-test of the calendar and dashboards with seeded test data.
