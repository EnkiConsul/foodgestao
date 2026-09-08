CREATE OR REPLACE FUNCTION public.dp_recontratar_colaborador(
  p_colaborador_id UUID,
  p_data_admissao DATE,
  p_regime TEXT DEFAULT NULL,
  p_forma_pagamento TEXT DEFAULT NULL,
  p_cargo_id UUID DEFAULT NULL,
  p_unidade_id UUID DEFAULT NULL,
  p_setor_id UUID DEFAULT NULL,
  p_salario_base NUMERIC DEFAULT NULL,
  p_valor_hora NUMERIC DEFAULT NULL,
  p_matricula TEXT DEFAULT NULL,
  p_justificativa TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_ativo BOOLEAN;
  v_desligamento DATE;
  v_historico_id UUID;
BEGIN
  IF p_data_admissao IS NULL THEN
    RAISE EXCEPTION 'Informe a nova data de admissão';
  END IF;

  SELECT company_id, ativo, data_desligamento
    INTO v_company_id, v_ativo, v_desligamento
  FROM public.dp_colaboradores
  WHERE id = p_colaborador_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Colaborador não encontrado';
  END IF;

  IF NOT (
    private.is_company_admin_or_owner(auth.uid(), v_company_id)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_company_id AND c.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Sem permissão para recontratar colaboradores';
  END IF;

  IF v_ativo IS TRUE AND v_desligamento IS NULL THEN
    RAISE EXCEPTION 'Este colaborador já está ativo — a recontratação vale apenas para quem foi desligado';
  END IF;

  IF v_desligamento IS NOT NULL AND p_data_admissao <= v_desligamento THEN
    RAISE EXCEPTION 'A nova admissão precisa ser posterior à data do desligamento';
  END IF;

  UPDATE public.dp_colaborador_historico_condicoes
     SET vigencia_fim = COALESCE(vigencia_fim, LEAST(v_desligamento, p_data_admissao - 1), p_data_admissao - 1)
   WHERE colaborador_id = p_colaborador_id
     AND vigencia_fim IS NULL
     AND vigencia_inicio < p_data_admissao;

  INSERT INTO public.dp_colaborador_historico_condicoes (
    company_id, colaborador_id, usuario_id, vigencia_inicio, regime, forma_pagamento,
    cargo_id, unidade_id, setor_id, salario_base, valor_hora, justificativa, observacoes
  )
  SELECT
    v_company_id, p_colaborador_id, auth.uid(), p_data_admissao,
    COALESCE(NULLIF(p_regime, '')::public.dp_regime_trabalho, c.regime),
    COALESCE(NULLIF(p_forma_pagamento, '')::public.dp_forma_pagamento, c.forma_pagamento),
    COALESCE(p_cargo_id, c.cargo_id),
    COALESCE(p_unidade_id, c.unidade_id),
    COALESCE(p_setor_id, c.setor_id),
    COALESCE(p_salario_base, c.salario_base),
    COALESCE(p_valor_hora, c.valor_hora),
    COALESCE(NULLIF(p_justificativa, ''), 'Recontratação'),
    'Recontratação — novo vínculo a partir de ' || to_char(p_data_admissao, 'DD/MM/YYYY')
  FROM public.dp_colaboradores c
  WHERE c.id = p_colaborador_id
  ON CONFLICT (colaborador_id, vigencia_inicio) DO UPDATE
    SET regime = EXCLUDED.regime,
        forma_pagamento = EXCLUDED.forma_pagamento,
        cargo_id = EXCLUDED.cargo_id,
        unidade_id = EXCLUDED.unidade_id,
        setor_id = EXCLUDED.setor_id,
        salario_base = EXCLUDED.salario_base,
        valor_hora = EXCLUDED.valor_hora,
        justificativa = EXCLUDED.justificativa,
        observacoes = EXCLUDED.observacoes,
        vigencia_fim = NULL,
        updated_at = now()
  RETURNING id INTO v_historico_id;

  UPDATE public.dp_colaboradores
     SET ativo = true,
         data_desligamento = NULL,
         motivo_desligamento = NULL,
         data_admissao = p_data_admissao,
         matricula = COALESCE(NULLIF(p_matricula, ''), matricula),
         regime = COALESCE(NULLIF(p_regime, '')::public.dp_regime_trabalho, regime),
         forma_pagamento = COALESCE(NULLIF(p_forma_pagamento, '')::public.dp_forma_pagamento, forma_pagamento),
         cargo_id = COALESCE(p_cargo_id, cargo_id),
         unidade_id = COALESCE(p_unidade_id, unidade_id),
         setor_id = COALESCE(p_setor_id, setor_id),
         salario_base = COALESCE(p_salario_base, salario_base),
         valor_hora = COALESCE(p_valor_hora, valor_hora),
         updated_at = now()
   WHERE id = p_colaborador_id;

  RETURN v_historico_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dp_recontratar_colaborador(UUID, DATE, TEXT, TEXT, UUID, UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_recontratar_colaborador(UUID, DATE, TEXT, TEXT, UUID, UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated, service_role;