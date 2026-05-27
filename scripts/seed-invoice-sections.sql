-- Seed the 4 default invoice sections shown on /invoices.
-- Idempotent: re-running is a no-op thanks to the unique `slug` constraint.
-- The labels are user-facing Bulgarian per CLAUDE.md locale rules; slugs are
-- internal identifiers used in Supabase Storage paths and are immutable.

INSERT INTO public.invoice_sections (id, label_bg, slug, sort_order, active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'Офис',        'office',       1, true, now(), now()),
  (gen_random_uuid(), 'Строеж',      'construction', 2, true, now(), now()),
  (gen_random_uuid(), 'Реновации',   'renovation',   3, true, now(), now()),
  (gen_random_uuid(), 'Архитектура', 'architecture', 4, true, now(), now())
ON CONFLICT (slug) DO NOTHING;
