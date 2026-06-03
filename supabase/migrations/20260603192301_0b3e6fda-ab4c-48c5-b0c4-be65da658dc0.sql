
ALTER TYPE public.company_role ADD VALUE IF NOT EXISTS 'viewer';

ALTER TABLE public.company_members
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.company_invites
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.company_invites
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;
