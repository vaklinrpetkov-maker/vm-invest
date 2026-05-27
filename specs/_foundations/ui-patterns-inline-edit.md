# UI Pattern: Inline Cell Editing

## 1. Purpose
A shared specification for how users edit data directly from table views without opening a detail page. This is the vminvest ERP equivalent of monday.com's inline board editing, adapted to our locale and permissions model.

Every table across the system uses this pattern where the field type and user permissions allow it. Written once here, referenced from each module spec.

## 2. Principles
1. **One click to edit, one click to commit.** No "edit mode" for rows, no "Save" button per cell.
2. **Instant feedback.** The cell updates the moment the user commits, before the server confirms. Failed saves roll back silently with a toast.
3. **Color is information.** Status-type fields use color-coded pills so the state of the board is legible at a glance, not just per cell.
4. **Keyboard is first-class.** Everything doable with the mouse is doable with the keyboard. Nothing has to be taught.
5. **Permissions are invisible until they matter.** Users never see a "you can't do this" error — cells they can't edit don't respond to clicks as editable in the first place.

## 3. Per field-type editing behavior

### 3.1 Status (enum with color)
The primary pattern. Used for `Property.status`, `Lead.status`, `Contract.status`, `Payment.status`, `Task.status`, `Renovation.status`, etc.

**Default state**: cell shows a color-coded pill with the status label.

**On click**: popover appears anchored to the cell. Popover contents:
- Full-width color-coded buttons, one per available status.
- Current status has a checkmark and a subtle highlight.
- Keyboard focus lands on the current status.
- Below the options, a `+ Нов статус` button (visible to admin/manager only) that opens an inline create flow — type name, pick color, press Enter, new status is added to the enum and the current cell is set to it.

**On selection**: popover closes, cell flips color/label immediately (optimistic UI). Change is written to the audit log and the entity's status history.

**Keyboard**: ↑/↓ to navigate options, Enter to commit, Esc to cancel, typing filters options (fuzzy, Bulgarian-aware).

**On server error**: cell rolls back to previous value, toast appears: `Промяната не беше запазена. {reason}` with a `Повтори` button (per `bg-copy.md` §3 + §8.2).

**Reference implementation**: `<InlineStatusCell>` in `components/ui/inline-status-cell.tsx`. Generic over the enum value type, takes a `StatusOption[]` list (each with `value` / `label` / `tone` / optional `systemOnly` to hide system-set values from the picker while still rendering them as the current value). Wired into `/leads` (status + source), `/contracts` (status, admin/manager only), `/tasks` (status), `/contacts` (Тип — uses neutral tones for non-colored enum per §3.2), `/properties` (Статус — colored; Тип — neutral tones per §3.2), `/meetings` (Тип). The `+ Нов статус` admin-inline create flow is **out of Phase 1** — adding values to a string enum is schema work, not runtime. Note: `/meetings` deliberately does NOT inline-edit `status` — status transitions go through dedicated `markHappened` + `cancelMeeting` flows that capture richer metadata (outcome, reason).

### 3.2 Single-select enum (non-colored)
Used for `Contact.type`, `Property.type`, etc.

Same popover pattern as status, but without colors — options render as regular list items. All other behavior (keyboard, instant commit, admin can add new values) is identical.

### 3.3 Multi-select enum
Used for `Meeting.assignees`, tag-like fields, multi-relation pickers.

**On click**: popover with a checkbox list of options. Toggling a checkbox flips its inclusion locally — the popover stays open. **Click outside or press Enter** commits all pending changes in a single `onSave` call. **Esc** cancels (restores the committed values).

**Read mode**: row of small pills showing the labels of selected options, overflow-collapsed as `[pill] [pill] [pill] +N още`. Empty selection shows the `emptyLabel` (default `—`).

**Search**: input shown when the option list has more than 6 entries; Bulgarian-aware substring filter over `label + sublabel`.

**Footer**: bottom of the popover shows a "N избрани" count + a hint (`Esc отказва · клик навън запазва`).

**Optimistic UI** with rollback toast on server reject — same as the other cells.

**Reference implementation**: `<InlineMultiSelectCell>` in `components/ui/inline-multi-select-cell.tsx`. Generic over `MultiSelectOption = { id, label, sublabel? }`. Wired into `/meetings` (Участници — many-to-many via `MeetingAssignee`; server validates ≥1 assignee).

### 3.4 Text (single-line)
Used for `Contact.fullName`, `Property.name`, descriptions where length is bounded, etc.

**On click**: cell transforms into an inline input, pre-selected with the current value (so typing replaces it).

**Commit**: on blur, on Enter, or on clicking another cell.
**Cancel**: Esc reverts.

**Validation**: runs on commit (server-side). If invalid, the cell rolls back to the previous value, flashes a red outline, and a toast surfaces with `Промяната не беше запазена. {reason}` plus a `Повтори` button. (Phase 1 trade-off: keeping validation server-side avoids duplicating rules between client and server. The "stay open for correction" behavior described in earlier drafts of this spec ships when an inline-error UI lands.)

**Reference implementation**: `<InlineTextCell>` in `components/ui/inline-text-cell.tsx`. Wired across all editable text fields on `/contacts` (name, phone, email, ЕГН, address, properties), `/tasks` (title), `/properties` (Продавач — with the optional `suggestions` prop that backs the input with a `<datalist>` for browser-native autocomplete from existing distinct values), and `/meetings` (Локация).

### 3.5 Text (multiline)
Used for `Contact.notes`, `Property.description`, long free-form fields.

**On click**: cell expands vertically into a textarea that grows with content. Row height stretches to accommodate.

**Commit**: on blur, or Ctrl+Enter (Cmd+Enter on Mac). Enter alone inserts a newline (multiline convention).
**Cancel**: Esc reverts.

**Read-mode display**: single-line truncated with `...`; full content available via the native `title` tooltip on hover. Click expands the full editor.

**Reference implementation**: `<InlineMultilineCell>` in `components/ui/inline-multiline-cell.tsx`. Wired into `/contacts` (notes) and `/properties` (Описание). The full-detail-page "expand" icon for very long values is a future enhancement — not blocking.

### 3.6 Number
Used for price fields, areas, counts.

**On click**: numeric input appears, pre-selected with the raw value (no thousands separator while editing — easier to type). Accepts digits, optional sign, and the decimal separator in either `,` (canonical bg-BG) or `.` form. Strings with both `,` and `.` are rejected (ambiguous paste from a foreign locale).

**Three format modes**:
- `integer` — whole numbers only (durations, counts).
- `decimal` — up to N fraction digits (default 2).
- `currency-eur` — same as decimal-2 with a trailing ` €` suffix on read.

A free-form `suffix` prop overrides the default — used for `мин`, `%`, `м²`, etc.

**Commit**: on blur, on Enter, or Tab. Parsing is locale-aware — `12 500,50` is parsed as `12500.5`. Invalid input rejected with a Bulgarian toast; cell flashes red and stays open for correction.
**Cancel**: Esc.

**Bounds**: `min` / `max` props enforce client-side as well — bound violations show a toast (`Стойността не може да е по-малка от {min}.`) and don't commit. Server actions also validate, since the UI is not the source of truth.

**Display**: cell renders with thousands separator (space) and decimal comma per locale rules — `12 500,00 €` / `60 мин` / `1 847`.

**Reference implementation**: `<InlineNumberCell>` in `components/ui/inline-number-cell.tsx`. Wired into `/meetings` (Продължителност — integer minutes, 0–720) and `/properties` (Цена EUR + Очаквана цена — currency-eur format, role-gated via the `disabled` prop using `canWritePrices`).

### 3.7 Date
Used for due dates, birth dates, meeting dates, etc.

**Phase 1**: uses the browser's native `<input type="date">` via `showPicker()`. Keyboard navigation, month/year jumps, and the calendar grid all come from the browser. Display always uses `DD.MM.YYYY` per locale rules; the wire format is ISO `YYYY-MM-DD` (the cell's `value` and `onSave` speak ISO).

**Future enhancements** (not in v1):
- Typed shortcuts like `утре` / `другата седмица` — common Bulgarian phrases we'd parse to dates.
- Custom calendar popover with project-styled chrome instead of the browser default.

**Reference implementation**: `<InlineDateCell>` in `components/ui/inline-date-cell.tsx`. Wired into `/contacts` (рождена дата) and `/tasks` (краен срок).

### 3.8 Date + time
Used for meeting scheduled times, payment timestamps where relevant.

**Phase 1**: native `<input type="datetime-local">` via `showPicker()` — single combined widget for date + time. Same Esc-cancels / Enter-commits / blur-commits semantics as the date cell (§3.7).

**Timezone handling**: `datetime-local` is *naive* (no timezone). The user picks a Europe/Sofia wall-clock; the server converts to/from UTC using `sofiaWallClockToUtc()` / `utcToSofiaWallClock()` in `lib/meetings/parse.ts`. The cell speaks the wall-clock string (`YYYY-MM-DDTHH:MM`); the page is responsible for translating to/from `Date` at the seam. Consequence: callers must pre-compute the wall-clock string for the cell's `value` prop and the action must reuse the same helper when writing.

**Future enhancements** (not in v1):
- Custom calendar+time popover instead of the browser default.
- Typed shortcuts like `утре 14:00`.

**Reference implementation**: `<InlineDateTimeCell>` in `components/ui/inline-datetime-cell.tsx`. Wired into `/meetings` (Кога / `startsAt`).

### 3.9 Person (user reference)
Used for `owner` fields (`Contact.owner`, `Renovation.owner`), task `assignees`, etc.

**On click**: popover with a searchable list of active users. Avatars + names. Keyboard arrows navigate, Enter commits, typing filters by name.

For multi-assignee fields (Tasks), checkbox behavior — popover stays open, click outside to commit all selections. Displayed in the cell as a stack of overlapping avatars, `+N` when more than 3.

**Unassigning**: a `— Без отговорник` option at the top of the popover. Matches current data convention (89% of contacts have no owner).

### 3.10 Contact / Property / Contract (relation fields)
Used everywhere single-relation FKs appear — `Contact.buildingId`, `Property.contactId`, `Lead.contactId`, etc.

**On click**: fixed-position popover anchored below the trigger. Search input auto-focused (only rendered when the option list has more than 6 entries — short lists don't need it). Each row shows a `label` and optional `sublabel` (e.g. building displayName + complex name).

**Pinned at the top**: a `— Без [thing]` entry to clear the relation, regardless of search filter.

**Keyboard**: ↑/↓ navigate, Enter commits, Esc cancels.

**Optimistic UI** with rollback toast on server reject — same as person and status cells.

**Reference implementation**: `<InlineRelationCell>` in `components/ui/inline-relation-cell.tsx`. Generic over `RelationOption = { id, label, sublabel? }`. Wired into `/contacts` (Сграда). For person fields specifically, use `<InlinePersonCell>` (§3.9) which adds avatar circles.

### 3.11 Boolean (checkbox / toggle)
Used for `usesCredit`, boolean flags.

**On click**: toggles immediately. No popover, no confirmation, no edit-mode input. Click = commit (optimistic). Click again = revert. Keyboard: Space or Enter when focused.

Visual: renders the current value's label inline (`Да` / `—` by default). The user knows it's interactive because of the hover background — there's no icon, the text itself is the toggle target.

**Optimistic UI** with rollback toast on server reject — same as the other inline cells. Pending state dims the cell briefly.

**Reference implementation**: `<InlineBooleanCell>` in `components/ui/inline-boolean-cell.tsx`. Wired into `/contracts` (Кредит — admin/manager only, gated via the existing `canEditStatus` flag).

### 3.12 Read-only fields
Fields that are derived (`age` from `birthDate`), system-managed (`createdAt`, `completedAt`), or locked by the Contracts-drives-Properties rule (`Property.owner`) do not respond to clicks as editable.

**Visual treatment**: slightly muted text color, no hover highlight, a small lock icon (🔒) at the right edge of the cell on hover. Lock icon has a tooltip explaining why: `Изчислено автоматично.` / `Попълва се от модул Договори.` / `Системно поле.` / etc.

Clicking a locked cell is a no-op. Double-clicking opens the detail page for the row (same as clicking anywhere else on the row), so the user can read the fuller context.

**Reference implementation**: `<ReadOnlyBadge reason="...">` in `components/ui/read-only-badge.tsx`. Pure presentational primitive — accepts a Bulgarian `reason` string and renders the 🔒 with `title` + `aria-label`. Wired into `/contacts` (Добавен, Възраст, Рожден ден тази година), `/leads` (Създаден), `/tasks` (Създадена, Завършена), `/properties` (Етаж, Вход, Чиста площ, all area / coefficient / bathroom / land / yard columns, Кредит, Договор/Купувач when contract-linked, Добавен, Последна промяна — every column that's CSV-imported or driven by the Contracts module).

## 4. Row-level affordances

### 4.1 No "edit mode"
Unlike traditional table UIs where users click a pencil icon to "edit this row," there is no per-row edit mode. Every cell is independently editable (or read-only). This is the same as monday.com and is what makes the pattern feel instant.

### 4.2 Row click behavior
Clicking on non-interactive parts of a row (gaps between cells, the row-number column, a locked cell's label) opens the detail page for that record. Clicking an interactive cell starts inline edit instead. The two are never ambiguous — cells that edit have clear hover states.

### 4.3 Quick-action icons
Some cells expose secondary actions via icons that appear on hover:
- Phone cell → phone icon, `tel:` link (doesn't trigger edit)
- Email cell → mail icon, `mailto:` link
- Relation pill → `×` to remove link

Icons never overlap the main editable area — they sit at the right edge of the cell, only on hover.

## 5. Permission gating

### 5.1 Field-level permissions
Each field declares, in its entity's permission matrix (see `permissions.md` when written, and the per-module specs meanwhile), which roles can edit it. Inline editing respects this:

- **Editable for current user**: normal interactive cell.
- **Read-only for current user**: muted text, lock icon on hover, tooltip `Нямаш права да редактираш това поле.` (or a more specific reason).
- **No read access**: entire column hidden from the user's column toggle menu, not just disabled.

### 5.2 System-locked fields
Fields managed by other modules (e.g. `Property.owner` from Contracts) are read-only for *everyone* through inline edit. They can still be read and previewed via the relations pattern — the lock is on who writes them, not on who sees them. Tooltip on the lock: `Попълва се от модул Договори.`

### 5.3 Role-based add-new-status
Per the role updates in Properties.md §3.4 and Contacts.md §3.2: admin and manager can add new values to enum fields (statuses, types) from the inline picker. Users see the picker but not the `+ Нов статус` button at the bottom.

## 6. Audit and history

### 6.1 Every inline edit is logged
To the audit log (Context.md §4): timestamp, user, entity, field, old value, new value. Never surfaced to users by default; admins can view via the audit log module (when built).

### 6.2 Status changes additionally go to status history
For entities that have status history (Properties — per Properties.md §4.3, Leads, Contracts, Renovations), every status change via inline edit creates a history entry: timestamp, user, old status, new status, optional note.

### 6.3 Cell-level history popover
On any cell, right-click (or long-press on touch) opens a small history popover:
- Last 5 changes to that specific cell: `23.04.2026, Мария Петрова: Свободен → Запазен`
- `Виж цялата история` link at the bottom → opens the entity's full history in the detail page.

This is a Phase 1.5 nicety, not blocking. Useful for "who changed this and why?" moments without forcing a detail-page round-trip.

## 7. Optimistic UI details

### 7.1 Happy path
1. User commits a change (blur, Enter, selection).
2. Cell updates to new value immediately.
3. Request goes to server.
4. Server confirms → no visual change (already correct).
5. If another connected view is visible (a mirror column, a relation pill elsewhere), it updates via realtime or on next query.

### 7.2 Failure path
1. User commits a change; cell updates optimistically.
2. Server rejects (validation error, permission error, race condition).
3. Cell rolls back with a brief red-flash animation.
4. Toast appears: `Промяната не беше запазена: [reason].` with a `Повтори` button.
5. If the user had moved on, clicking `Повтори` re-opens that cell in edit mode with their intended value.

### 7.3 Conflict handling
If two users edit the same cell simultaneously (rare but possible), last-write-wins by default, with a subtle indicator on the cell for ~5 seconds: `Променено от Мария Петрова` (small label above the cell). No modal interruptions — construction ERPs are not collaborative Google Docs, and heavyweight conflict UI would be worse than the occasional overwrite.

## 8. Accessibility

- All inline editors are keyboard-accessible without any mouse equivalent-only interactions.
- Focus outlines are visible on all interactive cells and popovers.
- Screen reader labels describe the current value and the edit action (`Статус, Свободен, натисни Enter за редактиране`).
- Color is never the only signal — status pills have both color and label; mirror columns have a small "linked" icon, not just subtle background.
- The minimum click target for any interactive cell is 32px tall — comfortable for mouse and touch.

## 9. Out of scope (Phase 1)

- **Formula fields.** No computed cells beyond the fixed-derived ones (`age` from `birthDate`, mirror columns from relations). Users can't write spreadsheet-style formulas.
- **Conditional formatting beyond status color.** No "highlight row red if overdue" in Phase 1 — status colors carry enough signal. Phase 2 if requested.
- **Cell comments.** No per-cell discussion threads. Activity feeds live on the record, not the cell.
- **Undo.** No global undo stack. The audit log is the source of truth for recovery, handled per-module.
- **Drag-to-fill.** No Excel-style dragging a value across rows. Too easy to mass-corrupt data, explicitly out for the non-technical audience.

## 10. Tooltips
- Read-only (system-managed) cell → `Попълва се от модул [X].`
- Read-only (derived) cell → `Изчислено автоматично от [source field].`
- Read-only (permissions) cell → `Нямаш права да редактираш това поле.`
- `+ Нов статус` button (admin/manager only) → `Добави нов статус. Ще бъде достъпен за всички.`
- Status color → on hover over the color chip in the picker: full status name.
- Conflict indicator → `Редактирано от [user] преди [N] секунди.`
