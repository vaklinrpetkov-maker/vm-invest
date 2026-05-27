# Meetings Module

## 1. Purpose
Track all client-facing meetings the sales team holds, from first presentation through contract signing and follow-ups. Every meeting is attached to a Lead. Keeps the whole team visible on who's meeting whom, when, and what happened.

## 2. Ideology
Dead simple. No external calendar sync, no invites sent to clients, no booking widgets, no complex approvals. Just: create a meeting → assign people → add notes after → see it all on a calendar.

## 3. Flow — creating a meeting

1. User clicks **Срещи → Нова среща** (Meetings → New Meeting).
2. **Associate with a Lead.** Required. Without a Lead, the flow cannot continue.
   - Autocomplete search against existing Leads (by client name).
   - If the Lead doesn't exist yet, shortcut: **"Създай нов лийд"** opens an inline Lead-creation dialog. After creating the Lead, user returns to the meeting flow with the new Lead pre-selected.
3. **Date and time.** DD.MM.YYYY date picker + HH:MM time input (24h). Europe/Sofia timezone.
4. **Duration.** Dropdown: 15 / 30 / 45 / 60 / 90 / 120 minutes, plus **"Друга продължителност"** (other) for a custom value. Zero-duration is allowed (e.g., a quick call logged as a meeting).
5. **Type.** Dropdown, one of:
   - Презентация в офиса (presentation office)
   - Презентация на място (presentation onsite)
   - Подписване на договор (contract signing)
   - Последваща среща (follow-up meeting)
   - Друго (other)
6. **Location.** Free-text field (optional). Useful for "onsite" meetings — the address, property, or building. For office meetings it can be left blank.
7. **Assignees.** At least one. The user creating the meeting is automatically added as an assignee; they can remove themselves or add others. Multiple assignees are supported.
8. **Notes field** (optional). A multi-line text area. Can be filled out at any time — before, during, or after the meeting. Editable after the meeting is saved.
9. **Attachments** (optional). File upload, multiple files allowed. Stored in Supabase Storage, linked to the meeting.
10. **Save.**

### 3.1 Past-date handling
The user can still create a meeting with a past date (useful for logging meetings that already happened but weren't recorded). When this happens, the meeting is **flagged visually with a red border** in the calendar and the meeting detail page. No notifications sent to anyone — the red border is the signal.

### 3.2 Overlapping meetings
Allowed silently. No warning when a user is double-booked — sometimes two salespeople cover overlapping slots, or a meeting runs into another. The calendar will render them side-by-side in the same time slot.

## 4. Editing, deleting, permissions

### 4.1 Edit rules
- **Anyone assigned to a meeting can edit it** — the date, time, duration, type, location, notes, attachments, and assignees (add/remove).
- **Users not on the meeting cannot edit it.**
- **Managers and admins can edit any meeting**, regardless of assignment.

The permission rule is enforced in two layers (per `_foundations/ui-patterns-inline-edit.md` §2 principle 5): the page computes `canEdit` per row from `lib/meetings/permissions.ts` and passes it into the inline cells (which render `disabled` for unauthorized rows); the server actions in `field-actions.ts` also enforce — so a stale page or a tampered client still gets rejected. The cells inline-edit `startsAt`, `type`, `location` directly on the list. Status is not inline-editable — transitions go through `markHappened` / `cancelMeeting` to capture outcome and reason.

### 4.2 Delete rules (soft delete)
- Meetings are **soft-deleted** — marked as cancelled, not removed from the database.
- Permission to delete = same as edit: assignees, managers, admins.
- Cancelled meetings are **hidden from the default calendar view** but remain visible via a filter toggle ("Покажи отменените").
- Cancelled meetings can be **restored** by anyone with permission to edit them, within a 30-day window. After 30 days, only admins can restore.
- When cancelling, user is prompted for an optional reason which is stored on the meeting.

### 4.3 "Happened" status
- Every meeting has a status: **предстояща** (upcoming) by default.
- After the meeting's end time has passed, any assignee can manually mark it as **състояла се** (happened). They're prompted to add optional outcome notes when marking.
- Meetings are never auto-marked. A past-due unmarked meeting stays as "upcoming" with a visual fade indicating it's past its date.
- Status options: **предстояща** (upcoming), **състояла се** (happened), **отменена** (cancelled).
- No "did not happen" / "no-show" state — if a meeting doesn't happen, the user cancels it (soft-delete) or reschedules by editing the date.

## 5. Calendar view

### 5.1 Views available
- **Day / Week / Month / Year** — toggle at the top. Week is the default.
- **List view** — chronological list, filterable by assignee / type / status. Default on mobile.

### 5.2 What's shown on each meeting entry
- Client name (from the Lead)
- Meeting type label
- Assignee name(s) — all of them, if multiple
- Time (and duration if the slot is big enough)
- Red border if the meeting was created with a past date
- Faded opacity if end time has passed and not yet marked "happened"
- Strikethrough or filled styling if marked "happened"

### 5.3 Colors — by meeting type
Each type has a fixed color. Same colors used everywhere meetings appear (calendar, lists, dashboards).

| Тип | Type | Color |
|---|---|---|
| Презентация в офиса | Office presentation | Blue |
| Презентация на място | Onsite presentation | Green |
| Подписване на договор | Contract signing | Gold / Amber |
| Последваща среща | Follow-up meeting | Purple |
| Друго | Other | Grey |

Exact color values (hex codes, contrast-safe accessible pairings) to be picked by whoever implements the visual styling — above are just the semantic intents. A legend is always visible on the calendar page.

### 5.4 Filters
- Filter by assignee (multi-select)
- Filter by meeting type
- Filter by status (upcoming / happened / cancelled) — cancelled hidden by default

### 5.5 Click behavior
Clicking a meeting opens its detail page (full page, not a modal) — all info, notes, attachments, edit actions.

## 6. Data model

```
Meeting
  ├─ id
  ├─ lead_id (FK → Leads) — required
  ├─ starts_at (datetime, Europe/Sofia)
  ├─ duration_minutes (integer, can be 0)
  ├─ type (enum: office_presentation / onsite_presentation /
  │         contract_signing / follow_up / other)
  ├─ location (string, nullable)
  ├─ notes (long text, nullable)
  ├─ status (enum: upcoming / happened / cancelled)
  ├─ happened_outcome (long text, nullable — set when marked "happened")
  ├─ cancel_reason (long text, nullable — set when cancelled)
  ├─ cancelled_at (datetime, nullable)
  ├─ cancelled_by (FK → Users, nullable)
  ├─ created_by (FK → Users)
  ├─ created_at
  ├─ updated_at
  └─ assignees (many-to-many → Users, always includes created_by initially)

MeetingAttachment
  ├─ id
  ├─ meeting_id (FK → Meeting)
  ├─ file_name
  ├─ file_url (Supabase Storage URL)
  ├─ uploaded_by (FK → Users)
  └─ uploaded_at
```

## 7. Notifications
None. No email, no Slack, no in-app push. The calendar + red borders for past-dated meetings are the only signals.

Out of scope for v1: reminder emails, "meeting in 15 minutes" notifications, day-ahead digests. Can be revisited later if the team asks for them.

## 8. Edge cases
- [ ] User tries to create a meeting without selecting a Lead — "Създай нов лийд" shortcut appears; save blocked until a Lead is chosen.
- [ ] User cancels a meeting, then wants it back — restore button visible for 30 days, admin-only after.
- [ ] User edits a meeting's date to a past date — same red-border flag applies as if created with a past date.
- [ ] User adds a file over the storage size limit (Supabase default: 50 MB per file) — clear error message, file rejected, meeting still saves.
- [ ] Meeting's Lead is deleted — meeting becomes "orphaned." Block Lead deletion if it has associated meetings (show count), OR cascade-cancel all associated meetings. **Decision needed — see section 11.**
- [ ] Two users assigned to a meeting edit it at the same time — last write wins. No locking (small team, rare conflict).
- [ ] User marks a meeting "happened" before its scheduled time has passed — allowed (maybe the meeting started early and wrapped up). Show a small info icon.
- [ ] User restores a cancelled meeting whose date is now in the past — meeting is restored and gets the past-date red border treatment.

## 9. Permissions summary (per `roles.md`)
- **Admins** — full access (see, create, edit, delete/cancel, restore any meeting).
- **Managers** — same as admins for meetings.
- **Users (sales)** — can create any meeting. Can edit/cancel only meetings they're assigned to. Can see all meetings the team is holding (view access is team-wide).

## 10. Known tradeoffs
- **Soft-delete means the database grows indefinitely** with cancelled meetings. Not a real concern at 25-person scale but worth noting.
- **Color-by-type means the calendar doesn't immediately show who owns what** — you have to read the assignee names. Tradeoff chosen for simplicity. If salesperson-level ownership becomes the more important visual cue later, colors can be switched to per-assignee.
- **No notifications** means it's on each salesperson to check the calendar daily. Fine for an office-based team but a possible issue as the team grows or becomes more distributed.

## 11. Still to decide before building
1. **Lead deletion behavior** — if a Lead with associated meetings is deleted, do we block the deletion, cascade-cancel the meetings, or orphan them? Recommended: block deletion and surface a message "Този лийд има N свързани срещи — първо ги отменете или премахнете." (This lead has N meetings — cancel or remove them first.) This pushes the decision onto the user and avoids silent data loss.
2. **Meeting-to-Contract linkage** — when a "contract signing" meeting happens and a Contract is created, should the two be linked (so the Contract page shows the signing meeting)? Recommended: yes, automatically. But decide when you work on the contract module.
3. **Default meeting color palette** — pick actual hex values. Simple choice, just not locked in yet.

## 12. Acceptance criteria
- [ ] User can create a meeting only when a Lead is selected; Lead can be created inline from the meeting flow.
- [ ] Required fields: Lead, date+time, duration, type, at least one assignee.
- [ ] Creator is auto-added as assignee; can remove themselves or add others.
- [ ] Past-date meetings can be saved; calendar shows them with a red border.
- [ ] Overlapping meetings are allowed silently.
- [ ] Notes and attachments can be added on creation and edited afterward.
- [ ] Calendar offers Day / Week / Month / Year + List views; Week is default.
- [ ] Meetings are colored by type per the palette in section 5.3.
- [ ] Cancellation is soft-delete; cancelled meetings hidden by default, restorable for 30 days by assignees/managers, admin-only after.
- [ ] "Happened" is manual; assignees can mark past meetings as happened with optional outcome notes.
- [ ] Edit permissions match section 4.1 (assignees + managers/admins).
- [ ] All UI labels, buttons, filters in Bulgarian.
- [ ] Calendar legend shows meeting types and their colors.
- [ ] Filters: assignee, type, status.
