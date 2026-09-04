ALTER TYPE public.pluggy_connection_status ADD VALUE IF NOT EXISTS 'revoked';

ALTER TABLE public.pluggy_connections
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid,
  ADD COLUMN IF NOT EXISTS revoke_reason text,
  ADD COLUMN IF NOT EXISTS provider_delete_status text;