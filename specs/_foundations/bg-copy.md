# Bulgarian Copy — Canonical Strings

## 1. Purpose

Authoritative reference for Bulgarian UI strings that recur across modules: button labels, confirmation prompts, empty states, "no value" placeholders, validation errors, toast wording, plural forms, and tooltip phrasing.

This is a **writing guide and dictionary**, not a translation system. Strings stay literal in code. The spec exists so that when you write Bulgarian UI copy, you check this document and reuse the canonical form — and reviewers can cite specific sections when copy drifts.

Cross-cuts everything. Reference from per-module specs when there's a phrasing question; update here when a new pattern needs a canonical answer.

## 2. Tone & voice

- **Always formal "Вие".** Never "ти" in UI strings. The product is for a team working with clients, contracts, money — the register is professional. The one exception: destructive-confirm prompts use the more direct "Сигурен ли си?" (singular), because that's the natural conversational form in Bulgarian for a self-directed check, and the team uses it informally with itself.
- **Imperative for buttons.** `Запази`, not `Запазване`. Button action labels are verbs telling the system what to do.
- **Sentence ends with a period for full sentences.** Not for button labels, headers, or table cells.
- **No mixed English + Bulgarian.** Per CLAUDE.md. `Save промените` is wrong. `Запази промените` is right.
- **No emoji in copy.** Lock icons (🔒) and similar are visual primitives, not text — they live in component code, not copy strings. (One exception: `←` / `→` directional arrows in pagination + breadcrumb-back links are visual chrome.)
- **Errors are specific, not generic.** `Невалидно ЕГН` over `Грешка`. `Полето е задължително` over `Required`.

## 3. Canonical button labels

| Bulgarian | English meaning | When to use |
|---|---|---|
| `Запази` | Save | Form submit that commits changes to an existing record. |
| `Запазване…` | Saving… | Same button, pending state. |
| `Създай` | Create | Form submit that creates a new record. Often `+ Създай контакт` / `+ Нов лийд` / `+ Нова задача` for "new" entry points. |
| `Създаване…` | Creating… | Same, pending. |
| `Редактирай` | Edit | Header button on detail pages that navigates to the edit form. |
| `Изтрий` | Delete | First click of a two-step destructive confirm, OR an admin-row direct-delete with no further confirm needed. |
| `Изтрий завинаги` | Delete permanently | Second click of a two-step confirm. Always paired with `Отказ` (cancel). |
| `Откажи` | Cancel | Used for cancelling an in-progress operation (e.g. cancelling a leave request). Verb. |
| `Отказ` | Cancel (noun-ish) | Used as the "cancel" button in confirm dialogs that pair with `Изтрий завинаги` / `Потвърди`. |
| `Възстанови` | Restore | Action on soft-deleted items (leads trash). |
| `Изпрати` | Send | For outbound messages (invites, emails). |
| `Качи` | Upload | File upload buttons. Plain `Качи` for the "+" affordance, `Качи файл` for tooltip clarity. |
| `Изтегли` | Download | File download buttons. |
| `Затвори` | Close | Modal/overlay dismiss buttons (or the `✕` icon's `aria-label`). |
| `Прегледай` | Review / view | "Прегледай →" for a "go look at this" link (e.g. anomalies list). |
| `Покажи` | Show | Toggle that reveals hidden content. |
| `Скрий` | Hide | Toggle inverse. Often paired: `Скрий филтри` / `Филтри`. |
| `Изчисти` | Clear | Reset all filters / form state to default. |
| `Повтори` | Retry | **Canonical retry** for inline-edit rollback toasts. (See §4 drift note — the file-preview modal currently uses `Опитай отново` and needs to migrate.) |
| `← Назад` | Back | Breadcrumb-style link at the top of detail/edit pages. The `←` is part of the visual; the word alone is also acceptable. |
| `← Предишна` / `Следваща →` | Pagination prev/next | Always with the directional arrow in the label. |

### 3.1 Pending-state convention

When a button has a pending/loading state, replace its action word with the **gerund/process form** + ellipsis:
- `Запази` → `Запазване…`
- `Създай` → `Създаване…`
- `Изтрий` → `Изтриване…`
- `Изпрати` → `Изпращане…`
- `Качи` → `Качване…`

## 4. Confirmation prompts

### 4.1 Two-step destructive confirm (preferred for in-context delete)

The file-preview modal's delete flow is the canonical pattern. Click the destructive trigger → toolbar/row swaps to a confirm row:

> Сигурен ли си? {Item} ще бъде изтрит{adj-suffix} завинаги.
>
> `[Изтрий завинаги]` `[Отказ]`

`{adj-suffix}` follows Bulgarian grammatical gender of `{Item}`:
- Masculine (файл, контакт, договор) → `Файлът ще бъде изтрит завинаги.`
- Feminine (задача, среща, сграда) → `Задачата ще бъде изтрита завинаги.`
- Neuter (отсъствие) → `Отсъствието ще бъде изтрито завинаги.`
- Plural → `Записите ще бъдат изтрити завинаги.`

The confirm row should auto-revert after 5 seconds of inactivity so a stray click doesn't leave the UI in a destructive state.

### 4.2 Native `confirm()` dialogs (legacy)

Some older flows use `window.confirm(...)`. New code should not — prefer the inline two-step pattern from §4.1. Legacy confirms should be migrated when the surrounding code is touched. Canonical message format if you must:

> `Сигурен ли си, че искаш да {глагол}? Това действие не може да бъде отменено.`

## 5. Empty states

**Canonical pattern**: `Няма намерени {entity-plural}.`

Examples:
- `Няма намерени контакти.`
- `Няма намерени лийдове.`
- `Няма намерени срещи.`
- `Няма намерени имоти.`
- `Няма намерени договори.`
- `Няма намерени задачи.` ← **fix needed**: today it's `Няма задачи в този изглед.` Should be unified.

For sub-views where the empty-state should explain *why* it's empty (filtered, etc.), extend with a second sentence:

> `Няма намерени {entity-plural}. Опитай да изчистиш филтрите.`

But the first sentence stays canonical.

### 5.1 Drift to reconcile

| File | Current | Should be |
|---|---|---|
| `app/(app)/tasks/tasks-table.tsx` | `Няма задачи в този изглед.` | `Няма намерени задачи.` |
| `app/(app)/tasks/page.tsx` | `Няма задачи в този изглед.` | `Няма намерени задачи.` |

## 6. "No value" placeholders

For nullable display cells where no value is set:

- **Em-dash** (`—`) for cells where the absence is unremarkable (date not set, address empty). Renders muted (`text-neutral-400`).
- **"— Без {field}"** for relation/picker empty states where the field is conceptually present but unassigned. The leading `— ` is intentional — visually separates from option labels.

| Use case | Canonical placeholder |
|---|---|
| Empty date cell | `—` |
| Empty text cell | `—` |
| Empty owner | `— Без отговорник` |
| Empty building | `— Без сграда` |
| Empty contact relation | `— Без контакт` |
| Empty property relation | `— Без имот` |

**Exception**: when the empty state is wrapped in a `<StatusBadge tone="warning">` to draw attention to the unassigned condition (e.g. "lead has no owner — this needs assigning"), drop the leading em-dash. The colored chip itself is the visual treatment; the dash inside it reads as noise. Use `Без отговорник` (no leading `— `) inside warning badges.

Example in code: `app/(app)/leads/[id]/page.tsx` shows an unassigned-lead warning badge with the plain form.

### 6.1 Drift to reconcile

Today the `<InlinePersonCell>` defaults its `emptyLabel` to `"—"` (the em-dash form). Tables that want the longer `"Без отговорник"` pass it explicitly. The `<InlineRelationCell>` defaults its `unassignLabel` to `"— Без"` — half-string, needs the field-name suffix.

Inconsistency to fix:
- Owner empty state varies: `Без отговорник` (no leading dash, used in some leads/tasks contexts) vs `— Без отговорник` (with dash). **Canonical: with the leading `— `.**

## 7. Validation errors

Per CLAUDE.md, errors are specific and actionable. Canonical patterns by validation type:

| Failure | Canonical message |
|---|---|
| Required field empty | `{Поле} е задължително.` (`Името е задължително.`, `Заглавието е задължително.`) |
| Max length exceeded | `{Поле} е твърде дълго (макс. {N} символа).` |
| Invalid format generic | `Невалиден {field}.` (`Невалиден имейл.`, `Невалидна дата.`) |
| Invalid ЕГН format | `ЕГН/ЕИК трябва да съдържа само цифри.` / `ЕГН/ЕИК трябва да е 9 или 10 цифри.` |
| Future date for past-only field | `Рождената дата не може да е в бъдещето.` (template: `{Полето} не може да е в бъдещето.`) |
| Past date for future-only field | `{Полето} не може да е в миналото.` |
| Foreign key not found | `{Запис} не съществува.` (`Контактът не съществува.`, `Лийдът не съществува.`) |
| Foreign key inactive | `{Запис} е деактивиран.` (or `Сградата е деактивирана.` for feminine) |
| Permission denied | `Нямаш права да правиш това.` (informal "ти" in error messages is acceptable — it's a system-to-user voice, not user-to-user). For specific actions: `Нямаш права да променяш това поле.` |
| File too large | `Файлът надвишава лимита ({N} МБ).` |
| Server unreachable | `Грешка при свързване със сървъра.` |
| Unexpected error | `Възникна неочаквана грешка.` |
| System-set value | `Този статус се задава автоматично от системата.` / `Този източник се задава автоматично от системата.` |

## 8. Toast wording

Toasts are **single sentences ending with a period**. Action verb (success) or factual error statement.

### 8.1 Success

| Action | Toast |
|---|---|
| Single file uploaded | `Файлът беше качен.` |
| Multiple files uploaded | `Качени са {N} файла.` |
| File deleted | `Файлът беше изтрит.` |
| Generic save success | (no toast — optimistic UI handles it silently) |

**Rule**: success toasts only for actions where the user wouldn't otherwise see confirmation. Most form submits redirect to the detail page; no toast needed there.

### 8.2 Error (rollback flow)

Inline-edit failures follow the canonical rollback pattern:

> `Промяната не беше запазена. {reason}` `[Повтори]`

Standalone failure (no rollback context):

> `{Действие} не успя. {reason}`

Examples:
- `Неуспешно качване — {filename}: {reason}` (per-file upload failure)
- `Изтриването не успя. {reason}`
- `Файлът не може да бъде свален.`

## 9. Plural forms

Bulgarian plurals have two relevant forms for our UI:
- **Singular** (1 unit): `1 файл`
- **Count form** (with cardinal number 2+): `2 файла`, `5 файла`

For most nouns the count form differs from the dictionary plural. Use the count form when the noun follows a number; use the dictionary plural for "Контакти" (heading), "Файлове" (column header), etc.

### 9.1 Canonical count forms

| Noun | Singular (1) | With number (2+) | Plural heading |
|---|---|---|---|
| файл | `1 файл` | `2 файла` | `Файлове` |
| контакт | `1 контакт` | `2 контакта` | `Контакти` |
| лийд | `1 лийд` | `2 лийда` | `Лийдове` |
| договор | `1 договор` | `2 договора` | `Договори` |
| имот | `1 имот` | `2 имота` | `Имоти` |
| срещa | `1 среща` | `2 срещи` | `Срещи` |
| задача | `1 задача` | `2 задачи` | `Задачи` |
| фактура | `1 фактура` | `2 фактури` | `Фактури` |
| сграда | `1 сграда` | `2 сгради` | `Сгради` |
| ден | `1 ден` | `2 дни` | `Дни` |
| час | `1 час` | `2 часа` | `Часове` |

### 9.2 Where to handle pluralization

For now, plural choice is handled inline at the call site:

```ts
const label = count === 1 ? "файл" : "файла";
return `${count} ${label}`;
```

A future `lib/format.ts` helper `pluralize(count, { one: "файл", few: "файла" })` is worth building when a third call site appears. Don't over-engineer until then.

## 9b. Top-nav tooltips

One-sentence hints attached to every link in the app header via `<Tooltip>` (see `components/ui/tooltip.tsx`). Aimed at first-time users and non-technical staff — "tell me what this is for in one breath." Keep under ~80 characters so the tooltip stays compact.

| Link | Tooltip |
|---|---|
| Контакти | `Всички контакти на фирмата — клиенти, партньори, доставчици.` |
| Имоти | `Каталог на всички имоти на компанията — апартаменти, паркоместа, складове.` |
| Договори | `Подписаните договори и техните вноски.` |
| Лийдове | `Заявки от потенциални клиенти, готови за работа.` |
| Входяща | `Лийдове, чакащи първоначален отговор.` |
| Срещи | `Планираните и проведените срещи с клиенти.` |
| Задачи | `Лични и екипни задачи — твоите и на цялата компания.` |
| Екип | `Списък на служителите и техните роли.` |
| Отсъствия | `Подай или одобри заявки за отпуск и други отсъствия.` |
| Календар | `Кой кога е в отпуск — седмичен преглед на цялата компания.` |

These strings live in `app/(app)/layout.tsx` (the `NAV_TOOLTIPS` constant). When adding a new top-nav link, add its tooltip there and mirror it here.

The admin user-menu items don't get tooltips — their labels (`Потребители`, `Служители`, `Табло`, `Работни дни`, `Сгради`, `Продавачи`, `CSV дубликати`, `Журнал`) are self-describing, and hover tooltips inside a dropdown menu fight with the menu's own dismissal logic.

## 9c. Page-level help popovers

Each top-level page in the app has a `<PageHelp>` icon (a small `?` next to the H1) — clicking it opens a popover with 2–4 sentences explaining what the page is for, the primary action(s), and any non-obvious behavior. The component lives at `components/ui/page-help.tsx`. Copy is written inline at each page's call site; this section lists the canonical strings so reviewers can spot drift.

**Voice + length conventions** for page-help bodies:
- 2–4 sentences, no headings. Wall-of-text wears out the reader.
- Formal "Вие" — same register as nav tooltips and system errors.
- Open with **what the page is**, not what to do first. The user is reading because they want orientation, not a tutorial.
- Mention the primary action ("Кликни на име..." / "Натисни 'Нова заявка'...") when it isn't obvious from the buttons on screen.
- Call out non-obvious behavior — inline editing, role-gated fields, timer mechanics, auto-derived columns.
- Don't repeat the page title or the subtitle text below it.

**Currently wired (the canonical first-sentence flavor for each):**

| Page | First-sentence flavor |
|---|---|
| `/contacts` | "Централният списък с всички контакти..." |
| `/properties` | "Каталог на всички имоти на компанията..." |
| `/leads` | "Заявки от потенциални клиенти..." |
| `/leads/inbox` | "Лийдове чакащи първоначален отговор..." |
| `/meetings` | "Планираните и проведените срещи с клиенти..." |
| `/meetings/calendar` | "Седмичен / месечен / годишен преглед на всички планирани срещи..." |
| `/tasks` | "Лични и екипни задачи..." |
| `/contracts` | "Всички подписани договори..." |
| `/absence` | "Твоят баланс и история на отсъствията..." |
| `/absence/calendar` | "Месечен преглед на отсъствията на цялата компания..." |
| `/absence/inbox` | "Заявки за отсъствие, очакващи твоето решение..." |
| `/team` | "Активни членове на vminvest..." |

Detail / create / edit pages don't have page-help in v1 — their flow is more linear (the form labels + the breadcrumb together usually carry the orientation). If a specific edit page becomes confusing, add a `<PageHelp>` to it case-by-case.

Admin pages (`/admin/*`) also don't have page-help yet — they're power-user surfaces where the audience already knows what they're doing. Worth revisiting if admins onboard new staff.

## 9d. Per-field help popovers

A smaller sibling of `<PageHelp>` — `<FieldHelp>` (`components/ui/field-help.tsx`) — sits **next to a form-field label** and explains what the field means or what's expected. Used only on fields where the meaning isn't obvious from the label alone: composite IDs, multi-option pickers, technical identifiers, status enums with overlapping semantics.

The shared `<FormField>` component accepts an optional `help` / `helpTitle` prop, so any form built on it gets the affordance "for free" — no per-form wiring. Forms that use bare `<label>` (a few admin pages and modals) wrap label + `<FieldHelp>` manually in a `flex items-center gap-1.5` row.

**Voice + length conventions:**
- 2–4 sentences, like `<PageHelp>`, but tighter — the user is mid-form, not orienting.
- May include a short bulleted list when the field is a status/type enum and each option needs a one-liner (see Тип среща, Тип имот, Статус имот).
- Don't repeat the label text. Don't repeat the `helper` line that sits below the input — `helper` is for terse formatting hints (e.g. "Главни букви, без интервали."), `help` is for semantic explanation.
- Formal "Вие" / impersonal, same register as the rest of the app.
- The `title` defaults to the field's label, so you usually only need to pass `content`.

**Don't use field-help when:**
- The label + placeholder + helper already make the field self-explanatory (most text fields).
- The information is a one-word format hint — that's what `helper` is for.
- The explanation is per-option and the picker already shows it in-line (e.g. an enum where each option label is itself the full meaning).

**Currently wired:**

| Page / form | Field | What the popover explains |
|---|---|---|
| `/contacts/new`, `/contacts/[id]/edit` | ЕГН / ЕИК | The difference between ЕГН (personal, 10 digits) and ЕИК (company, 9 digits); checksum validation is non-blocking. |
| `/meetings/new`, `/meetings/[id]/edit` | Тип | Bulleted list of all 5 meeting types and when each applies. |
| `/absence/submit` | Тип отсъствие | Bulleted list of category semantics — paid annual reduces balance, sick requires document, unpaid records in calendar. |
| `/properties` create-modal | Тип | Bulleted list of all 13 property types with their short codes (ПМ, ВПМ, etc.). |
| `/properties` create-modal | Статус | Bulleted list of all 8 statuses and what each means in the sales pipeline. |
| `/admin/buildings` | Системно име | Internal identifier used in storage paths + CSV imports; uppercase, no spaces, immutable. |
| `/admin/buildings` | Име за показване | User-facing name in tables/filters/dropdowns; freely renamable. |
| `/admin/buildings` | Комплекс | Optional grouping of several related buildings; used by the property navigator to collapse them together. |

Detail-page inline-edit cells don't have field-help in v1 — when you're editing a cell, you've already clicked into it on purpose and the field's location implies its meaning. If a specific inline cell becomes confusing, surface help via the column header instead (column-help is a future addition, not built yet).

## 10. Locked-field tooltips

For read-only cells (`<ReadOnlyBadge reason="...">`), the canonical reason strings:

| Reason | Tooltip |
|---|---|
| System-managed timestamp | `Системно поле, попълва се автоматично.` |
| Derived from another field | `Изчислено автоматично от {source field}.` (e.g. `Изчислено автоматично от рождената дата.`) |
| Locked by another module | `Попълва се от модул {Module}.` (e.g. `Попълва се от модул Договори.`) |
| Status auto-set after action | `Попълва се автоматично при преминаване в „{Status}".` |
| Permission-locked field | `Нямаш права да редактираш това поле.` |

## 11. System attribution

When an audit-log row or activity item has a `null` actor (action taken by the system: webhook, scheduled job, migration), display the actor as:

> `Система`

Examples in code today:
- `app/(app)/admin/leads/trash/page.tsx`: `<span className="text-neutral-400">Система</span>`
- `lib/properties/status-history.ts`: comment notes `authorId: null → rendered as "Система"`

Do not use variants like `Системата`, `Автомат`, `Auto`, etc.

## 12. Numbers, dates, currency

These belong to CLAUDE.md (locale rules) and `lib/format.ts` (implementation). The copy spec does not re-define them. Reminders only:

- Date: `DD.MM.YYYY` via `formatDate()`.
- Datetime: `DD.MM.YYYY HH:MM` via `formatDateTime()`.
- Currency: `12 500,00 €` via `Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR" })`.
- Numbers: thousands = space, decimal = comma. Always via `toLocaleString("bg-BG")`.
- File size: `formatFileSize` in `lib/files/format.ts` (uses Cyrillic units: Б / КБ / МБ / ГБ).

## 13. Address forms

The product addresses the user as "Вие" (formal you). The user addresses the system / takes self-directed actions in informal singular (the destructive-confirm exception in §4.1).

Examples:
- ✅ `Не сте влезли в системата.` (system → user, formal)
- ✅ `Сигурен ли си?` (self-check, informal — only for destructive confirms)
- ✅ `Нямаш права да правиш това.` (system → user about user, accepted informal in error context)
- ❌ `Не си влязъл в системата.` (mixed register — informal where it should be formal)

If unsure, default to formal.

## 14. Module-specific terminology

These are recurring nouns + verbs that have a canonical Bulgarian translation in this project. Do not invent alternates.

| English | Bulgarian | Notes |
|---|---|---|
| Owner / Assignee | `Отговорник` | Both `Contact.owner` and `Task.owner` use this label. |
| Contact (entity) | `Контакт` | |
| Lead (entity) | `Лийд` | English loan, fully accepted in domain. |
| Contract | `Договор` | |
| Property | `Имот` | |
| Building | `Сграда` | |
| Payment milestone | `Вноска` | Per `specs/contracts.md`. |
| Installment (within a payment) | `Вноска` | Yes, same word — context disambiguates. The CSV columns talk about "Първа вноска", "Втора вноска" for milestones. |
| Status | `Статус` | |
| Type | `Тип` | |
| Task | `Задача` | |
| Attachment / File | `Файл` | Always "Файл" in UI. Never "приложение" (which means "app"). |
| Carryover (overpayment) | `Прехвърляне` / `Надплащане` | `Прехвърлено от предишна вноска` for incoming; `Надплатено` for outgoing. |
| ЕГН (Bulgarian personal ID) | `ЕГН` | Combined column with ЕИК renders as `ЕГН / ЕИК`. |
| Invoice (entity) | `Фактура` | Plural `Фактури`. Section labels (`Офис`, `Строеж`, `Реновации`, `Архитектура`) carry on top. |
| Supplier (on an invoice) | `Доставчик` | Always. Never `Продавач` (which is the property-seller role). |
| Section (invoice upload bucket) | `Секция` | Admin-configured. |
| Line item (on an invoice) | `Позиция` | Plural `Позиции`. The header reads `Позиции (N)` with the count. |
| Invoice status: pending | `Чакаща` | Tone `info`. The default state after upload. |
| Invoice status: paid | `Платена` | Tone `success`. Stamps `paidAt` + `paidBy` when set. |
| Anomaly flag (price >5% above baseline) | `Ценови сигнал` | Plural `Ценови сигнали`. Surfaces as ⚠ + warning-toned row background. |
| Upload an invoice | `Качи фактура` | Button on the section card and inside the modal. |
| Mark as paid | `Маркирай като платена` | Detail page top-right button. Inverse: `Върни на чакаща`. |
| Download PDF | `Изтегли PDF` | Always with the `PDF` initialism. |
| Add a line | `+ Добави ред` | Inside the line-items editor. |

## 15. Drift currently in the codebase

The three drift items the first draft surfaced (retry label, empty-state phrasing, owner empty-state em-dash) were reconciled in the same round the spec landed. Section kept for future drift entries — log new inconsistencies here with file paths so they're greppable.

_No outstanding drift as of 30.04.2026._

## 16. Out of scope

- **Translation infrastructure** (i18next, message bundles). The product is Bulgarian-only by design.
- **Pluralization library.** Native-helper-in-`lib/format.ts` only when 3+ call sites need it.
- **Auto-enforcement by lint rules.** Discipline + review citations carry this spec.
- **Email subject lines and body copy.** Lives in `lib/email/` per template; spec out separately if drift appears.
- **Marketing / external-facing copy.** This product is internal — there's no marketing voice.

## 17. How to update this spec

When you add a new pattern that recurs (a new validation type, a new toast shape, a new placeholder), add it here in the same shape as existing entries. Cite the file path of the first call site. Update modules to match if they predate the new entry.

When two call sites diverge: pick the better-sounding form, write it here, list the drift in §15, and migrate at convenience (or when the surrounding code is touched anyway).
