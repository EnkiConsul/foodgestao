
CREATE TABLE IF NOT EXISTS public.categorization_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('system', 'company', 'user')),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  context TEXT CHECK (context IN ('pf', 'pj')),
  match_type TEXT NOT NULL DEFAULT 'contains' CHECK (match_type IN ('exact', 'contains', 'regex')),
  pattern TEXT NOT NULL CHECK (length(btrim(pattern)) > 0),
  transaction_type TEXT CHECK (transaction_type IN ('receita', 'despesa')),
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  payment_method_id UUID REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  priority INT NOT NULL DEFAULT 100,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 1.00 CHECK (confidence >= 0 AND confidence <= 1),
  source TEXT NOT NULL DEFAULT 'user_manual'
    CHECK (source IN ('seed', 'user_manual', 'user_confirmed', 'ai_inferred')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  hit_count INT NOT NULL DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT scope_ownership CHECK (
    (scope = 'system'  AND user_id IS NULL AND company_id IS NULL) OR
    (scope = 'user'    AND user_id IS NOT NULL AND company_id IS NULL) OR
    (scope = 'company' AND company_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_catrules_scope        ON public.categorization_rules (scope);
CREATE INDEX IF NOT EXISTS idx_catrules_user         ON public.categorization_rules (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_catrules_company      ON public.categorization_rules (company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_catrules_active       ON public.categorization_rules (is_active, priority DESC);
CREATE INDEX IF NOT EXISTS idx_catrules_pattern_trgm ON public.categorization_rules USING gin (pattern gin_trgm_ops);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_catrules_system
  ON public.categorization_rules (pattern, match_type, coalesce(transaction_type, ''))
  WHERE scope = 'system';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_catrules_user
  ON public.categorization_rules (user_id, pattern, match_type, coalesce(transaction_type, ''), coalesce(context, ''))
  WHERE scope = 'user';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_catrules_company
  ON public.categorization_rules (company_id, pattern, match_type, coalesce(transaction_type, ''))
  WHERE scope = 'company';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categorization_rules TO authenticated;
GRANT ALL ON public.categorization_rules TO service_role;

ALTER TABLE public.categorization_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read system rules"
  ON public.categorization_rules FOR SELECT TO authenticated
  USING (scope = 'system');

CREATE POLICY "read own user rules"
  ON public.categorization_rules FOR SELECT TO authenticated
  USING (scope = 'user' AND user_id = auth.uid());

CREATE POLICY "read company rules as member"
  ON public.categorization_rules FOR SELECT TO authenticated
  USING (
    scope = 'company'
    AND company_id IS NOT NULL
    AND (
      EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = categorization_rules.company_id AND m.user_id = auth.uid())
    )
  );

CREATE POLICY "super admin read all rules"
  ON public.categorization_rules FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "manage own user rules"
  ON public.categorization_rules FOR ALL TO authenticated
  USING (scope = 'user' AND user_id = auth.uid())
  WITH CHECK (scope = 'user' AND user_id = auth.uid());

CREATE POLICY "manage company rules as admin"
  ON public.categorization_rules FOR ALL TO authenticated
  USING (
    scope = 'company'
    AND EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = categorization_rules.company_id
        AND (
          c.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.company_members m
            WHERE m.company_id = c.id AND m.user_id = auth.uid() AND m.role IN ('admin', 'owner')
          )
        )
    )
  )
  WITH CHECK (
    scope = 'company'
    AND EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = categorization_rules.company_id
        AND (
          c.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.company_members m
            WHERE m.company_id = c.id AND m.user_id = auth.uid() AND m.role IN ('admin', 'owner')
          )
        )
    )
  );

CREATE POLICY "manage system rules as super admin"
  ON public.categorization_rules FOR ALL TO authenticated
  USING (scope = 'system' AND public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (scope = 'system' AND public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_catrules_updated
  BEFORE UPDATE ON public.categorization_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$
DECLARE
  cat_alimentacao   UUID;
  cat_transporte    UUID;
  cat_lazer         UUID;
  cat_saude         UUID;
  cat_marketing     UUID;
  cat_impostos      UUID;
  cat_servicos      UUID;
  cat_vendas        UUID;
BEGIN
  SELECT id INTO cat_alimentacao FROM public.categories WHERE upper(name) = 'ALIMENTAÇÃO' AND transaction_type = 'despesa' ORDER BY created_at LIMIT 1;
  SELECT id INTO cat_transporte  FROM public.categories WHERE upper(name) = 'TRANSPORTE'  AND transaction_type = 'despesa' ORDER BY created_at LIMIT 1;
  SELECT id INTO cat_lazer       FROM public.categories WHERE upper(name) = 'LAZER'       AND transaction_type = 'despesa' ORDER BY created_at LIMIT 1;
  SELECT id INTO cat_saude       FROM public.categories WHERE upper(name) = 'SAÚDE'       AND transaction_type = 'despesa' ORDER BY created_at LIMIT 1;
  SELECT id INTO cat_marketing   FROM public.categories WHERE upper(name) = 'MARKETING'   AND transaction_type = 'despesa' ORDER BY created_at LIMIT 1;
  SELECT id INTO cat_impostos    FROM public.categories WHERE upper(name) = 'IMPOSTOS'    AND transaction_type = 'despesa' ORDER BY created_at LIMIT 1;
  SELECT id INTO cat_servicos    FROM public.categories WHERE upper(name) = 'SERVIÇOS'    AND transaction_type = 'despesa' ORDER BY created_at LIMIT 1;
  SELECT id INTO cat_vendas      FROM public.categories WHERE upper(name) = 'VENDAS' ORDER BY created_at LIMIT 1;

  IF cat_alimentacao IS NOT NULL THEN
    INSERT INTO public.categorization_rules (scope, pattern, match_type, transaction_type, category_id, priority, source) VALUES
      ('system','IFOOD','contains','despesa',cat_alimentacao,200,'seed'),
      ('system','RAPPI','contains','despesa',cat_alimentacao,200,'seed'),
      ('system','AIQFOME','contains','despesa',cat_alimentacao,200,'seed'),
      ('system','ZE DELIVERY','contains','despesa',cat_alimentacao,200,'seed'),
      ('system','AMBEV','contains','despesa',cat_alimentacao,190,'seed'),
      ('system','ATACADAO','contains','despesa',cat_alimentacao,180,'seed'),
      ('system','ASSAI','contains','despesa',cat_alimentacao,180,'seed'),
      ('system','CARREFOUR','contains','despesa',cat_alimentacao,180,'seed'),
      ('system','PAO DE ACUCAR','contains','despesa',cat_alimentacao,180,'seed')
    ON CONFLICT DO NOTHING;
  END IF;

  IF cat_transporte IS NOT NULL THEN
    INSERT INTO public.categorization_rules (scope, pattern, match_type, transaction_type, category_id, priority, source) VALUES
      ('system','UBER','contains','despesa',cat_transporte,200,'seed'),
      ('system','99APP','contains','despesa',cat_transporte,200,'seed'),
      ('system','99 TAXI','contains','despesa',cat_transporte,200,'seed'),
      ('system','SHELL','contains','despesa',cat_transporte,180,'seed'),
      ('system','IPIRANGA','contains','despesa',cat_transporte,180,'seed'),
      ('system','PETROBRAS','contains','despesa',cat_transporte,180,'seed'),
      ('system','AUTO POSTO','contains','despesa',cat_transporte,170,'seed')
    ON CONFLICT DO NOTHING;
  END IF;

  IF cat_lazer IS NOT NULL THEN
    INSERT INTO public.categorization_rules (scope, pattern, match_type, transaction_type, category_id, priority, source) VALUES
      ('system','NETFLIX','contains','despesa',cat_lazer,200,'seed'),
      ('system','SPOTIFY','contains','despesa',cat_lazer,200,'seed'),
      ('system','DISNEY','contains','despesa',cat_lazer,190,'seed'),
      ('system','AMAZON PRIME','contains','despesa',cat_lazer,190,'seed'),
      ('system','HBO','contains','despesa',cat_lazer,180,'seed'),
      ('system','STEAM','contains','despesa',cat_lazer,180,'seed')
    ON CONFLICT DO NOTHING;
  END IF;

  IF cat_saude IS NOT NULL THEN
    INSERT INTO public.categorization_rules (scope, pattern, match_type, transaction_type, category_id, priority, source) VALUES
      ('system','DROGARIA','contains','despesa',cat_saude,180,'seed'),
      ('system','DROGA RAIA','contains','despesa',cat_saude,200,'seed'),
      ('system','DROGASIL','contains','despesa',cat_saude,200,'seed'),
      ('system','FARMACIA','contains','despesa',cat_saude,170,'seed'),
      ('system','PAGUE MENOS','contains','despesa',cat_saude,190,'seed'),
      ('system','UNIMED','contains','despesa',cat_saude,200,'seed'),
      ('system','HAPVIDA','contains','despesa',cat_saude,200,'seed'),
      ('system','AMIL','contains','despesa',cat_saude,200,'seed')
    ON CONFLICT DO NOTHING;
  END IF;

  IF cat_servicos IS NOT NULL THEN
    INSERT INTO public.categorization_rules (scope, pattern, match_type, transaction_type, category_id, priority, source) VALUES
      ('system','ENEL','contains','despesa',cat_servicos,200,'seed'),
      ('system','CEMIG','contains','despesa',cat_servicos,200,'seed'),
      ('system','COPEL','contains','despesa',cat_servicos,200,'seed'),
      ('system','CPFL','contains','despesa',cat_servicos,200,'seed'),
      ('system','LIGHT','contains','despesa',cat_servicos,190,'seed'),
      ('system','SABESP','contains','despesa',cat_servicos,200,'seed'),
      ('system','SANEAGO','contains','despesa',cat_servicos,200,'seed'),
      ('system','COMGAS','contains','despesa',cat_servicos,190,'seed'),
      ('system','VIVO','contains','despesa',cat_servicos,180,'seed'),
      ('system','CLARO','contains','despesa',cat_servicos,180,'seed'),
      ('system','TIM','contains','despesa',cat_servicos,170,'seed')
    ON CONFLICT DO NOTHING;
  END IF;

  IF cat_impostos IS NOT NULL THEN
    INSERT INTO public.categorization_rules (scope, pattern, match_type, transaction_type, category_id, priority, source) VALUES
      ('system','DAS SIMPLES','contains','despesa',cat_impostos,220,'seed'),
      ('system','DARF','contains','despesa',cat_impostos,220,'seed'),
      ('system','GPS INSS','contains','despesa',cat_impostos,220,'seed'),
      ('system','FGTS','contains','despesa',cat_impostos,210,'seed'),
      ('system','ISS','exact','despesa',cat_impostos,200,'seed'),
      ('system','IPTU','contains','despesa',cat_impostos,200,'seed'),
      ('system','IPVA','contains','despesa',cat_impostos,200,'seed')
    ON CONFLICT DO NOTHING;
  END IF;

  IF cat_marketing IS NOT NULL THEN
    INSERT INTO public.categorization_rules (scope, pattern, match_type, transaction_type, category_id, priority, source) VALUES
      ('system','META PLATFORMS','contains','despesa',cat_marketing,200,'seed'),
      ('system','FACEBK','contains','despesa',cat_marketing,200,'seed'),
      ('system','GOOGLE ADS','contains','despesa',cat_marketing,200,'seed'),
      ('system','INSTAGRAM','contains','despesa',cat_marketing,180,'seed'),
      ('system','TIKTOK ADS','contains','despesa',cat_marketing,200,'seed')
    ON CONFLICT DO NOTHING;
  END IF;

  IF cat_vendas IS NOT NULL THEN
    INSERT INTO public.categorization_rules (scope, pattern, match_type, transaction_type, category_id, priority, source) VALUES
      ('system','STONE PAGAMENTOS','contains','receita',cat_vendas,200,'seed'),
      ('system','CIELO','contains','receita',cat_vendas,200,'seed'),
      ('system','REDE ITAU','contains','receita',cat_vendas,200,'seed'),
      ('system','PAGSEGURO','contains','receita',cat_vendas,200,'seed'),
      ('system','MERCADO PAGO','contains','receita',cat_vendas,200,'seed'),
      ('system','GETNET','contains','receita',cat_vendas,200,'seed'),
      ('system','SUMUP','contains','receita',cat_vendas,200,'seed')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
