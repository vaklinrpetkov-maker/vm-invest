# Activity feed

The per-record narrative surface on every major detail page — Contact, Lead, Meeting, Contract, Property, Renovation, Invoice, Task. One reverse-chronological stream blending two sources:

1. **Manual notes** users write to inform the team (with `@mentions` of colleagues + threaded replies).
2. **System events** derived from `AuditEvent` rows scoped to the record.

It is **not** the admin audit viewer (`_foundations/audit-log.md` covers that). The audit log is the write-side ledger, admin-only. The activity feed is the read-side per-record narrative — broader access, friendlier rendering, mixed sources.

Status: 🟡 — partially shipped. The Contacts module has manual notes working (`ContactNote` + `<NoteComposer>` + `<NoteItem>`). System-events integration and the generalisation to other entities are the subject of this spec.

## 1. What the feed shows

A single reverse-chronological list combining:

- **Notes** posted by humans. Free-text, multiline, `@`-mentions of colleagues, 1-level threaded replies.
- **Events** synthesised from the audit log: status changed, owner reassigned, file uploaded, field edited, lead converted, contract signed, etc. — anything that was logged via `recordAuditEvent` for this record's `(targetType, targetId)`.

Rendering distinguishes them clearly: notes occupy a full-bleed card with author avatar, timestamp, action buttons; events render as a single muted line (small text, neutral tone, no actions). The reader scans events for "what happened" and reads notes for "what does my colleague think."

A filter chip at the top of the feed: `Само ръчни` toggles events off. Default off — both shown together so the scroll tells the full story.

## 2. Coverage matrix

Per the user-locked decision: all major entities get a feed.

| Entity | Detail page | Phase 1 (shipped) | Notes-write | Notes-read | Events-rendered |
|---|---|---|---|---|---|
| Contact | `/contacts/[id]` | ✅ (manual notes shipped via `ContactNote`) | all roles | all roles | not yet wired |
| Lead | `/leads/[id]` | infra ready | all roles | all roles | not yet wired |
| Meeting | `/meetings/[id]` | infra ready | all roles | all roles | not yet wired |
| Contract | `/contracts/[id]` | infra ready | admin/manager + assigned user | all roles | not yet wired |
| Property | `/properties/[id]` | infra ready | all roles | all roles | not yet wired |
| Renovation (Phase 2) | `/renovations/[id]` | per `renovations.md` | all roles | all roles | wired from day one |
| Invoice | `/invoices/[id]` | infra ready | admin/manager | all roles | not yet wired |
| Task | `/tasks/[id]` | infra ready | owner + admin | all roles | not yet wired |

"Infra ready" = the polymorphic `ActivityNote` model (§4) covers the entity; the detail page just needs to render the feed component once it ships. "All roles" reads/writes assumes the user can already see the parent record — locked-down records (sensitive contracts, etc.) follow the parent's permission gate (§10).

Phase rollout order in §13.

## 3. Layout on detail pages

Same shape across modules — the consistency is part of the point.

**Placement**: full-width section below the relations panel / details columns. Always the last thing on the page (the scroll ends with "what's happening here").

**Header**:
- Title: `Дейност` (one word; matches the `tabs / sections` convention from `bg-copy.md`).
- Filter chip on the right: `Само ръчни` (toggle).
- Note composer pinned at the top — always-visible textarea + `Публикувай` button, no expand-to-open dance. Encourages quick notes.

**List**:
- Top-down reverse-chronological order (newest first).
- Notes: card-style with author avatar, full name, relative timestamp (`преди 3 часа`, hover for absolute), `(редактирана)` tag if `editedAt != null`, and action buttons (Отговори / Редакция / Изтрий) — visible per permission rules (§7).
- Events: one-line muted entries. Format: `{actor name} {action label in Bulgarian} · {relative time}`. Example: `Иван Петров промени Статус на Активен · преди 2 дни`. Actor name links to their profile; action links to nothing (events aren't clickable in Phase 1).
- Replies under a note are nested one level deep (left border, slight indent). No deeper threading per the decisions log + contacts.md §4.2.

**Pagination**:
- Initial render: last 50 entries (notes + events combined).
- "Покажи още" button at the bottom loads the next 50.
- No infinite scroll in Phase 1 — explicit click is friendlier on slow connections and easier to test.

**Empty state**: `Все още няма активност за този запис.` plus a hint pointing at the composer.

## 4. Data model

### 4.1 `ActivityNote` — polymorphic notes
Generalisation of the shipped `ContactNote`. One table, all entities.

```prisma
model ActivityNote {
  id           String         @id @default(uuid()) @db.Uuid
  targetType   String         @map("target_type")
  targetId     String         @map("target_id") @db.Uuid
  authorId     String         @map("author_id") @db.Uuid
  author       Profile        @relation(fields: [authorId], references: [id])
  body         String
  parentId     String?        @map("parent_id") @db.Uuid
  parent       ActivityNote?  @relation("ActivityNoteReplies", fields: [parentId], references: [id], onDelete: Cascade)
  replies      ActivityNote[] @relation("ActivityNoteReplies")
  mentions     ActivityNoteMention[]
  createdAt    DateTime       @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt    DateTime       @updatedAt @map("updated_at") @db.Timestamptz(6)
  editedAt     DateTime?      @map("edited_at") @db.Timestamptz(6)
  deletedAt    DateTime?      @map("deleted_at") @db.Timestamptz(6)

  @@index([targetType, targetId, createdAt])
  @@index([parentId])
  @@map("activity_notes")
  @@schema("public")
}
```

`targetType` values mirror the audit-log taxonomy (`_foundations/audit-log.md` §3): lowercase singular nouns — `contact`, `lead`, `meeting`, `contract`, `property`, `renovation`, `invoice`, `task`, `profile`.

**Trade-off — no FK on `targetId`.** Polymorphic associations sacrifice referential integrity at the database level. The alternative (per-entity note tables — `LeadNote`, `RenovationNote`, etc.) would multiply boilerplate across modules without enabling any feature we'd actually use. The check that `targetId` points at a live record happens application-side in the server action when a note is posted; orphan rows after a hard-delete are tolerable (and in practice rare given soft-delete everywhere). Same approach `AuditEvent` already uses successfully.

Soft-delete (`deletedAt`) for notes — deletes are auditable + recoverable. The original `ContactNote` does a hard delete via `onDelete: Cascade` for replies; the new generalised model softens that. Migration handles the conversion (§5).

### 4.2 `ActivityNoteMention` — @mentions join
One row per (note, mentioned profile). Drives the immediate-email notification (§8) + future "mentions about me" inbox.

```prisma
model ActivityNoteMention {
  id                  String       @id @default(uuid()) @db.Uuid
  noteId              String       @map("note_id") @db.Uuid
  note                ActivityNote @relation(fields: [noteId], references: [id], onDelete: Cascade)
  mentionedProfileId  String       @map("mentioned_profile_id") @db.Uuid
  mentionedProfile    Profile      @relation(fields: [mentionedProfileId], references: [id])
  createdAt           DateTime     @default(now()) @map("created_at") @db.Timestamptz(6)
  notifiedAt          DateTime?    @map("notified_at") @db.Timestamptz(6)

  @@unique([noteId, mentionedProfileId])
  @@index([mentionedProfileId, createdAt])
  @@map("activity_note_mentions")
  @@schema("public")
}
```

`notifiedAt` records when the Resend email actually fired. Null = pending / email failed. Lets a retry job pick up stuck mentions without double-sending.

## 5. Migration from `ContactNote`

`ContactNote` is shipped and live; this section captures the one-shot migration that lands when `ActivityNote` does.

1. Create `ActivityNote` + `ActivityNoteMention` tables.
2. Copy `ContactNote` rows into `ActivityNote` setting `targetType = "contact"`, `targetId = contactId`. Preserve `id`, `authorId`, `body`, `parentId`, `createdAt`, `updatedAt`, `editedAt`. New `deletedAt = null` for all.
3. `ContactNote` deletes were hard before — there's nothing to recover. Future deletes go through the soft-delete path.
4. Rewrite `/contacts/[id]` to use the new `<ActivityFeed entity="contact" />` component instead of the bespoke note components.
5. Drop the `ContactNote` table (no rows lost — they're all copied).
6. Retire `note-composer.tsx` / `note-item.tsx` / `note-actions.ts` from `app/(app)/contacts/[id]/` — the generalised version lives in `components/ui/activity-feed/` (§12).

A one-off script handles steps 1–3 (npm run task, idempotent). The schema change goes through `db:push` as usual; rows are migrated immediately after.

## 6. System events — audit-log integration

The feed renders any `AuditEvent` row where `targetType + targetId` match the page's entity. The query:

```ts
const events = await prisma.auditEvent.findMany({
  where: { targetType, targetId, NOT: { action: { in: HIDDEN_ACTIONS } } },
  orderBy: { at: "desc" },
  take: 50,
  include: { actor: { select: { id: true, fullName: true } } },
});
```

### 6.1 Rendering mapping
Each `AuditAction` maps to a one-line Bulgarian summary. Three rendering strategies:

| Strategy | When | Example |
|---|---|---|
| Use `AUDIT_LABELS` directly | Coarse actions like `contracts.attachment.uploaded`. The Bulgarian label alone is enough. | `Иван Петров — Качване на файл (договор)` |
| Render with `payload` context | Status changes, file names, anomaly flags. The `payload` field carries the detail. | `Иван Петров промени Статус: Чернова → Активен` |
| Render with `before/after` diff | Inline-edit `*.field.updated` events. Show the field name + the diff. | `Иван Петров промени Телефон: +359 88 123 4567 → +359 88 999 9999` |

Sensitive fields (ЕГН per `_foundations/audit-log.md` §4.4) render with the masked sentinel: `Иван Петров промени ЕГН (стойностите са скрити)`.

A lookup table — `lib/activity-feed/event-renderers.ts` — keyed by `AuditAction` returns `{ summary: string, detail?: string }`. The feed component reads from there. Adding a new action requires adding a renderer; the default falls back to the `AUDIT_LABELS` string.

### 6.2 Hidden actions
Some audit events make sense in `/admin/audit` (forensic) but would be noise in a per-record feed. The `HIDDEN_ACTIONS` list, defined in `lib/activity-feed/hidden.ts`:

- File-view events (`contracts.attachment.viewed`, `invoices.attachment.viewed`) — opening a PDF doesn't need to surface to the team.
- Import-batch events (`property.imported`, `contract.imported`) — bulk events; not per-record interesting.
- Timer ticks (`leads.timer.escalated`) — better surfaced in the lead inbox UI than in the feed.

The user can still see hidden events by toggling off the `Само ръчни` chip and an admin-only `Покажи всички` toggle. Default rendering is the curated set.

### 6.3 Read-access for events
Events render only if the viewer can read the parent record (§10). No per-event role check beyond that — if you can see the contact, you can see who edited what on it.

## 7. Manual notes — lifecycle

### 7.1 Post
`postNote(targetType, targetId, body, parentId?)` server action:
1. Authn — `requireProfile()`.
2. Authz — the viewer can read the parent record (§10). Notes inherit the parent's read gate.
3. Parse `@mentions` from `body` against active profiles (§8).
4. Insert `ActivityNote`. Insert `ActivityNoteMention` rows. Emit a single audit row `activity.note.created` so the feed's own write actions show up in `/admin/audit`.
5. Fire @mention emails asynchronously (don't block the response).
6. `revalidatePath` the parent record's detail page.

Body validation: non-empty after trim, max 5000 chars. No HTML, no markdown parsing in Phase 1 — plain text rendered with `whitespace-pre-wrap` so newlines survive.

### 7.2 Edit
`editNote(noteId, body)`:
- Author-only OR admin (per the user decision: forever, no time window). Manager cannot edit other people's notes.
- Re-parses mentions: rows in `ActivityNoteMention` are diffed — newly added mentions trigger new emails; removed mentions don't unsend the old email but the join row is removed so the "mentions about me" inbox stays accurate.
- Sets `editedAt = now()`. The feed renders `(редактирана)` next to the timestamp; hovering shows `Редактирано: 15.05.2026, 14:23`.

### 7.3 Delete
`deleteNote(noteId)`:
- Author OR admin OR manager (per the shipped `ContactNote` behaviour).
- Soft-delete (`deletedAt = now()`). Row stays in the DB.
- Replies remain visible — the parent's deletion shows as `Бележката е изтрита` placeholder, replies indent under it. The conversation thread doesn't collapse.
- Emits `activity.note.deleted` to the audit log.

### 7.4 Threading
1-level reply only. A reply's `parentId` references the top-level note; a reply cannot itself be replied to. Enforced in `postNote` — if the supplied `parentId` references a note with non-null `parentId`, the action rejects with `Не можеш да отговориш на отговор. Отговори на основната бележка.`

Threading deeper produces conversational soup in non-technical UIs. The decisions log already calls this out (contacts.md §4.2).

## 8. `@mentions`

### 8.1 Composer UX
The textarea autocompletes when the user types `@`:

- Popover anchored to the cursor position lists active profiles matching the typed prefix.
- Bulgarian-aware: `Г` matches `Георги`, `и` matches `Иван` (substring on fullName, case-insensitive).
- ↑/↓ to navigate, Tab/Enter to commit, Esc to dismiss.
- On commit, the literal text `@Иван Петров` is inserted at the cursor with a non-breaking space after it. The display in the rendered feed uses the same literal — visually highlighted as a pill (accent tone), linkified to the profile.

This is the only client-side rich-text behaviour. Body remains a plain string at the DB layer.

### 8.2 Server-side parsing
On `postNote` / `editNote`, the action runs a Bulgarian-aware mention parser against the body:

1. Regex finds `@` followed by characters up to the next whitespace / punctuation.
2. The captured span is matched against `Profile.fullName` (active profiles only, exact match — autocomplete already gave the user the exact form).
3. Each unique match becomes one `ActivityNoteMention` row.

Ambiguous matches (two profiles with the same `fullName`) resolve to the most-recently-active one. Vanishingly rare given team size.

Self-mentions (`actorId === mentionedProfileId`) are stored for completeness but never emailed.

### 8.3 Email notification
On insert, an async job (server-action `await` after the response is queued is fine in Phase 1 — Resend takes ~200ms) sends one email per new mention:

- **Subject** (Bulgarian): `Споменат от {actor} в {target label}` — e.g. `Споменат от Иван Петров в Иван Иванов`.
- **Body**: short author block + the note excerpt (max 300 chars, truncated with `…`) + a link button `Виж бележката` pointing at the detail page with `#note-{id}` anchor.
- **From**: same Resend sender used for absence emails.
- **Reply-to**: blank — replies-to-the-feed don't work in Phase 1 (no inbound email parsing yet).

After sending, `notifiedAt` is stamped. Failed sends leave it null — a periodic retry job (Phase 1.5) picks them up; for Phase 1 the manual fallback is "ask the user to ping them on Slack."

Deduplication: editing a note re-fires emails only for newly added mentions. Removing a mention does not unsend. Re-adding a previously-removed mention re-fires — Resend's own dedup is what we lean on.

### 8.4 No self-mention email + opt-out
- Self-mentions: never email (see §8.2).
- Per-user opt-out: not in Phase 1. The team is small enough that an opt-out toggle would do more harm than good. Revisit if usage justifies.

## 9. Audit-log emissions from the feed
The feed itself emits audit events for its own writes:

| Action | When | Payload |
|---|---|---|
| `activity.note.created` | New note posted | `{ noteId, targetType, targetId, hasParent: boolean, mentionCount: number }` |
| `activity.note.edited` | Note body edited | `{ noteId, mentionsAdded: number, mentionsRemoved: number }`. `before/after` contain `{ body }`. |
| `activity.note.deleted` | Note soft-deleted | `{ noteId, by: "author" \| "moderator" }` |

Mentions are NOT individually audited — the `mentionCount` field on `activity.note.created` is enough for forensic reconstruction.

These actions are added to the `AuditAction` union + `AUDIT_LABELS` map per `_foundations/audit-log.md` §11.

## 10. Permissions

Read + write inherit from the parent record. The principle: if the viewer can read the parent, they can read the feed; if the viewer can edit the parent, they can post a note.

| Entity | Note read | Note write | Note edit/delete (own) | Note delete (others) |
|---|---|---|---|---|
| Contact | all roles (per `contacts.md` §5.2) | all roles | author | admin/manager |
| Lead | all roles | all roles | author | admin/manager |
| Meeting | all roles | all roles | author | admin/manager |
| Contract | all roles read; user blocked from edits on signed contracts (`contracts.md` §9) | mirror parent | author | admin/manager |
| Property | all roles | all roles | author | admin/manager |
| Renovation | all roles | all roles | author | admin/manager |
| Invoice | all roles read | admin/manager only (matches the inline-edit gate) | author | admin/manager |
| Task | all roles | task owner + admin (the standalone module's spirit) | author | admin/manager |

System events: same read-gate as the parent. No write — they're synthesised from the audit log.

Locked records (deleted parent, contract in a state that blocks notes) show the feed read-only with the composer disabled + a tooltip `Записът е заключен — нови бележки не са възможни.`

## 11. Routes / API surface

No new routes — the feed is a component embedded in existing detail pages. Server actions live in `app/_actions/activity-feed/` (new shared folder so any module can import them) or per-module if isolation is preferred. Lean: shared.

| Action | Signature | Notes |
|---|---|---|
| `postNote` | `(targetType, targetId, body, parentId?) → { ok } \| { ok: false, error }` | Validates parent read access, mentions, threading depth. |
| `editNote` | `(noteId, body) → { ok } \| { ok: false, error }` | Author or admin. Re-parses mentions. |
| `deleteNote` | `(noteId) → { ok } \| { ok: false, error }` | Author, admin, or manager. Soft-delete. |
| `listFeed` | `(targetType, targetId, cursor?, limit?) → FeedPage` | Reads notes + events, merges, paginates. Cursor is `{ at: ISO, id: string }`. |

The `<ActivityFeed>` component reads via `listFeed` in a server component on initial render; the composer + reply / edit / delete actions are client-side and call the server actions directly.

## 12. Component shape

Lives in `components/ui/activity-feed/` (new). Exports:

- `<ActivityFeed targetType targetId viewerId viewerRole />` — wraps everything.
- `<NoteComposer targetType targetId parentId? autoFocus? compact? />` — moves from `app/(app)/contacts/[id]/` to here.
- `<NoteItem note viewerId viewerRole />` — moves from `app/(app)/contacts/[id]/` to here. Renders notes + replies.
- `<EventItem event />` — new. Renders a one-line system event.

The migration (§5) leaves the contacts route importing from the new location and drops the old per-module files.

## 13. Phase rollout

The infrastructure ships in one go (model + component + migration). Per-entity wiring happens module by module:

1. **Phase 1.A** — generalisation + `Contact` migration. After this, `/contacts/[id]` reads from `ActivityNote`. Manual notes preserved; events not yet rendered (no `event-renderers.ts` entries for `contact.*` yet).
2. **Phase 1.B** — events rendered for Contact. Inline-edit events (`contact.field.updated`) show up as the natural extension.
3. **Phase 1.C** — Lead, Meeting, Task, Invoice — order doesn't matter much, all four are similar shape. Each lands as a one-PR add: composer mount in the detail page + renderer entries for the module's audit actions.
4. **Phase 1.D** — Contract + Property. Slightly more careful because of the signed-contract gate and the role-scoped writes.
5. **Phase 2.A** — Renovation. The spec already requires it on day one (`renovations.md` §6).

Each module's spec lists the activity feed under "Detail page" once it ships — pattern already noted in `contacts.md` and `renovations.md`.

## 14. What this is not

- **Not a chat.** Notes are persistent record context, not conversation. No typing indicators, no real-time push, no presence.
- **Not a comment system on individual fields.** A note is about the record as a whole. Field-level commentary lives in the audit log only.
- **Not a CMS.** No images, no formatting toolbar, no link previews. Plain text + `@mentions` and that's it. Markdown is a future enhancement only if the team asks.
- **Not the audit log.** Repeating from §1 because this is the most common confusion: the audit log is admin-only forensic; the activity feed is per-record team-visible.

## 15. Known gaps / future work

- **Inbound email** so replying to an `@mention` email posts back to the feed. Real value, real complexity (needs the Resend inbound webhook + mention attribution). Phase 2+.
- **"Mentions about me" inbox.** A top-nav surface listing every unread `@mention` across the org. The `ActivityNoteMention` index is already shaped for it; just needs a route + a `seenAt` column.
- **Per-user mention opt-out** if the team grows past ~25 and inbox noise becomes real (§8.4).
- **Reactions** (👍 / ✅ / ❓). Common in Slack-style surfaces. Not requested; defer unless asked.
- **Grouping of similar events** (5 consecutive field edits by the same actor collapse into "Иван Петров промени 5 полета · преди час"). Reduces noise as records age. Heuristic-driven; ship without it first.
- **Inline event suppression** — admin toggle "този event тип не се показва за този модул" if a module emits noise. Lean: keep `HIDDEN_ACTIONS` global, no per-module override until needed.
- **Markdown / link autodetection** in note bodies.
- **Editor history** — `editedAt` tells us a note was edited, not what the prior body was. The audit row's `before/after` carries it but the feed doesn't expose it. Add a "Покажи историята" affordance later.
- **Bulk actions** (mark all read, delete spam) — premature.

None of these block the migration + per-entity rollout.
