
-- 1. Add asaas_customer_id to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS asaas_customer_id text;

-- 2. Webhook events table for idempotency
CREATE TABLE IF NOT EXISTS public.asaas_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.asaas_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins view webhook events"
  ON public.asaas_webhook_events FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_asaas_webhook_events_type ON public.asaas_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_asaas_webhook_events_created ON public.asaas_webhook_events(created_at DESC);
