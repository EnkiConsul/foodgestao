-- =========================================================
-- PEDIDOS FASE 9 — Inbox / Outbox / integrações (fundação)
-- =========================================================

DO $$ BEGIN
  CREATE TYPE public.ped_integration_provider AS ENUM ('sandbox','ifood','rappi','anota_ai','goomer','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ped_integration_status AS ENUM ('disabled','pending_approval','sandbox','active','suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ped_queue_status AS ENUM ('pending','processing','done','failed','dead','ignored');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ped_attempt_outcome AS ENUM ('success','transient','permanent','timeout','ignored');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------
-- Integrações
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ped_order_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.ped_units(id) ON DELETE SET NULL,
  channel_id uuid REFERENCES public.ped_order_channels(id) ON DELETE SET NULL,
  provider public.ped_integration_provider NOT NULL,
  status public.ped_integration_status NOT NULL DEFAULT 'disabled',
  display_name text NOT NULL,
  external_merchant_id text,
  secret_name text,
  signature_algo text NOT NULL DEFAULT 'hmac-sha256',
  signature_header text NOT NULL DEFAULT 'x-signature',
  auto_accept boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_by uuid,
  approved_at timestamptz,
  approval_note text,
  last_event_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ped_order_integrations_unique
  ON public.ped_order_integrations (company_id, provider, COALESCE(external_merchant_id, ''));
CREATE INDEX IF NOT EXISTS ped_order_integrations_company_idx
  ON public.ped_order_integrations (company_id, status);

GRANT SELECT ON public.ped_order_integrations TO authenticated;
GRANT ALL ON public.ped_order_integrations TO service_role;
ALTER TABLE public.ped_order_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integrations_read_members" ON public.ped_order_integrations
  FOR SELECT TO authenticated USING (public.ped_can_read_orders(company_id));
CREATE POLICY "integrations_service_all" ON public.ped_order_integrations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------
-- Inbox durável
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ped_event_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid REFERENCES public.ped_order_integrations(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.ped_units(id) ON DELETE SET NULL,
  provider public.ped_integration_provider NOT NULL,
  external_event_id text NOT NULL,
  external_order_id text,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_valid boolean NOT NULL DEFAULT false,
  occurred_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  status public.ped_queue_status NOT NULL DEFAULT 'pending',
  attempts smallint NOT NULL DEFAULT 0,
  max_attempts smallint NOT NULL DEFAULT 8,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  locked_by text,
  processed_at timestamptz,
  order_id uuid REFERENCES public.ped_orders(id) ON DELETE SET NULL,
  result jsonb,
  error_class text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_event_inbox_dedupe UNIQUE (provider, external_event_id)
);

CREATE INDEX IF NOT EXISTS ped_event_inbox_claim_idx
  ON public.ped_event_inbox (status, next_attempt_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS ped_event_inbox_lease_idx
  ON public.ped_event_inbox (lease_until) WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS ped_event_inbox_company_idx
  ON public.ped_event_inbox (company_id, received_at DESC);

GRANT SELECT ON public.ped_event_inbox TO authenticated;
GRANT ALL ON public.ped_event_inbox TO service_role;
ALTER TABLE public.ped_event_inbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inbox_read_members" ON public.ped_event_inbox
  FOR SELECT TO authenticated USING (company_id IS NOT NULL AND public.ped_can_read_orders(company_id));
CREATE POLICY "inbox_service_all" ON public.ped_event_inbox
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------
-- Outbox durável
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ped_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid REFERENCES public.ped_order_integrations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.ped_orders(id) ON DELETE SET NULL,
  provider public.ped_integration_provider NOT NULL,
  operation text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL,
  status public.ped_queue_status NOT NULL DEFAULT 'pending',
  attempts smallint NOT NULL DEFAULT 0,
  max_attempts smallint NOT NULL DEFAULT 8,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  locked_by text,
  sent_at timestamptz,
  external_ref text,
  result jsonb,
  error_class text,
  error_message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_outbox_dedupe UNIQUE (integration_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS ped_outbox_claim_idx
  ON public.ped_outbox (status, next_attempt_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS ped_outbox_company_idx
  ON public.ped_outbox (company_id, created_at DESC);

GRANT SELECT ON public.ped_outbox TO authenticated;
GRANT ALL ON public.ped_outbox TO service_role;
ALTER TABLE public.ped_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "outbox_read_members" ON public.ped_outbox
  FOR SELECT TO authenticated USING (public.ped_can_read_orders(company_id));
CREATE POLICY "outbox_service_all" ON public.ped_outbox
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------
-- Tentativas (métricas / auditoria)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ped_event_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  inbox_id uuid REFERENCES public.ped_event_inbox(id) ON DELETE CASCADE,
  outbox_id uuid REFERENCES public.ped_outbox(id) ON DELETE CASCADE,
  attempt_no smallint NOT NULL DEFAULT 1,
  outcome public.ped_attempt_outcome NOT NULL,
  error_class text,
  error_message text,
  duration_ms integer,
  worker text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_event_attempts_source CHECK (
    (inbox_id IS NOT NULL AND outbox_id IS NULL) OR (inbox_id IS NULL AND outbox_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS ped_event_attempts_inbox_idx ON public.ped_event_attempts (inbox_id, attempt_no);
CREATE INDEX IF NOT EXISTS ped_event_attempts_outbox_idx ON public.ped_event_attempts (outbox_id, attempt_no);

GRANT SELECT ON public.ped_event_attempts TO authenticated;
GRANT ALL ON public.ped_event_attempts TO service_role;
ALTER TABLE public.ped_event_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attempts_read_members" ON public.ped_event_attempts
  FOR SELECT TO authenticated USING (company_id IS NOT NULL AND public.ped_can_read_orders(company_id));
CREATE POLICY "attempts_service_all" ON public.ped_event_attempts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------
-- Dead letters
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ped_dead_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  integration_id uuid REFERENCES public.ped_order_integrations(id) ON DELETE SET NULL,
  provider public.ped_integration_provider NOT NULL,
  source text NOT NULL CHECK (source IN ('inbox','outbox')),
  source_id uuid,
  event_type text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts smallint NOT NULL DEFAULT 0,
  error_class text,
  error_message text,
  replayed_at timestamptz,
  replayed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ped_dead_letters_company_idx ON public.ped_dead_letters (company_id, created_at DESC);

GRANT SELECT ON public.ped_dead_letters TO authenticated;
GRANT ALL ON public.ped_dead_letters TO service_role;
ALTER TABLE public.ped_dead_letters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dead_letters_read_members" ON public.ped_dead_letters
  FOR SELECT TO authenticated USING (company_id IS NOT NULL AND public.ped_can_read_orders(company_id));
CREATE POLICY "dead_letters_service_all" ON public.ped_dead_letters
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------
-- Mapeamento externo ↔ interno
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ped_external_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.ped_order_integrations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider public.ped_integration_provider NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('order','customer','product','option','payment','delivery','unit','menu')),
  external_id text NOT NULL,
  internal_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_external_mappings_unique UNIQUE (integration_id, entity_type, external_id)
);

CREATE INDEX IF NOT EXISTS ped_external_mappings_internal_idx
  ON public.ped_external_mappings (entity_type, internal_id);

GRANT SELECT ON public.ped_external_mappings TO authenticated;
GRANT ALL ON public.ped_external_mappings TO service_role;
ALTER TABLE public.ped_external_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mappings_read_members" ON public.ped_external_mappings
  FOR SELECT TO authenticated USING (public.ped_can_read_orders(company_id));
CREATE POLICY "mappings_service_all" ON public.ped_external_mappings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------
-- updated_at + guarda de aprovação
-- ---------------------------------------------------------
CREATE TRIGGER trg_ped_order_integrations_touch BEFORE UPDATE ON public.ped_order_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ped_event_inbox_touch BEFORE UPDATE ON public.ped_event_inbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ped_outbox_touch BEFORE UPDATE ON public.ped_outbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ped_external_mappings_touch BEFORE UPDATE ON public.ped_external_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.ped_integrations_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_is_admin boolean := auth.uid() IS NULL OR public.is_super_admin(auth.uid());
BEGIN
  -- provedores reais só entram em produção com aprovação da plataforma
  IF NEW.status IN ('active','sandbox') AND NEW.provider <> 'sandbox' AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Integração com % exige aprovação e homologação da plataforma.', NEW.provider
      USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'active' AND NEW.provider <> 'sandbox' AND NEW.approved_at IS NULL THEN
    RAISE EXCEPTION 'Integração sem aprovação registrada não pode ser ativada.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_ped_integrations_guard BEFORE INSERT OR UPDATE ON public.ped_order_integrations
  FOR EACH ROW EXECUTE FUNCTION public.ped_integrations_guard();