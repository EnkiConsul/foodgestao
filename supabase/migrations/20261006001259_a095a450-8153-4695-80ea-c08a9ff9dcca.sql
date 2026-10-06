CREATE OR REPLACE FUNCTION public.dp_ferias_solicitar(
  _periodo_id uuid,
  _data_inicio date,
  _data_fim date,
  _dias_abono integer DEFAULT 0,
  _adiantar_13 boolean DEFAULT false,
  _observacao text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_periodo record;
  v_col record;
  v_solicitacao_id uuid;
BEGIN
  SELECT * INTO v_periodo FROM public.dp_ferias_periodos WHERE id = _periodo_id;
  IF v_periodo.id IS NULL THEN
    RAISE EXCEPTION 'FERIAS_PERIODO_NAO_ENCONTRADO';
  END IF;

  SELECT id, company_id, user_id, unidade_id INTO v_col
  FROM public.dp_colaboradores WHERE id = v_periodo.colaborador_id;

  IF v_col.user_id IS NULL OR v_col.user_id <> auth.uid() OR NOT private.dp_pode_agir(auth.uid()) THEN
    RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO';
  END IF;

  -- FIFO: férias saem sempre do período aquisitivo mais antigo com saldo.
  IF EXISTS (
    SELECT 1 FROM public.dp_ferias_periodos p
    WHERE p.colaborador_id = v_periodo.colaborador_id
      AND p.id <> v_periodo.id
      AND p.inicio_aquisitivo < v_periodo.inicio_aquisitivo
      AND COALESCE(p.dias_saldo, 0) > 0
      AND p.status <> 'concluido'
      AND COALESCE(p.controle_externo, false) = false
  ) THEN
    RAISE EXCEPTION 'FERIAS_PERIODO_ANTERIOR_COM_SALDO';
  END IF;

  IF _data_inicio IS NULL OR _data_fim IS NULL OR _data_fim < _data_inicio THEN
    RAISE EXCEPTION 'FERIAS_DATAS_INVALIDAS';
  END IF;
  IF _data_inicio <= CURRENT_DATE THEN
    RAISE EXCEPTION 'FERIAS_DATA_PASSADA';
  END IF;

  PERFORM private.dp_ferias_fila(v_col.id, v_col.company_id, v_col.unidade_id);

  PERFORM public.dp_ferias_validar_programacao(
    v_col.id, _periodo_id, _data_inicio, _data_fim,
    COALESCE(_dias_abono, 0), NULL, NULL, 'pedido');

  IF EXISTS (
    SELECT 1
    FROM public.dp_ferias_solicitacao_detalhes d
    JOIN public.dp_solicitacoes s ON s.id = d.solicitacao_id
    WHERE d.colaborador_id = v_col.id
      AND s.status = 'pendente'
      AND s.removido_em IS NULL
      AND daterange(d.data_inicio, d.data_fim, '[]') && daterange(_data_inicio, _data_fim, '[]')
  ) THEN
    RAISE EXCEPTION 'FERIAS_SOLICITACAO_DUPLICADA';
  END IF;

  INSERT INTO public.dp_solicitacoes (
    company_id, colaborador_id, criado_por, tipo, data_alvo, data_fim, motivo, status
  ) VALUES (
    v_col.company_id, v_col.id, auth.uid(), 'ferias', _data_inicio, _data_fim,
    NULLIF(btrim(_observacao), ''), 'pendente'
  )
  RETURNING id INTO v_solicitacao_id;

  INSERT INTO public.dp_ferias_solicitacao_detalhes (
    company_id, solicitacao_id, periodo_id, colaborador_id,
    data_inicio, data_fim, dias, dias_abono, adiantar_13, observacao
  ) VALUES (
    v_col.company_id, v_solicitacao_id, _periodo_id, v_col.id,
    _data_inicio, _data_fim, (_data_fim - _data_inicio + 1)::smallint,
    COALESCE(_dias_abono, 0)::smallint, COALESCE(_adiantar_13, false),
    NULLIF(btrim(_observacao), '')
  );

  RETURN v_solicitacao_id;
END;
$$;