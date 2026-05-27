-- Absence module (part 3 of 3): RLS policies.
-- Paste into Supabase SQL Editor and run.

alter table absence.categories         enable row level security;
alter table absence.absence_requests   enable row level security;
alter table absence.calendar_years     enable row level security;
alter table absence.calendar_days      enable row level security;
alter table absence.notifications      enable row level security;
alter table absence.anomaly_flags      enable row level security;

drop policy if exists categories_select on absence.categories;
create policy categories_select on absence.categories for select to authenticated using (true);

drop policy if exists requests_select on absence.absence_requests;
create policy requests_select on absence.absence_requests for select to authenticated using (
  employee_id = auth.uid()
  or current_approver_id = auth.uid()
  or public.is_manager_or_admin()
);

drop policy if exists calendar_years_select on absence.calendar_years;
create policy calendar_years_select on absence.calendar_years for select to authenticated using (true);

drop policy if exists calendar_days_select on absence.calendar_days;
create policy calendar_days_select on absence.calendar_days for select to authenticated using (true);

drop policy if exists notifications_select on absence.notifications;
create policy notifications_select on absence.notifications for select to authenticated using (
  recipient_id = auth.uid() or public.is_admin()
);

drop policy if exists notifications_update on absence.notifications;
create policy notifications_update on absence.notifications for update to authenticated using (recipient_id = auth.uid());

drop policy if exists anomaly_flags_select on absence.anomaly_flags;
create policy anomaly_flags_select on absence.anomaly_flags for select to authenticated using (public.is_admin());
