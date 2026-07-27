-- Bloco 3: hardening do webhook Pluggy
ALTER TABLE public.open_finance_webhook_events
  ADD COLUMN IF NOT EXISTS received_ip text,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_of_webhook_events_event_id
  ON public.open_finance_webhook_events(event_id)
  WHERE event_id IS NOT NULL;

ALTER TABLE public.open_finance_sync_runs
  ADD COLUMN IF NOT EXISTS queued_at timestamp with time zone NOT NULL DEFAULT now();