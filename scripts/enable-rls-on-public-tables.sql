-- Enable Row Level Security on every public-schema table.
--
-- Why: Supabase exposes the public schema via its PostgREST API. The anon
-- key (NEXT_PUBLIC_SUPABASE_ANON_KEY) is embedded in the client-side JS
-- bundle, so anyone who can reach the app can extract it and query the
-- API directly, bypassing the Next.js login wall. Without RLS, those
-- queries return every row.
--
-- With RLS enabled and zero policies defined, the `anon` and
-- `authenticated` roles get back zero rows on every query — effectively
-- closing the API surface. The `postgres` role used by Prisma's direct
-- connection has BYPASSRLS, so the app keeps working unchanged.
--
-- This is exactly the configuration the Supabase Security Advisor expects
-- for "table not used by client SDK" cases.
--
-- Idempotent — safe to re-run.

-- Core public-schema tables flagged by the advisor.
ALTER TABLE public.profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.failed_login_attempts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buildings               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_notes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_assignees       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_properties     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_payments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_installments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_attachments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_sections        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items      ENABLE ROW LEVEL SECURITY;
