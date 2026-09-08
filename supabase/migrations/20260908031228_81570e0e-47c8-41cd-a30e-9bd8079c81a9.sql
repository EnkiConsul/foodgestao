CREATE TABLE public.dp_colaborador_historico_condicoes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    colaborador_id UUID NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
    usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    vigencia_inicio DATE NOT NULL,
    vigencia_fim DATE,
    regime public.dp_regime_trabalho,
    forma_pagamento public.dp_forma_pagamento,
    cargo_id UUID REFERENCES public.dp_cargos(id) ON DELETE SET NULL,
    unidade_id UUID REFERENCES public.dp_unidades(id) ON DELETE SET NULL,
    setor_id UUID REFERENCES public.dp_setores(id) ON DELETE SET NULL,
    salario_base NUMERIC,
    valor_hora NUMERIC,
    base_horas_mes NUMERIC,
    base_dias_mes NUMERIC,
    observacoes TEXT,
    justificativa TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT dp_colab_hist_cond_vigencia_unica UNIQUE (colaborador_id, vigencia_inicio)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_colaborador_historico_condicoes TO authenticated;
GRANT ALL ON public.dp_colaborador_historico_condicoes TO service_role;

ALTER TABLE public.dp_colaborador_historico_condicoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/owner gerencia histórico de condições" ON public.dp_colaborador_historico_condicoes
FOR ALL TO authenticated
USING (
  private.is_company_admin_or_owner(auth.uid(), company_id)
  OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid())
)
WITH CHECK (
  private.is_company_admin_or_owner(auth.uid(), company_id)
  OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid())
);

CREATE POLICY "Colaborador lê próprio histórico" ON public.dp_colaborador_historico_condicoes
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.dp_colaboradores c WHERE c.id = colaborador_id AND c.user_id = auth.uid()));

CREATE TRIGGER update_dp_colaborador_historico_condicoes_updated_at
BEFORE UPDATE ON public.dp_colaborador_historico_condicoes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.dp_colaborador_aplicar_condicao(
  p_colaborador_id UUID,
  p_vigencia_inicio DATE,
  p_regime TEXT,
  p_forma_pagamento TEXT,
  p_cargo_id UUID,
  p_unidade_id UUID,
  p_setor_id UUID,
  p_salario_base NUMERIC,
  p_valor_hora NUMERIC,
  p_base_horas_mes NUMERIC,
  p_base_dias_mes NUMERIC,
  p_justificativa TEXT,
  p_observacoes TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_historico_id UUID;
BEGIN
  SELECT company_id INTO v_company_id
  FROM public.dp_colaboradores
  WHERE id = p_colaborador_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Colaborador não encontrado';
  END IF;

  IF NOT (
    private.is_company_admin_or_owner(auth.uid(), v_company_id)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_company_id AND c.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Sem permissão para alterar condições deste colaborador';
  END IF;

  UPDATE public.dp_colaborador_historico_condicoes
  SET vigencia_fim = p_vigencia_inicio - INTERVAL '1 day'
  WHERE colaborador_id = p_colaborador_id
    AND vigencia_fim IS NULL
    AND vigencia_inicio < p_vigencia_inicio;

  INSERT INTO public.dp_colaborador_historico_condicoes (
    company_id, colaborador_id, usuario_id, vigencia_inicio, regime, forma_pagamento,
    cargo_id, unidade_id, setor_id, salario_base, valor_hora, base_horas_mes, base_dias_mes,
    justificativa, observacoes
  ) VALUES (
    v_company_id, p_colaborador_id, auth.uid(), p_vigencia_inicio,
    NULLIF(p_regime, '')::public.dp_regime_trabalho,
    NULLIF(p_forma_pagamento, '')::public.dp_forma_pagamento,
    p_cargo_id, p_unidade_id, p_setor_id, p_salario_base, p_valor_hora,
    p_base_horas_mes, p_base_dias_mes, p_justificativa, p_observacoes
  ) RETURNING id INTO v_historico_id;

  UPDATE public.dp_colaboradores
  SET
    regime = COALESCE(NULLIF(p_regime, '')::public.dp_regime_trabalho, regime),
    forma_pagamento = COALESCE(NULLIF(p_forma_pagamento, '')::public.dp_forma_pagamento, forma_pagamento),
    cargo_id = COALESCE(p_cargo_id, cargo_id),
    unidade_id = COALESCE(p_unidade_id, unidade_id),
    setor_id = COALESCE(p_setor_id, setor_id),
    salario_base = COALESCE(p_salario_base, salario_base),
    valor_hora = COALESCE(p_valor_hora, valor_hora),
    base_horas_mes = COALESCE(p_base_horas_mes, base_horas_mes),
    base_dias_mes = COALESCE(p_base_dias_mes, base_dias_mes),
    updated_at = now()
  WHERE id = p_colaborador_id;

  RETURN v_historico_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dp_colaborador_aplicar_condicao(UUID, DATE, TEXT, TEXT, UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_colaborador_aplicar_condicao(UUID, DATE, TEXT, TEXT, UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated, service_role;