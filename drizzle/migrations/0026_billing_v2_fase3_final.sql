
CREATE TABLE public.billing_v2_cobrancas_pendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  origem text NOT NULL CHECK (origem IN ('prorata','excedente')),
  referencia text NOT NULL,
  descricao text NOT NULL,
  valor_cents integer NOT NULL CHECK (valor_cents > 0),
  detalhe jsonb NOT NULL DEFAULT '{}'::jsonb,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  cobrado_em timestamptz,
  asaas_env text NOT NULL DEFAULT 'production',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, origem, referencia)
);
GRANT ALL ON public.billing_v2_cobrancas_pendentes TO service_role;
GRANT SELECT ON public.billing_v2_cobrancas_pendentes TO authenticated;
ALTER TABLE public.billing_v2_cobrancas_pendentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin lê pendentes" ON public.billing_v2_cobrancas_pendentes FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

CREATE TABLE public.billing_v2_excedentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  competencia date NOT NULL,
  contados integer NOT NULL,
  limite integer NOT NULL,
  excedente integer NOT NULL,
  valor_unit_cents integer NOT NULL,
  valor_cents integer NOT NULL,
  forma text NOT NULL CHECK (forma IN ('proxima_fatura','avulsa','nenhuma','cortesia')),
  external_payment_id text,
  detalhe jsonb NOT NULL DEFAULT '{}'::jsonb,
  asaas_env text NOT NULL DEFAULT 'production',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, competencia)
);
GRANT ALL ON public.billing_v2_excedentes TO service_role;
GRANT SELECT ON public.billing_v2_excedentes TO authenticated;
ALTER TABLE public.billing_v2_excedentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin lê excedentes" ON public.billing_v2_excedentes FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

CREATE TABLE public.billing_v2_nfse_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL UNIQUE REFERENCES public.invoices(id) ON DELETE CASCADE,
  external_payment_id text,
  tomador_documento text,
  valor_cents integer NOT NULL,
  status text NOT NULL,
  asaas_invoice_id text,
  resposta jsonb,
  asaas_env text NOT NULL DEFAULT 'production',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.billing_v2_nfse_solicitacoes TO service_role;
GRANT SELECT ON public.billing_v2_nfse_solicitacoes TO authenticated;
ALTER TABLE public.billing_v2_nfse_solicitacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin lê nfse" ON public.billing_v2_nfse_solicitacoes FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

CREATE TABLE public.billing_v2_conciliacao_divergencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execucao_id uuid NOT NULL,
  tipo text NOT NULL,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
  external_id text,
  local jsonb,
  asaas jsonb,
  asaas_env text NOT NULL DEFAULT 'production',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.billing_v2_conciliacao_divergencias TO service_role;
GRANT SELECT ON public.billing_v2_conciliacao_divergencias TO authenticated;
ALTER TABLE public.billing_v2_conciliacao_divergencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin lê conciliação" ON public.billing_v2_conciliacao_divergencias FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

ALTER TABLE public.billing_accounts ADD COLUMN IF NOT EXISTS emitir_nfse boolean;
COMMENT ON COLUMN public.billing_accounts.emitir_nfse IS 'NULL segue o parâmetro global emitir_nfse; true/false é exceção da conta';

CREATE TABLE public.billing_account_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_account_id uuid NOT NULL REFERENCES public.billing_accounts(id) ON DELETE CASCADE,
  tipo_evento text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.billing_account_events TO service_role;
GRANT SELECT ON public.billing_account_events TO authenticated;
ALTER TABLE public.billing_account_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin lê eventos conta" ON public.billing_account_events FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

INSERT INTO public.system_parameters(key, value, description)
VALUES ('emitir_nfse', '"desligado"'::jsonb, 'NFS-e pelo Asaas: desligado | ligado (só super admin)')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.billing_v2_set_emitir_nfse(_valor text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Somente super admin.' USING ERRCODE='42501'; END IF;
  IF _valor NOT IN ('desligado','ligado') THEN RAISE EXCEPTION 'Valor inválido.'; END IF;
  UPDATE system_parameters SET value = to_jsonb(_valor), updated_by = auth.uid(), updated_at = now() WHERE key = 'emitir_nfse';
  RETURN _valor;
END $$;
REVOKE ALL ON FUNCTION public.billing_v2_set_emitir_nfse(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_v2_set_emitir_nfse(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.billing_v2_colaboradores_competencia(_sub uuid, _competencia date)
RETURNS TABLE(contados integer, regulares integer, variaveis_contados integer, variaveis_fora integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ini AS (SELECT date_trunc('month', _competencia)::date AS i, (date_trunc('month', _competencia) + interval '1 month')::date AS f),
  c AS (
    SELECT c.id, c.regime::text IN ('intermitente','freelancer') AS variavel,
      (EXISTS (SELECT 1 FROM dp_convocacoes cv, ini WHERE cv.colaborador_id = c.id AND cv.status::text = 'aceita' AND cv.data >= ini.i AND cv.data < ini.f)
       OR EXISTS (SELECT 1 FROM dp_escala_itens e, ini WHERE e.colaborador_id = c.id AND e.data >= ini.i AND e.data < ini.f)) AS atuou
    FROM dp_colaboradores c JOIN subscription_companies sc ON sc.company_id = c.company_id AND sc.subscription_id = _sub AND sc.removed_at IS NULL
    WHERE c.ativo AND c.deleted_at IS NULL AND c.data_desligamento IS NULL
  )
  SELECT count(*) FILTER (WHERE NOT variavel OR atuou)::int, count(*) FILTER (WHERE NOT variavel)::int,
         count(*) FILTER (WHERE variavel AND atuou)::int, count(*) FILTER (WHERE variavel AND NOT atuou)::int FROM c;
$$;
REVOKE ALL ON FUNCTION public.billing_v2_colaboradores_competencia(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_v2_colaboradores_competencia(uuid, date) TO service_role;

CREATE OR REPLACE FUNCTION public.billing_v2_cobrancas_assinatura(_subscription_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._billing_v2_can_manage_sub(_subscription_id) AND NOT EXISTS (
    SELECT 1 FROM subscriptions s WHERE s.id = _subscription_id AND public.assinatura_pode_gerir(s.company_id, 'consulta')) THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object(
    'pendentes', coalesce((SELECT jsonb_agg(jsonb_build_object('origem', origem, 'descricao', descricao, 'valor_cents', valor_cents,
        'cobrado_em', cobrado_em, 'detalhe', detalhe) ORDER BY created_at DESC)
      FROM billing_v2_cobrancas_pendentes WHERE subscription_id = _subscription_id AND (cobrado_em IS NULL OR cobrado_em > now() - interval '60 days')), '[]'::jsonb),
    'excedentes', coalesce((SELECT jsonb_agg(jsonb_build_object('competencia', competencia, 'contados', contados, 'limite', limite,
        'excedente', excedente, 'valor_cents', valor_cents, 'forma', forma, 'detalhe', detalhe) ORDER BY competencia DESC)
      FROM (SELECT * FROM billing_v2_excedentes WHERE subscription_id = _subscription_id ORDER BY competencia DESC LIMIT 12) x), '[]'::jsonb)
  );
END $$;
REVOKE ALL ON FUNCTION public.billing_v2_cobrancas_assinatura(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_v2_cobrancas_assinatura(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.billing_v2_empresas_gerenciaveis()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nome', coalesce(c.name, c.trade_name),
     'billing_account_id', bc.billing_account_id, 'conta_tipo', ba.tipo,
     'modulos_assinados', coalesce((SELECT jsonb_agg(DISTINCT s.module) FROM subscriptions s WHERE s.billing_account_id = bc.billing_account_id
        AND s.status::text IN ('active','trialing','past_due','pending','grace')), '[]'::jsonb)) ORDER BY c.name), '[]'::jsonb)
  FROM companies c
  LEFT JOIN billing_account_companies bc ON bc.company_id = c.id AND bc.removed_at IS NULL
  LEFT JOIN billing_accounts ba ON ba.id = bc.billing_account_id
  WHERE (c.user_id = auth.uid() OR EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id
     AND m.user_id = auth.uid() AND m.role::text IN ('owner','admin') AND m.situacao = 'ativo'));
$$;
REVOKE ALL ON FUNCTION public.billing_v2_empresas_gerenciaveis() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_v2_empresas_gerenciaveis() TO authenticated;
