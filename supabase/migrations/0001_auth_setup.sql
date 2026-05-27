-- Auth setup: profile sync trigger + RLS policies
-- Apply this once via Supabase Dashboard → SQL Editor → New query.
--
-- This file is the source of truth for auth-side database wiring.
-- Re-running is safe (drop-then-create everywhere it matters).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Profile sync: when an auth.users row is created, insert a public.profiles
--    row mirroring it. Role + full_name are read from raw_user_meta_data, with
--    sensible defaults so a manual signup still produces a valid profile.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_role text;
  resolved_role public."Role";
begin
  meta_role := coalesce(new.raw_user_meta_data->>'role', 'user');

  if meta_role not in ('admin', 'manager', 'user') then
    resolved_role := 'user';
  else
    resolved_role := meta_role::public."Role";
  end if;

  insert into public.profiles (id, email, full_name, role, created_at, updated_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    resolved_role,
    now(),
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS policies. Service-role bypasses RLS, so admin server actions still
--    work. The policies cover what users can do with their own anon-key session.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles               enable row level security;
alter table public.invites                enable row level security;
alter table public.audit_events           enable row level security;
alter table public.failed_login_attempts  enable row level security;

-- Helper: is the calling user an admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active = true
  );
$$;

-- Helper: is the calling user a manager or admin?
create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'manager') and active = true
  );
$$;

-- ── profiles ────────────────────────────────────────────────────────────────
-- Anyone signed in can read profiles (team directory). No one writes via RLS;
-- writes go through server actions using the service-role client.
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles
  for select to authenticated
  using (true);

-- ── invites ─────────────────────────────────────────────────────────────────
-- Only admins read invites; writes go through service role.
drop policy if exists invites_select_admin on public.invites;
create policy invites_select_admin on public.invites
  for select to authenticated
  using (public.is_admin());

-- ── audit_events ────────────────────────────────────────────────────────────
-- Only admins read; writes go through service role.
drop policy if exists audit_events_select_admin on public.audit_events;
create policy audit_events_select_admin on public.audit_events
  for select to authenticated
  using (public.is_admin());

-- ── failed_login_attempts ──────────────────────────────────────────────────
-- Server-only table; no client reads.
-- (No SELECT policy = no rows visible to authenticated; service role bypasses.)
