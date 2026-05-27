# Tasks

## 1. Purpose

Lightweight personal + team to-do tracker. Sales calls to make, paperwork to file, "remember to email the bank" — anything the team wants written down and assigned. Standalone module — no links to Contacts / Leads / Contracts / Properties in v1, by design.

The team is 25 people. We don't need a Jira; we need a shared list everyone can see, assign, and check off.

## 2. Scope

In scope (v1):
- Title + optional description.
- Single owner (assignee). Optional — unassigned tasks are valid.
- Optional due date (DATE granularity, no time-of-day).
- Three statuses: `todo` / `in_progress` / `done`.
- Three tabs at `/tasks`: Мои / Всички / Завършени.
- Inline status + owner editing on the list, via the foundation primitives.
- Overdue indication when `dueDate < today` and status ≠ `done`.

Out of scope (v1, deliberately):
- Links to other entities (Contact / Lead / Contract / Property). The team can add the entity reference in the description if relevant.
- Multi-assignee / collaborators.
- Priority field.
- Subtasks / parent-child structure.
- Recurring tasks.
- Email reminders / digest.
- File attachments.
- Activity feed per task.

These are all easy to add when there's demand — keeping v1 tight.

## 3. Permissions

Open team-wide:
- **Create** — anyone (admin / manager / user).
- **Edit** (title, description, due date) — anyone.
- **Change status** — anyone, including marking another person's task done.
- **Reassign owner** — anyone.

Restricted:
- **Delete** — admin only. Destructive, no soft-delete in v1.

Rationale: the team is small, communication channels are tight. Friction from per-record ownership rules wouldn't pay back.

## 4. Data model

```
Task
  ├─ id
  ├─ title              (required, max 200 chars)
  ├─ description        (optional, free text, multiline)
  ├─ status             (todo | in_progress | done — Prisma enum)
  ├─ dueDate            (DATE, optional)
  ├─ ownerId            (FK → Profile, optional)
  ├─ createdById        (FK → Profile, optional)
  ├─ createdAt
  ├─ updatedAt
  └─ completedAt        (set when status → done; cleared when leaving done)
```

Indexes: `ownerId`, `status`, `dueDate`. Sorting: status asc → dueDate asc (nulls last) → createdAt desc.

Lives in `public` schema.

## 5. Pages

### 5.1 `/tasks` — list

Three tabs:
- **Мои** (default) — `ownerId = currentUser`, `status ∈ (todo, in_progress)`.
- **Всички** — any owner, `status ∈ (todo, in_progress)`.
- **Завършени** — any owner, `status = done`.

Each tab shows a count badge. Tab state lives in the URL (`?tab=mine|all|done`) so links and reloads preserve it.

Default columns: Заглавие · Статус · Отговорник · Краен срок. Hidden by default: Създадена · Завършена. Column visibility is persisted per-user via `useColumnVisibility` (key `tasks:visible-columns`).

Inline editing — all editable fields are click-to-edit from the table:
- **Заглавие** via `<InlineTextCell>` (required, max 200 chars). A small ↗ link icon sits next to the cell to open the detail page when the user wants the fuller view.
- **Статус** via `<InlineStatusCell>`.
- **Отговорник** via `<InlinePersonCell>`.
- **Краен срок** via `<InlineDateCell>` (native date picker).
- **Създадена** / **Завършена** — read-only with 🔒 badge.

Overdue rows: tasks with `dueDate < today` and `status ≠ done` get a `border-l-2 border-danger-500` left border on the title cell + danger-tone date cell. The due-date cell remains click-to-edit when overdue — just rendered in danger colors.

### 5.2 `/tasks/new` — create

Form fields: title (required), description, due date, owner. Status defaults to `todo` (the inline cell on the list/detail handles further state). Owner pre-fills to the current user — easy to clear.

Submitting creates the task and redirects to its detail page.

### 5.3 `/tasks/[id]` — detail

Shows: title (struck-through when done), status (inline cell), owner (inline cell), due date with overdue indicator, description, metadata block (created / updated / completed timestamps + actor).

Header buttons:
- "Редактирай" — links to `/tasks/[id]/edit` for title / description / due date / owner edits.
- "Изтрий" — admin only. Wired to the `deleteTask` server action via a plain form post; no two-step confirm because it's an admin-only action behind a heading already labeled with the task title.

### 5.4 `/tasks/[id]/edit` — edit

Same form shape as `/tasks/new`, pre-filled. Submitting redirects back to the detail page.

## 6. Inline-edit cells used

- **Title** — `<InlineTextCell>` from `_foundations/ui-patterns-inline-edit.md` §3.4. Required, max 200 chars; rejection rolls back. The detail-page link icon (↗) sits beside the cell so click-to-edit and click-to-open don't conflict.
- **Status** — `<InlineStatusCell>` from §3.1. Three options, color-coded.
- **Owner** — `<InlinePersonCell>` from §3.9. Active profiles only in the picker; inactive owners render with `(неактивен)` tag.
- **Due date** — `<InlineDateCell>` from §3.7. Optional; overdue indicator + top-nav badge re-evaluate on next nav via `revalidatePath`.
- **Created / Completed** — read-only with 🔒 `<ReadOnlyBadge>` (§3.12). Both are system-managed (`completedAt` auto-stamped on status → done, cleared on leaving done).

All editable cells are open team-wide (`disabled` is never set). Setting status → `done` auto-stamps `completedAt`; moving back from `done` clears it.

## 7. Audit log

Per `_foundations/audit-log.md` (pending) — every mutation logs:
- `tasks.create` — new task.
- `tasks.update` — full-form edit (title / description / due-date / owner).
- `tasks.status_changed` — inline status change.
- `tasks.owner_changed` — inline owner change.
- `tasks.field.updated` — granular per-field audit from inline-edit cells (title, dueDate). Payload carries `{ field }`; `before` + `after` carry the per-field values.
- `tasks.deleted` — admin delete.

Audit entries include `before` / `after` for diffable fields (title, description, status, owner, dueDate) and `payload` for non-diff context.

## 8. Known gaps / future work

- **Filters bar** (assignee multi-select, status multi-select within Всички). Plumbed in `lib/tasks/filters.ts` already; UI not yet built.
- **Inline description editing on the list.** Description isn't currently a column; would need either adding the column or building a detail-page inline pattern.
- **Links to other entities** when a clear use case appears.
- **Activity feed** when the foundation spec lands.

## 9. Top-nav badge

The "Задачи" link in the app header carries an accent-tone badge with the count of `me's open tasks where dueDate <= today` (i.e. due today *or* overdue). Computed once per navigation in `app/(app)/layout.tsx` alongside the existing `pendingAbsenceInbox` and `openLeadsInbox` counts. Hidden when the count is 0 — the link is just text.

The badge intentionally does not split "due today" vs "overdue" — both are actionable in the same way (open it, do it, mark done). A single number says "there are N things you should look at."
