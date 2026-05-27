# Project Context — vminvest ERP

## 1. Company
- **Name:** vminvest
- **Website:** vminvest.bg
- **Business:** Construction company that builds and sells its own properties.
- **Geography:** Sofia, Bulgaria only. Most current projects in Malinova Dolina district (with some exceptions).
- **Team size:** ~25 people.
- **Values:** Honesty, reliability, delivering on client promises. This should shape tone of any client-facing copy (e.g. payment reminder emails) — warm, direct, no corporate fluff.

## 2. Users & Culture
- Users are **not technically savvy**. The system must be minimal, with the fewest clicks and smallest surface area for human error.
- Every non-obvious feature must have a **tooltip** with a short explanation of how to use it.
- **UI language: Bulgarian.** All user-facing text, labels, buttons, emails, error messages → Bulgarian.
- **Code, file names, variable names, documentation: English.** Don't translate identifiers.
- The system is **entirely internal**. No client-facing portals, no public pages, no client logins, no digital signing.

## 3. Locale & Formatting
- **Language:** Bulgarian (bg-BG)
- **Currency:** EU, displayed as e.g. 12 500,00 €
- **Date format:** DD.MM.YYYY
- **Time format:** 24h
- **Timezone:** Europe/Sofia
- **Decimal separator:** comma (`,`), thousands separator: space

## 4. Compliance
- **GDPR applies.** We store personal data of clients: full names, phones, emails, birth dates, ЕГН.
- **ЕГН (Bulgarian personal ID):** 10 digits, has a checksum — validate format on input. Treat as sensitive; display should be restricted to roles that need it (exact rules in `roles.md`).
- Support **right-to-be-forgotten**: an admin must be able to delete or anonymize a client's personal data on request.
- **Audit log** tracks who accessed/modified sensitive records (full spec in `audit log.md`, coming later).

## 5. Team Structure
- Source of truth for the org chart: `/files/Team - Users & Roles/team.csv` (roles + reporting lines).
- At a high level, the org splits into three divisions:
  1. **Administration & Legal** — office-based
  2. **Construction field** — team leaders who coordinate external contractor crews that do the actual building
  3. **Sales & Marketing** — office-based
- Admin, legal, sales, and marketing all sit together in the office. Construction-field people are on-site.

## 6. Tech Stack
- **Framework:** Next.js
- **Database + Auth:** Supabase (Postgres + Supabase Auth)
- **ORM:** Prisma
- **Outbound email:** Resend (invites, password resets, client payment reminders)

## 7. Modules (scope for this project)

### 7.1 Authentication
Fully specified in `authentication.md`. Invite-based, Supabase Auth, Bulgarian UI. No self-signup.

### 7.2 Roles & Permissions
Fully specified in `roles.md` (coming later). Roles: `admin`, `manager`, `user`.

### 7.3 Dashboard
High-level overview for admins and managers. **Deferred** — detailed spec to come later. Don't build yet.

### 7.4 Business domain modules

The core data model follows a parent → child chain. **Contacts is the root.** Everything else attaches to it:

```
Contact
  └─ Lead (a contact who becomes a sales prospect)
      └─ Meeting (one lead can have multiple meetings before converting)
          └─ Contract (the deal, when a lead converts) -> asks user to associate Contract with **Property**
              └─ Payment (a contract has up to 4 payment milestones,
                          deposit, act 14, act 15, completion)
                  └─ Installment (each payment can be split into
                                  up to 3 installments; max 12 per contract, all with individual due dates)
```
Additional tasks such as :

**Tasks module** - When i click on it i see two distinct categories - Personal tasks and Team tasks. Personal tasks - only I can see as user. Team tasks - everyone sees and collaborates on. Project management essentials/basics applied.
- Tracks deadlines
- Who's responsible
- Description of the task at hand
You can assign different people, more than one person per task.

**Contacts module**
- Stores: full name, phone, email, birth date, age (derived from birth date), ЕГН.
- Table view lists all contacts.
- Clicking a contact opens a **client profile** page with:
  - All personal details
  - An **updates/activity feed** where team members can post notes and comment on each other's notes — so the whole team stays in the loop on what's happening with that client.
  - Links to the client's leads, meetings, contracts, payments, installments.

**Leads, Meetings, Contracts, Payments, Installments**
- Each is its own module but always viewable in the context of its parent contact.
- Team needs to clearly see **due dates** for payments and installments, and what's upcoming/overdue.

**Properties**
- Table view Airtable style with all the company's properties segmented by Building. When a contract is signed the Property is associated with the Contact and the Corresponding Contract so, whichever of the three modules I actually view, as a user I will know it's associated with the rest.

Contract 
       └─ When creating the Contract it asks you to associate the Contract with a Property
                                                        └─That would also propagate on the Contact level so whenever i view a Contact I know which Contract and Property belong to it.

**Renovations**
- Every owner of property in our buildings may request Renovations. You go to module Rennovations and press "New Rennovation". That would ask you to associate it with a Property. 
- It should also have a drop-down menu where you indicate what type of renovation it is. I'll define five different renovations later on, which will act like templates in the project management module outlined in the point below.
- Every renovation is a project and we need to track tasks, timelines, deadlines, resources, owners, notifications. Table view and Gantt chart view.
- As aManager, I need to have a dashboard with a high level overview of all the projects running, available resources, etc.


### 7.5 Absence Requests
Fully specified in `absence.md`. Handles vacation, paid/unpaid leave, parental leave, etc. Employees submit, managers approve, managers see overview.

## 8. Client Communication (outbound)
- The only client-facing touchpoint in this system is **payment reminder emails** sent via Resend. 
- Exact reminder cadence (days before due, overdue follow-ups, who gets CC'd internally) — **TBD, decide before building the payments module.**

## 9. Out of Scope (explicitly)
- Client-facing portals or logins
- Digital signing of contracts
- Public website integration (vminvest.bg is separate)
- Multi-currency, multi-language, multi-country support
- Complex approval workflows beyond what's in `absence.md`
