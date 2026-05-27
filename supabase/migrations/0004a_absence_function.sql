-- Absence module (part 1 of 3): working-days function + self-approval guard.
-- Paste into Supabase SQL Editor and run.

create or replace function absence.fn_working_days(
  p_start date,
  p_end date,
  p_start_half boolean default false,
  p_end_half boolean default false
) returns numeric
language plpgsql
stable
as $fn$
declare
  total numeric := 0;
  d date;
  cd_is_working boolean;
  resolved_is_working boolean;
begin
  if p_end < p_start then
    return 0;
  end if;

  for d in select generate_series(p_start, p_end, interval '1 day')::date
  loop
    select cd.is_working into cd_is_working
      from absence.calendar_days cd
     where cd.day = d;

    resolved_is_working := coalesce(cd_is_working, extract(isodow from d) between 1 and 5);

    if resolved_is_working then
      total := total + 1;
    end if;
  end loop;

  if p_start_half then
    select cd.is_working into cd_is_working
      from absence.calendar_days cd
     where cd.day = p_start;
    if coalesce(cd_is_working, extract(isodow from p_start) between 1 and 5) then
      total := total - 0.5;
    end if;
  end if;

  if p_end_half and p_end <> p_start then
    select cd.is_working into cd_is_working
      from absence.calendar_days cd
     where cd.day = p_end;
    if coalesce(cd_is_working, extract(isodow from p_end) between 1 and 5) then
      total := total - 0.5;
    end if;
  end if;

  return greatest(total, 0);
end;
$fn$;

create or replace function absence.guard_self_approval()
returns trigger language plpgsql as $fn$
begin
  if new.current_approver_id is not null
     and new.current_approver_id = new.employee_id then
    raise exception 'employee cannot be their own approver'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$fn$;

drop trigger if exists guard_self_approval on absence.absence_requests;
create trigger guard_self_approval
  before insert or update on absence.absence_requests
  for each row execute function absence.guard_self_approval();
