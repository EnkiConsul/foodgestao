
-- 1. Enums: novos valores
ALTER TYPE public.app_module ADD VALUE IF NOT EXISTS 'bi';
ALTER TYPE public.app_module ADD VALUE IF NOT EXISTS 'financeiro_pessoal';
ALTER TYPE public.module_status ADD VALUE IF NOT EXISTS 'trial_expirado';

-- 2. Tabela segmentos (food service)
CREATE TABLE IF NOT EXISTS public.segmentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  slug text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.segmentos TO anon, authenticated;
GRANT ALL ON public.segmentos TO service_role;
ALTER TABLE public.segmentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "segmentos_select_all" ON public.segmentos FOR SELECT USING (true);

INSERT INTO public.segmentos (nome, slug, ordem) VALUES
  ('Restaurante', 'restaurante', 1),
  ('Bar', 'bar', 2),
  ('Lanchonete', 'lanchonete', 3),
  ('Cafeteria', 'cafeteria', 4),
  ('Pizzaria', 'pizzaria', 5),
  ('Hamburgueria', 'hamburgueria', 6),
  ('Conveniência', 'conveniencia', 7),
  ('Delivery / Dark Kitchen', 'delivery', 8),
  ('Padaria', 'padaria', 9),
  ('Buffet / Casa de Eventos', 'buffet', 10),
  ('Food Truck', 'food-truck', 11),
  ('Sorveteria / Açaiteria', 'sorveteria', 12),
  ('Outro', 'outro', 99)
ON CONFLICT (slug) DO NOTHING;

-- 3. Tabela catálogo de módulos
CREATE TABLE IF NOT EXISTS public.modulos_catalogo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nome text NOT NULL,
  descricao_curta text NOT NULL,
  icone text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.modulos_catalogo TO anon, authenticated;
GRANT ALL ON public.modulos_catalogo TO service_role;
ALTER TABLE public.modulos_catalogo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "modulos_catalogo_select_all" ON public.modulos_catalogo FOR SELECT USING (true);

INSERT INTO public.modulos_catalogo (slug, nome, descricao_curta, icone, ordem) VALUES
  ('financeiro', 'Financeiro 360°', 'Contas a pagar/receber, DRE, fluxo de caixa e conciliação bancária.', 'DollarSign', 1),
  ('dp', 'DP 360°', 'Admissões, folha de pagamento, férias, encargos e obrigações trabalhistas.', 'FileCheck2', 2),
  ('crm', 'CRM 360°', 'Relacionamento com clientes, campanhas e fidelização.', 'MessageCircleHeart', 3),
  ('pedidos', 'Pedidos 360°', 'Gestão de pedidos, comandas, delivery e integração com PDV.', 'ShoppingCart', 4),
  ('rh', 'RH 360°', 'Recrutamento, avaliação de desempenho e gestão de pessoas.', 'UserCog', 5),
  ('bi', 'BI 360°', 'Dashboards, indicadores gerenciais e inteligência de dados.', 'BarChart3', 6),
  ('financeiro_pessoal', 'Financeiro Pessoal', 'Sub-módulo do Financeiro para as finanças pessoais do proprietário.', 'Wallet', 7)
ON CONFLICT (slug) DO NOTHING;

-- 4. Colunas novas em companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS segmento_id uuid REFERENCES public.segmentos(id),
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS logradouro text,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS complemento text,
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS uf char(2),
  ADD COLUMN IF NOT EXISTS trial_iniciado_em timestamptz,
  ADD COLUMN IF NOT EXISTS trial_termina_em timestamptz,
  ADD COLUMN IF NOT EXISTS status_tenant text NOT NULL DEFAULT 'trial'
    CHECK (status_tenant IN ('trial','ativa','trial_expirado','suspensa','cancelada'));

CREATE UNIQUE INDEX IF NOT EXISTS uniq_companies_cnpj_pj
  ON public.companies (cnpj)
  WHERE profile_type = 'empresarial' AND cnpj IS NOT NULL;

-- 5. Colunas novas em company_modules
ALTER TABLE public.company_modules
  ADD COLUMN IF NOT EXISTS trial_iniciado_em timestamptz,
  ADD COLUMN IF NOT EXISTS trial_termina_em timestamptz,
  ADD COLUMN IF NOT EXISTS contratado_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_em timestamptz,
  ADD COLUMN IF NOT EXISTS valor_mensal numeric(10,2);

-- 6. RPC atômica de onboarding
CREATE OR REPLACE FUNCTION public.fn_cadastrar_empresa_onboarding(
  p_nome_completo    text,
  p_email_cliente    text,
  p_telefone_cliente text,
  p_whatsapp_cliente text,
  p_cnpj             text,
  p_razao_social     text,
  p_nome_fantasia    text,
  p_segmento_id      uuid,
  p_cep              text,
  p_logradouro       text,
  p_numero           text,
  p_complemento      text,
  p_bairro           text,
  p_cidade           text,
  p_uf               text,
  p_telefone_empresa text,
  p_whatsapp_empresa text,
  p_email_empresa    text,
  p_modulos_slugs    text[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_trial_fim timestamptz := now() + interval '14 days';
  v_slug text;
  v_cnpj_digits text := regexp_replace(coalesce(p_cnpj,''), '\D', '', 'g');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'usuario_nao_autenticado';
  END IF;

  IF p_modulos_slugs IS NULL OR array_length(p_modulos_slugs, 1) IS NULL OR array_length(p_modulos_slugs, 1) = 0 THEN
    RAISE EXCEPTION 'nenhum_modulo_selecionado';
  END IF;

  IF length(v_cnpj_digits) <> 14 THEN
    RAISE EXCEPTION 'cnpj_invalido';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.companies
    WHERE cnpj = v_cnpj_digits AND profile_type = 'empresarial'
  ) THEN
    RAISE EXCEPTION 'empresa_ja_cadastrada';
  END IF;

  -- Upsert do perfil do responsável
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (v_uid, p_nome_completo, p_telefone_cliente)
  ON CONFLICT (id) DO UPDATE
    SET full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
        updated_at = now();

  -- Cria a empresa (PJ) em modo trial
  INSERT INTO public.companies (
    user_id, profile_type, name, trade_name, cnpj, email, phone, whatsapp,
    segmento_id, cep, logradouro, numero, complemento, bairro, cidade, uf,
    is_active, status_tenant, trial_iniciado_em, trial_termina_em
  ) VALUES (
    v_uid, 'empresarial', p_razao_social, p_nome_fantasia, v_cnpj_digits,
    p_email_empresa, p_telefone_empresa, p_whatsapp_empresa,
    p_segmento_id, p_cep, p_logradouro, p_numero, p_complemento, p_bairro, p_cidade, upper(p_uf),
    true, 'trial', now(), v_trial_fim
  )
  RETURNING id INTO v_company_id;

  -- Vincula o usuário como owner
  INSERT INTO public.company_members (company_id, user_id, role, permissions)
  VALUES (v_company_id, v_uid, 'owner', '{}'::jsonb);

  -- Ativa módulos selecionados em trial
  FOREACH v_slug IN ARRAY p_modulos_slugs LOOP
    INSERT INTO public.company_modules (
      company_id, module, status, starts_at, ends_at,
      trial_iniciado_em, trial_termina_em
    ) VALUES (
      v_company_id, v_slug::public.app_module, 'trial'::public.module_status,
      now(), v_trial_fim, now(), v_trial_fim
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object(
    'company_id', v_company_id,
    'trial_termina_em', v_trial_fim
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_cadastrar_empresa_onboarding(
  text,text,text,text,text,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text[]
) TO authenticated;
