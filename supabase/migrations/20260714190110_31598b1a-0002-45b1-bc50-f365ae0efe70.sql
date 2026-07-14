
-- Fase 11: Folha & Integração Financeiro
CREATE TYPE public.dp_folha_tipo AS ENUM (
  'adiantamento','contracheque_mensal','contracheque_quinzenal','decimo_terceiro','ferias','vale_alimentacao','vale_transporte'
);

CREATE TYPE public.dp_folha_periodo_status AS ENUM (
  'aberto','fechado','aprovado_dp','aprovado_financeiro','pago'
);

CREATE TYPE public.dp_folha_lancamento_status AS ENUM (
  'rascunho','aprovado_dp','aprovado_financeiro','pago','cancelado'
);

CREATE TABLE public.dp_folha_periodos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  competencia date NOT NULL,
  tipo public.dp_folha_tipo NOT NULL,
  status public.dp_folha_periodo_status NOT NULL DEFAULT 'aberto',
  data_pagamento date,
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, competencia, tipo)
);

CREATE TABLE public.dp_folha_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  periodo_id uuid NOT NULL REFERENCES public.dp_folha_periodos(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  tipo public.dp_folha_tipo NOT NULL,
  valor_bruto numeric(14,2) NOT NULL DEFAULT 0,
  descontos jsonb NOT NULL DEFAULT '[]'::jsonb,
  valor_liquido numeric(14,2) NOT NULL DEFAULT 0,
  status public.dp_folha_lancamento_status NOT NULL DEFAULT 'rascunho',
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  contracheque_documento_id uuid REFERENCES public.dp_documentos(id) ON DELETE SET NULL,
  financeiro_categoria_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  financeiro_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.dp_folha_lancamentos (periodo_id);
CREATE INDEX ON public.dp_folha_lancamentos (colaborador_id);
CREATE INDEX ON public.dp_folha_lancamentos (company_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_folha_periodos TO authenticated;
GRANT ALL ON public.dp_folha_periodos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_folha_lancamentos TO authenticated;
GRANT ALL ON public.dp_folha_lancamentos TO service_role;

ALTER TABLE public.dp_folha_periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_folha_lancamentos ENABLE ROW LEVEL SECURITY;

-- Policies periodos
CREATE POLICY "dp_folha_periodos_select"
  ON public.dp_folha_periodos FOR SELECT TO authenticated
  USING (
    private.is_company_member(auth.uid(), company_id)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_folha_periodos.company_id AND c.user_id = auth.uid())
    OR public.is_super_admin(auth.uid())
  );
CREATE POLICY "dp_folha_periodos_write"
  ON public.dp_folha_periodos FOR ALL TO authenticated
  USING (
    private.is_company_admin_or_owner(auth.uid(), company_id)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_folha_periodos.company_id AND c.user_id = auth.uid())
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    private.is_company_admin_or_owner(auth.uid(), company_id)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_folha_periodos.company_id AND c.user_id = auth.uid())
    OR public.is_super_admin(auth.uid())
  );

-- Policies lançamentos: admin gerencia; colaborador vê os próprios aprovados
CREATE POLICY "dp_folha_lancamentos_select"
  ON public.dp_folha_lancamentos FOR SELECT TO authenticated
  USING (
    private.is_company_member(auth.uid(), company_id)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_folha_lancamentos.company_id AND c.user_id = auth.uid())
    OR public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.dp_colaboradores dc
      WHERE dc.id = dp_folha_lancamentos.colaborador_id
        AND dc.user_id = auth.uid()
        AND dp_folha_lancamentos.status IN ('aprovado_dp','aprovado_financeiro','pago')
    )
  );
CREATE POLICY "dp_folha_lancamentos_write"
  ON public.dp_folha_lancamentos FOR ALL TO authenticated
  USING (
    private.is_company_admin_or_owner(auth.uid(), company_id)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_folha_lancamentos.company_id AND c.user_id = auth.uid())
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    private.is_company_admin_or_owner(auth.uid(), company_id)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_folha_lancamentos.company_id AND c.user_id = auth.uid())
    OR public.is_super_admin(auth.uid())
  );

-- Triggers updated_at
CREATE TRIGGER trg_dp_folha_periodos_updated_at
  BEFORE UPDATE ON public.dp_folha_periodos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_dp_folha_lancamentos_updated_at
  BEFORE UPDATE ON public.dp_folha_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: quando muda para aprovado_financeiro, cria transaction (despesa a pagar)
CREATE OR REPLACE FUNCTION public.dp_folha_gerar_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_account uuid;
  v_desc text;
  v_due date;
  v_colab_nome text;
  v_periodo public.dp_folha_periodos%ROWTYPE;
  v_tx_id uuid;
BEGIN
  IF NEW.status = 'aprovado_financeiro'
     AND (OLD.status IS DISTINCT FROM 'aprovado_financeiro')
     AND NEW.transaction_id IS NULL THEN

    SELECT * INTO v_periodo FROM public.dp_folha_periodos WHERE id = NEW.periodo_id;
    SELECT user_id INTO v_owner FROM public.companies WHERE id = NEW.company_id;
    SELECT nome INTO v_colab_nome FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;

    v_account := NEW.financeiro_account_id;
    IF v_account IS NULL THEN
      SELECT id INTO v_account FROM public.accounts
       WHERE company_id = NEW.company_id AND context = 'pj' AND active = true
       ORDER BY created_at ASC LIMIT 1;
    END IF;

    IF v_account IS NULL THEN
      RAISE EXCEPTION 'Nenhuma conta bancária PJ disponível para gerar o lançamento financeiro';
    END IF;

    v_due := COALESCE(v_periodo.data_pagamento, CURRENT_DATE);
    v_desc := 'Folha DP — ' || COALESCE(v_colab_nome,'colaborador') || ' — ' || NEW.tipo::text
              || ' (' || to_char(v_periodo.competencia, 'MM/YYYY') || ')';

    INSERT INTO public.transactions (
      user_id, company_id, context, account_id, category_id,
      description, amount, transaction_date, due_date,
      transaction_type, status, bill_status
    ) VALUES (
      v_owner, NEW.company_id, 'pj', v_account, NEW.financeiro_categoria_id,
      v_desc, NEW.valor_liquido, v_due, v_due,
      'expense', 'pending', 'a_pagar'
    ) RETURNING id INTO v_tx_id;

    NEW.transaction_id := v_tx_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dp_folha_gerar_transaction
  BEFORE UPDATE ON public.dp_folha_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.dp_folha_gerar_transaction();

-- RPC: gerar lançamentos de um período (baseado em colaboradores ativos)
CREATE OR REPLACE FUNCTION public.dp_folha_gerar_lancamentos(_periodo_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_periodo public.dp_folha_periodos%ROWTYPE;
  v_count int := 0;
  v_valor numeric(14,2);
  v_adiant numeric(14,2);
  r record;
BEGIN
  SELECT * INTO v_periodo FROM public.dp_folha_periodos WHERE id = _periodo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Período não encontrado'; END IF;

  IF NOT (private.is_company_admin_or_owner(auth.uid(), v_periodo.company_id)
          OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_periodo.company_id AND c.user_id = auth.uid())
          OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  FOR r IN
    SELECT dc.id, COALESCE(dc.salario, cg.salario_base, 0) AS salario_base
    FROM public.dp_colaboradores dc
    LEFT JOIN public.dp_cargos cg ON cg.id = dc.cargo_id
    WHERE dc.company_id = v_periodo.company_id
      AND dc.status = 'ativo'
      AND NOT EXISTS (
        SELECT 1 FROM public.dp_folha_lancamentos l
        WHERE l.periodo_id = _periodo_id AND l.colaborador_id = dc.id
      )
  LOOP
    v_valor := r.salario_base;
    IF v_periodo.tipo = 'adiantamento' THEN
      v_valor := round(r.salario_base * 0.40, 2);
    ELSIF v_periodo.tipo = 'contracheque_mensal' THEN
      SELECT COALESCE(SUM(valor_liquido),0) INTO v_adiant
        FROM public.dp_folha_lancamentos la
        JOIN public.dp_folha_periodos pa ON pa.id = la.periodo_id
       WHERE la.colaborador_id = r.id
         AND pa.tipo = 'adiantamento'
         AND pa.competencia = v_periodo.competencia;
      v_valor := GREATEST(r.salario_base - v_adiant, 0);
    ELSIF v_periodo.tipo = 'contracheque_quinzenal' THEN
      v_valor := round(r.salario_base / 2.0, 2);
    ELSIF v_periodo.tipo = 'decimo_terceiro' THEN
      v_valor := round(r.salario_base / 2.0, 2);
    END IF;

    INSERT INTO public.dp_folha_lancamentos
      (company_id, periodo_id, colaborador_id, tipo, valor_bruto, valor_liquido, status)
    VALUES
      (v_periodo.company_id, _periodo_id, r.id, v_periodo.tipo, v_valor, v_valor, 'rascunho');

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dp_folha_gerar_lancamentos(uuid) TO authenticated;
