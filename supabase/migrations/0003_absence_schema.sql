-- Absence module — schema creation only.
-- Apply via Supabase Dashboard → SQL Editor BEFORE running `npm run db:push`.
-- This creates the `absence` Postgres schema so Prisma can put tables in it.

create schema if not exists absence;
grant usage on schema absence to authenticated, service_role;
