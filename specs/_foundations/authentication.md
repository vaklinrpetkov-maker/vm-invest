# Authentication

## 1\. Purpose

Control who can sign in to the ERP and what actions they're allowed to perform.

## 2\. Ideology

The company is small and consists of people who are not always technically-savvy, so we need to keep the auth/login incredibly simple and straightforward.

It's much easier for an admin to just send out invites that arrive in people's emails with roles already set, instead of reactively waiting for people to create their own accounts. Hence I've settled on the following mechanism:

## 3\. Auth approach

Use **Supabase Auth** as the authentication layer (not a custom-built one). It handles invites, password hashing, password resets, sessions, and most of the scary edge cases out of the box.

Prisma is still used for the rest of the database (business data, roles, audit log, etc.). Supabase Auth manages the `auth.users` table; our own tables reference users by their Supabase user ID.

## 4\. Mechanism - Happy path

### 4.1 Bootstrap

The first account created in the system is auto-promoted to **admin**. This is the only way an admin exists initially; after that, admins are created by other admins sending invites.

### 4.2 Sending an invite

An admin sees 3 fields/buttons on the invite screen:

* **Email** — text field for the recipient's email address.
* **Role** — dropdown with options: `admin`, `manager`, `user`. Role rights are defined in `roles.md`.
* **Send** button — sends the invite.

Rules:

* Only admins can send invites. Managers and users cannot see this screen.
* An admin cannot invite someone to a role *higher* than their own. (Currently only admins invite, so this is mostly future-proofing for when managers might invite users.)
* If the email already belongs to an active account → show an error: "This user already has an account."
* If there's already an active (unexpired) invite for this email → show a warning, but allow the admin to resend. Resending **deactivates the old invite** and issues a new one.

### 4.3 Receiving the invite

The recipient gets an email (sent via Resend) containing a link. Clicking the link opens a page where they:

1. Type their password twice to confirm.
2. Password must be **at least 12 characters**. No other complexity rules — length is what matters.
3. On submit, they're redirected straight into the ERP, logged in, with visibility matching their assigned role.

Invite links are valid for **72 hours**. After that, the link is dead and the admin needs to resend.

### 4.4 Day-to-day login

A returning user sees a simple login page with:

* Email field
* Password field
* "Log in" button
* "Forgot password?" link (triggers Supabase's password reset email flow)

### 4.5 Sessions

* Users stay logged in for **30 days** by default.
* "Stay logged in" behavior can be toggled off later from Profile settings (**don't build Profile settings yet, just leave the hook for it**).
* Logout button lives in the top-right user menu.

### 4.6 Password reset

Standard flow via Supabase: user clicks "Forgot password?", gets a reset email, link is valid for 1 hour, clicking it lets them set a new password, same 12-character minimum applies.

## 5\. Edge Cases to Handle

* \[ ] Deactivated user with an active session → session should be invalidated on next request, not just at next login.
* \[ ] Role changes mid-session → new role takes effect on next request (or next page load at the latest).
* \[ ] Concurrent logins / session limits → allow multiple devices, no hard limit for now.
* \[ ] Account lockout after N failed login attempts → lock account for 15 minutes after 5 failed attempts.
* \[ ] Password reset token expiry/replay → tokens expire after 1 hour and can only be used once.
* \[ ] Invite link already used → show "This invite has already been redeemed" message.
* \[ ] Invite link expired → show "This invite has expired, please ask your admin to resend" message.
* \[ ] User tries to log in before setting a password (clicked invite but never finished) → treat as "account not yet activated", tell them to use their invite link.

## 6\. Stack

Next.js + Supabase (Auth + Postgres) + Prisma (ORM) + Resend (outbound emails for invites, password resets, etc.)

## 7\. Audit log

Full audit log spec lives in `audit log.md` (to be written later). For this module, make sure the following events are captured:

* Invite sent (by whom, to whom, role)
* Invite redeemed
* Invite expired/cancelled/resent
* Successful login
* Failed login attempt
* Password reset requested
* Password reset completed
* Logout
* Role change
* Account deactivated

## 8\. Acceptance Criteria

* \[ ] A user can sign in and land on an authenticated page.
* \[ ] Unauthenticated requests to protected routes get redirected to login (or return 401 for API calls).
* \[ ] Role checks block UI and API independently (never trust the client alone).
* \[ ] Auth events are written to the audit log.
* \[ ] Invite flow works end-to-end: admin sends → recipient receives email → clicks link → sets password → lands in ERP with correct role.
* \[ ] Expired/already-used invite links show a clear error instead of a blank page or crash.
* \[ ] First-ever account created is automatically an admin.
* \[ ] Forgot-password flow works end-to-end.

