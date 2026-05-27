-- Defense-in-depth: prevent the last active admin from being demoted or
-- deactivated, even by direct SQL or a misbehaving service-role caller.
-- Apply via Supabase Dashboard → SQL Editor.

create or replace function public.guard_last_admin()
returns trigger
language plpgsql
as $$
declare
  remaining_admins int;
begin
  -- Only intervene when the change would remove an admin from active duty.
  if (old.role = 'admin' and old.active = true)
     and (new.role <> 'admin' or new.active = false) then
    select count(*) into remaining_admins
    from public.profiles
    where role = 'admin'
      and active = true
      and id <> old.id;

    if remaining_admins = 0 then
      raise exception 'cannot remove last active admin'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_last_admin on public.profiles;
create trigger guard_last_admin
  before update on public.profiles
  for each row execute function public.guard_last_admin();
