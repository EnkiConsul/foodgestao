CREATE TYPE public.billing_account_type AS ENUM ('empresa','grupo');
CREATE TYPE public.subscription_grant_type AS ENUM ('cortesia_total','desconto_percentual','carencia');
CREATE TYPE public.subscription_grant_reason AS ENUM ('base_anterior','parceria','piloto','compensacao','comercial','outro');

CREATE TABLE public.billing_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo public.billing_account_type NOT NULL,
  nome text NOT NULL,
  titular_user_id uuid NOT NULL,
  documento_pagador text,
  email_cobranca text,
  asaas_customer_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.billing_accounts(titular_user_id);
GRANT SELECT ON public.billing_accounts TO authenticated;
GRANT ALL ON public.billing_accounts TO service_role;
ALTER TABLE public.billing_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.billing_account_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_account_id uuid NOT NULL REFERENCES public.billing_accounts(id),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  added_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);
CREATE UNIQUE INDEX billing_account_companies_one_active ON public.billing_account_companies(company_id) WHERE removed_at IS NULL;
CREATE INDEX ON public.billing_account_companies(billing_account_id);
GRANT SELECT ON public.billing_account_companies TO authenticated;
GRANT ALL ON public.billing_account_companies TO service_role;
ALTER TABLE public.billing_account_companies ENABLE ROW LEVEL SECURITY;

-- conta 'empresa' com no máximo 1 empresa ativa
CREATE OR REPLACE FUNCTION public.billing_account_companies_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.removed_at IS NULL AND (SELECT tipo FROM billing_accounts WHERE id = NEW.billing_account_id) = 'empresa'
     AND EXISTS (SELECT 1 FROM billing_account_companies WHERE billing_account_id = NEW.billing_account_id
                 AND removed_at IS NULL AND id <> NEW.id) THEN
    RAISE EXCEPTION 'Conta de cobrança do tipo empresa aceita apenas uma empresa ativa.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_billing_account_companies_guard BEFORE INSERT OR UPDATE ON public.billing_account_companies
FOR EACH ROW EXECUTE FUNCTION public.billing_account_companies_guard();

-- acesso de leitura: titular, dono/admin de empresa ativa da conta, super admin
CREATE OR REPLACE FUNCTION public.billing_account_can_read(_account_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM billing_accounts a WHERE a.id = _account_id AND a.titular_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM billing_account_companies bac
               JOIN companies c ON c.id = bac.company_id
               LEFT JOIN company_members m ON m.company_id = c.id AND m.user_id = auth.uid()
               WHERE bac.billing_account_id = _account_id AND bac.removed_at IS NULL
                 AND (c.user_id = auth.uid() OR m.role IN ('owner','admin')))
$$;
REVOKE ALL ON FUNCTION public.billing_account_can_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_account_can_read(uuid) TO authenticated, service_role;

CREATE POLICY "Leitura da conta de cobrança" ON public.billing_accounts FOR SELECT TO authenticated
  USING (public.billing_account_can_read(id));
CREATE POLICY "Leitura das empresas da conta" ON public.billing_account_companies FOR SELECT TO authenticated
  USING (public.billing_account_can_read(billing_account_id));

CREATE TABLE public.plan_volume_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.plans(id),
  min_quantity integer NOT NULL CHECK (min_quantity >= 1),
  max_quantity integer CHECK (max_quantity IS NULL OR max_quantity >= min_quantity),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plan_volume_tiers TO authenticated;
GRANT ALL ON public.plan_volume_tiers TO service_role;
ALTER TABLE public.plan_volume_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Faixas de volume visíveis" ON public.plan_volume_tiers FOR SELECT TO authenticated USING (true);

ALTER TABLE public.subscriptions
  ADD COLUMN billing_account_id uuid REFERENCES public.billing_accounts(id),
  ADD COLUMN quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN unit_price_cents integer;
COMMENT ON COLUMN public.subscriptions.user_id IS 'LEGADO (modelo v1) — manter até validação do modelo v2';
COMMENT ON COLUMN public.subscriptions.is_exempt IS 'LEGADO (modelo v1) — substituído por subscription_grants';
COMMENT ON COLUMN public.subscriptions.exempt_until IS 'LEGADO (modelo v1) — substituído por subscription_grants';
COMMENT ON COLUMN public.subscriptions.exempt_reason IS 'LEGADO (modelo v1) — substituído por subscription_grants';
CREATE INDEX ON public.subscriptions(billing_account_id);
-- 1 assinatura não encerrada por (conta, módulo): validada após o backfill
CREATE OR REPLACE FUNCTION public.subscriptions_v2_unique_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.billing_account_id IS NOT NULL AND NEW.status::text NOT IN ('canceled','expired')
     AND EXISTS (SELECT 1 FROM subscriptions s WHERE s.billing_account_id = NEW.billing_account_id
                 AND COALESCE(s.module,'') = COALESCE(NEW.module,'') AND s.id <> NEW.id
                 AND s.status::text NOT IN ('canceled','expired'))
     AND current_setting('app.billing_v2_backfill', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Já existe assinatura ativa deste módulo para a conta de cobrança.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_subscriptions_v2_unique BEFORE INSERT OR UPDATE OF billing_account_id, module, status ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.subscriptions_v2_unique_guard();

CREATE TABLE public.subscription_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id),
  tipo public.subscription_grant_type NOT NULL,
  percentual numeric(5,2) CHECK (percentual IS NULL OR (percentual > 0 AND percentual <= 100)),
  motivo_codigo public.subscription_grant_reason NOT NULL,
  motivo_texto text,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text,
  CONSTRAINT grant_ends_required CHECK (ends_at IS NOT NULL OR motivo_codigo = 'base_anterior'),
  CONSTRAINT grant_percentual_required CHECK (tipo <> 'desconto_percentual' OR percentual IS NOT NULL)
);
CREATE INDEX ON public.subscription_grants(subscription_id);
GRANT SELECT ON public.subscription_grants TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.subscription_grants TO service_role;
ALTER TABLE public.subscription_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura das concessões" ON public.subscription_grants FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM subscriptions s WHERE s.id = subscription_id
         AND (public.is_super_admin(auth.uid()) OR (s.billing_account_id IS NOT NULL AND public.billing_account_can_read(s.billing_account_id)))));

CREATE TABLE public.subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id),
  tipo_evento text NOT NULL,
  status_anterior text,
  status_novo text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.subscription_events(subscription_id, created_at);
GRANT SELECT ON public.subscription_events TO authenticated;
GRANT SELECT, INSERT ON public.subscription_events TO service_role;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura do histórico" ON public.subscription_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM subscriptions s WHERE s.id = subscription_id
         AND (public.is_super_admin(auth.uid()) OR (s.billing_account_id IS NOT NULL AND public.billing_account_can_read(s.billing_account_id)))));

-- imutabilidade: grants nunca apagados; eventos só INSERT
CREATE OR REPLACE FUNCTION public.billing_v2_block_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Registro de histórico de cobrança não pode ser % .', lower(TG_OP);
END $$;
CREATE TRIGGER trg_grants_no_delete BEFORE DELETE ON public.subscription_grants FOR EACH ROW EXECUTE FUNCTION public.billing_v2_block_change();
CREATE TRIGGER trg_events_immutable BEFORE UPDATE OR DELETE ON public.subscription_events FOR EACH ROW EXECUTE FUNCTION public.billing_v2_block_change();

-- toda mudança de status/concessão gera evento
CREATE OR REPLACE FUNCTION public.subscription_status_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO subscription_events(subscription_id, tipo_evento, status_anterior, status_novo, actor_id)
    VALUES (NEW.id, 'status_alterado', OLD.status::text, NEW.status::text, auth.uid());
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_subscription_status_event AFTER UPDATE OF status ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.subscription_status_event();

CREATE OR REPLACE FUNCTION public.subscription_grant_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO subscription_events(subscription_id, tipo_evento, payload, actor_id)
    VALUES (NEW.subscription_id, 'concessao_criada', to_jsonb(NEW), COALESCE(NEW.granted_by, auth.uid()));
  ELSIF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
    INSERT INTO subscription_events(subscription_id, tipo_evento, payload, actor_id)
    VALUES (NEW.subscription_id, 'concessao_revogada', to_jsonb(NEW), COALESCE(NEW.revoked_by, auth.uid()));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_subscription_grant_event AFTER INSERT OR UPDATE ON public.subscription_grants
FOR EACH ROW EXECUTE FUNCTION public.subscription_grant_event();

ALTER TABLE public.invoices ADD COLUMN billing_account_id uuid REFERENCES public.billing_accounts(id);
CREATE INDEX ON public.invoices(billing_account_id);

CREATE TABLE public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id),
  subscription_id uuid REFERENCES public.subscriptions(id),
  module text,
  quantity integer NOT NULL DEFAULT 1,
  unit_price_cents integer NOT NULL DEFAULT 0,
  desconto_cents integer NOT NULL DEFAULT 0,
  total_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.invoice_items(invoice_id);
GRANT SELECT ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura dos itens da fatura" ON public.invoice_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_id
         AND (public.is_super_admin(auth.uid()) OR i.user_id = auth.uid()
              OR (i.billing_account_id IS NOT NULL AND public.billing_account_can_read(i.billing_account_id)))));

CREATE TRIGGER trg_billing_accounts_updated BEFORE UPDATE ON public.billing_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

REVOKE ALL ON FUNCTION public.billing_account_companies_guard(), public.subscriptions_v2_unique_guard(),
  public.billing_v2_block_change(), public.subscription_status_event(), public.subscription_grant_event() FROM PUBLIC, anon, authenticated;