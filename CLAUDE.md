# CLAUDE.md

Always-loaded orientation for this repo. Read this first, then load only the specific `/specs/` files relevant to the task.

## What this is
Internal ERP for **vminvest** — a ~25-person Bulgarian construction company in Sofia. Replaces a patchwork of Excel, email, and institutional memory with one system. Entirely internal — no client-facing portals, no public pages.

Detailed company + compliance context: `/specs/_foundations/context.md`.

## Stack
- **Framework**: Next.js 15 (App Router)
- **Database**: Supabase (Postgres, multi-schema: `public` + `absence`)
- **Auth**: Supabase Auth (invite-based, no self-signup — see `/specs/_foundations/authentication.md`)
- **ORM**: Prisma 6
- **Styling**: Tailwind + design tokens from `/specs/design-system/tokens.md`
- **Outbound email**: Resend

Don't introduce alternatives (TypeORM, NextAuth, Clerk, Drizzle, etc.) without asking.

## Locale — non-negotiable, applies everywhere
- **UI language**: Bulgarian (bg-BG). All user-facing text, labels, buttons, toasts, errors, emails → Bulgarian.
- **Code language**: English. Variable names, file names, function names, commit messages, code comments, docs → English. Never translate identifiers.
- **Currency**: EUR, displayed as `12 500,00 €` (space thousands, comma decimal, space before `€`).
- **Date**: `DD.MM.YYYY`.
- **Time**: 24h.
- **Timezone**: `Europe/Sofia`.
- **Number formatting**: thousands separator = space, decimal separator = comma.

Never hardcode formatting. Use the helpers in `/lib/format.ts` (`formatDate`, `formatDateTime`, etc.). ЕГН validation lives in `/lib/bg-id.ts`. Per-module parsers (`lib/contacts/parse.ts`, `lib/properties/parse.ts`) handle their own FormData validation.

## Folder conventions
```
/app              Next.js routes. Route group (app)/ wraps authenticated pages;
                  one folder per module (app/(app)/contacts, app/(app)/properties, ...).
                  Public/auth routes live outside the group.
/components
  /ui             Design-system primitives (Button, Input, StatusBadge, Table, ContactPicker, ...).
/lib
  format.ts       Locale-aware formatting (formatDate, formatDateTime, ...).
  bg-id.ts        ЕГН (Bulgarian personal ID) validator.
  cn.ts           Tailwind class merger (clsx wrapper).
  prisma.ts       Prisma client singleton.
  [module]/       Per-module helpers (queries, filters, parse, permissions, constants, actions).
  auth/           session, invite, audit, lockout helpers.
  supabase/       Server + client Supabase factories.
  email/          Resend wrappers per message type.
/prisma
  schema.prisma   Full data model. Multi-schema (public + absence). Seed via /scripts/*.
/scripts
  import-contacts.ts    One-shot CSV seed for Contacts.
  import-properties.ts  One-shot CSV seed for Properties + Buildings (Windows-1251).
/specs
  _index.md            Module map. Read this to orient.
  decisions.md         Running one-line decision log. Read before questioning a surprising choice.
  _foundations/        Cross-cutting specs (context, authentication, roles, ui-patterns-*).
  design-system/       Visual + structural component specs (tokens, tables, modals, inputs, ...).
  *.md                 One per module, lowercase (properties.md, contacts.md, ...).
```

## How to work with /specs
- Start any new module task by reading `_index.md` + the specific module file + the foundations it references.
- Don't re-derive UI patterns already covered by `/specs/_foundations/ui-patterns-*.md`.
- Don't re-derive permissions — they're in `/specs/_foundations/roles.md`.
- If a module spec disagrees with a foundation spec, the foundation wins. Flag the inconsistency in `decisions.md`.

## UI patterns — load on demand
Every table, form, modal, and relation in the system follows these patterns. Never invent a new one without updating the foundation file first.

| Task | Load |
|---|---|
| Any table view | `/specs/design-system/tables.md`, `/specs/design-system/tables-advanced.md`, `/specs/_foundations/ui-patterns-inline-edit.md` |
| Any form | `/specs/design-system/inputs.md`, `/specs/design-system/buttons.md` |
| Any modal | `/specs/design-system/modals.md` |
| Any linked-record field | `/specs/_foundations/ui-patterns-relations.md` |
| Visual tokens (colors, spacing, radii) | `/specs/design-system/tokens.md`, `/specs/design-system/aesthetic.md` |

## Roles (summary — full matrix in `/specs/_foundations/roles.md`)
Three roles, one per user: **admin**, **manager**, **user**. Permission checks happen in **both** the UI (hide) and the API (enforce). Never trust the UI alone.

## Data model backbone (details per module spec)
```
Contact
  └─ Lead
      └─ Meeting
          └─ Contract → Property
              └─ Payment
                  └─ Installment
```
Plus: Tasks, Renovations, Absence Requests, Invoices. Contacts is the root — every other entity attaches to a Contact directly or transitively.

## Don't do this (hard rules)
- **Don't install new dependencies without asking.** Stack is fixed in this file.
- **Don't translate identifiers.** Code stays English even when the team speaks Bulgarian.
- **Don't write English UI copy.** Even in placeholders, tooltips, loading states, and 404 pages.
- **Don't hardcode colors, spacing, radii, or fonts.** Use design tokens.
- **Don't hardcode formatting.** Use `/lib/format.ts`.
- **Don't invent new UI patterns.** Check `/specs/_foundations/` and `/specs/design-system/` first.
- **Don't cascade-delete across modules.** Orphan children with a confirmation modal listing what will be affected (`specs/contacts.md` §5.2 pattern).
- **Don't run destructive migrations on the dev DB without a prompt.** Always show the SQL first.
- **Don't silently mass-edit data.** No drag-to-fill, no bulk operations in Phase 1.
- **Don't send client emails except payment reminders.** Only outbound channel in Phase 1 (see `/specs/payments.md` — pending — for cadence).
- **Don't bypass role checks in API routes.** Every mutation and every sensitive read enforces role. Middleware is not enough on its own.
- **Don't surface ЕГН, phone, or email in logs, URLs, or error messages.** GDPR-sensitive; audit log handles access tracking.

## Rules to prevent bloaty code:
- Prefer editing existing files over creating new ones.
- No new abstractions unless used in 2+ real places.
- No unrelated refactors.
- No broad formatting-only changes.
- No fallback/mock/demo logic in production code.
- No new dependencies without explicit approval.
- Tests must verify behavior, not implementation details.
- Keep PRs under ~300 changed lines unless explicitly approved.

## Bulgarian text conventions
- Button labels are verbs in the imperative or the infinitive form the team is used to — check `/specs/_foundations/bg-copy.md` (pending) for canonical strings. When in doubt, look at how existing modules phrase the same action.
- Error messages are specific and actionable. `Невалидно ЕГН` over `Грешка`. `Полето е задължително` over `Required`.
- Never mix English and Bulgarian in the same UI element. `Save промените` is wrong. `Запази промените` is right.
- Tooltips are short single-sentence explanations, ending with a period.

## Commands
```bash
npm run dev               # Next.js dev server (no Turbopack — Prisma DLL lock on Windows)
npm run build             # Production build
npm run lint              # ESLint
npm run typecheck         # tsc --noEmit
npm run db:push           # Push schema to DB without migration files (current workflow)
npm run db:migrate        # Prisma migrate dev — NOT used yet (no migrations dir)
npm run db:exec           # Run raw SQL from a file against the DB
npm run db:studio         # Prisma Studio
npm run db:generate       # Regenerate Prisma client (stop dev server first — Windows DLL lock)
npm run contacts:import   # Seed Contacts from /files/Contacts/Contacts.csv
npm run properties:import # Seed Properties + Buildings from /files/Properties/all-properties.csv
```

**Windows dev gotchas.** The Prisma query-engine DLL is locked while `next dev` is running — if `npm run db:generate` / `db:push` fails with `EPERM: operation not permitted … query_engine-windows.dll.node`, stop the dev server first, regenerate, then restart.

## When uncertain
1. Check `/specs/_index.md` to see if a spec exists for the topic.
2. Check `/specs/decisions.md` for past reasoning.
3. Ask before guessing — especially on Bulgarian copy, business rules, or anything legal/financial.

## Meta-rule
**Write every decision down.** When you make a non-obvious choice (field shape, naming, fallback behavior, skipped validation, anything a future reader might question), add one line to `/specs/decisions.md`:
```
[DD.MM.YYYY] — [decision] — [one-line reason]
```
This is the single highest-leverage habit for this project.
