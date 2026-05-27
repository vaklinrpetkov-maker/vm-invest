# Roles & Permissions

## 1. Purpose
Define who can do what inside the ERP. Every person has exactly **one role**. The role decides which modules they see and what buttons they can press.

## 2. The three roles

We keep it simple — only three roles. No custom per-person permissions.

### 2.1 Admin
**Who:** Owners, and 1–2 trusted people in administration.
**Why this role exists:** Someone needs to be able to do absolutely everything — invite people, fix mistakes, delete data
**Rule of thumb:** If in doubt, admins can do it.

### 2.2 Manager
**Who:** Heads of each division (administration/legal lead, construction-field lead, sales/marketing lead) and anyone with direct reports.
**Why this role exists:** They run day-to-day operations. They need to see everything happening in the business, but they shouldn't be able to delete things or touch sensitive personal data.
**Rule of thumb:** Managers can *see everything* but *change less* than admins.

### 2.3 User
**Who:** Everyone else. The default role for most of the team.
**Why this role exists:** Individual contributors who work on their own clients, meetings, and tasks. They shouldn't be poking around in other people's work or seeing company-wide stuff.
**Rule of thumb:** Users see and edit their own stuff. They can see teammates' work but not edit it.

## 3. Permissions matrix

✅ = can do it  🟡 = can do it, but only for records they own / are assigned to  ❌ = cannot do it

### 3.1 Contacts, Leads, Meetings, Contracts

| Action | Admin | Manager | User |
|---|---|---|---|
| See the list of all contacts | ✅ | ✅ | ✅ |
| See a contact's full profile | ✅ | ✅ | ✅ |
| Create a new contact | ✅ | ✅ | ✅ |
| Edit a contact | ✅ | ✅ | ✅ |
| Delete a contact | ✅ | ✅ | ❌ |
| See ЕГН (personal ID) | ✅ | ✅ | ✅ |
| Edit ЕГН | ✅ | ✅ | ✅ |
| Post notes/updates on a client profile | ✅ | ✅ | ✅ |
| Delete someone else's note | ✅ | ✅ | ❌ |
| Delete their own note | ✅ | ✅ | ✅ |
| Create/edit leads, meetings, contracts | ✅ | ✅ | 🟡 (only their own) |
| **Delete a lead** | ✅ | ✅ | **✅ *** |
| Restore a soft-deleted lead | ✅ | ❌ | ❌ |
| Stop a running lead timer (Phase 2) | ✅ | ✅ | ✅ |
| Create a meeting | ✅ | ✅ | ✅ |
| Edit / cancel a meeting | ✅ | ✅ | 🟡 (only if assignee) |
| Mark a meeting as състояла се | ✅ | ✅ | 🟡 (only if assignee) |
| Restore cancelled meeting (within 30 days) | ✅ | ✅ | 🟡 (only if assignee) |
| Restore cancelled meeting (after 30 days) | ✅ | ❌ | ❌ |

*Deliberate deviation from the rest of this matrix — per `Leads.md §10`, all roles can delete any lead. Deletes are soft + audit-logged, and admin can restore. Rationale: inbound email leads often land on the wrong team member or are obvious spam/duplicates; junior salespeople shouldn't have to escalate every cleanup.

### 3.2 Payments & Installments

| Action | Admin | Manager | User |
|---|---|---|---|
| See all payments & installments | ✅ | ✅ | ✅ |
| Create/edit payments & installments | ✅ | ✅ | ❌ |
| Mark a payment as received | ✅ | ✅ | ❌ |
| Delete a payment | ✅ | ✅ | ❌ |
| Trigger a manual reminder email | ✅ | ✅ | ❌ |

### 3.3 Absence Requests

| Action | Admin | Manager | User |
|---|---|---|---|
| Submit their own absence request | ✅ | ✅ | ✅ |
| See their own requests | ✅ | ✅ | ✅ |
| See requests from their direct reports | ✅ | ✅ | ❌ |
| See everyone's requests | ✅ | ✅ | ❌ |
| Approve/reject their direct reports' requests | ✅ | ✅ | ❌ |
| Approve/reject anyone's requests | ✅ | ❌ | ❌ |
| View everyone's approved leave requests in a calendar view | ✅ | ✅ | ✅ |

### 3.4 Dashboard

| Action | Admin | Manager | User |
|---|---|---|---|
| See the dashboard | ✅ | ✅ | ❌ |


(Users don't need the dashboard — they have their own work views.)

### 3.5 Invoices

| Action | Admin | Manager | User |
|---|---|---|---|
| See `/invoices` (any section) | ✅ | ✅ | ❌ |
| Upload through any section | ✅ | ✅ | ❌ |
| View any invoice (incl. other managers') | ✅ | ✅ | ❌ |
| Edit invoice metadata while `pending` | ✅ | ✅ | ❌ |
| Edit invoice metadata while `paid` | ✅ | ❌ (🔒) | ❌ |
| Flip status (pending ↔ paid) | ✅ | ✅ | ❌ |
| Delete while `pending` | ✅ | ✅ (only if uploader) | ❌ |
| Delete while `paid` | ✅ | ❌ | ❌ |
| Manage invoice sections (`/admin/invoice-sections`) | ✅ | ❌ | ❌ |

The module is invisible to the `user` role — the nav link is hidden in `app/(app)/layout.tsx` and the page itself returns 404 if a user role hits the URL directly. See `specs/invoices.md` §11 for the field-level locking rationale (manager edits halt at the `paid` boundary so historical records stay clean).

### 3.6 User management & system settings

| Action | Admin | Manager | User |
|---|---|---|---|
| Invite new people | ✅ | ❌ | ❌ |
| Change someone else's role | ✅ | ❌ | ❌ |
| Deactivate a user | ✅ | ❌ | ❌ |
| See the audit log | ✅ | ❌ | ❌ |


## 4. A few important rules

### 4.1 One role per person
A person is either an admin, a manager, or a user. Nobody is "admin for contacts but user for absences." Keep it simple.

### 4.2 Managers can see everything in their scope
A manager isn't limited to "their" clients the way users are. A manager can see all contacts, leads, meetings, and contracts across the company. They just can't delete things.

### 4.3 "Assigned to" for users
When a user creates a contact/lead/meeting/contract, they are automatically the "assigned" person. Admins and managers can reassign. A user can only edit records where they are the assigned person.

### 4.4 Role checks happen in two places
This is a note for the AI/developer, not for the end users:
- **In the UI** — hide buttons and pages the user can't use, so the interface stays clean.
- **In the backend (API)** — check the role again on every request, because the UI alone is never trustworthy.

Both checks must exist. Hiding a button in the UI without blocking the API = not secure.

### 4.5 Role changes take effect immediately
If an admin changes someone's role while that person is logged in, the new permissions kick in on their next click — they don't need to log out and back in.

## 5. Edge cases

- **The last admin** — the system must not allow removing the admin role from the only remaining admin. Otherwise nobody can invite anyone and the company is locked out.
- **User tries to access a page their role doesn't allow** — show a friendly "You don't have access to this page" message in Bulgarian, not a scary error.
- **Manager tries to approve their own absence request** — not allowed. Their request goes to an admin instead.
- **User is deactivated while logged in** — their session ends on next request (covered in `authentication.md`).

## 6. Out of scope
- Custom per-person permissions — we're not building that, ever. If the three roles don't fit someone, we rethink the roles, not add custom overrides.
- Temporary role elevation / "act as admin for an hour" — not needed.
