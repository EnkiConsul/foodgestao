SET search_path = public, extensions, pg_temp;

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- 1) Sobreposição de férias do mesmo colaborador é impossível no banco
ALTER TABLE public.dp_ferias_gozos
  DROP CONSTRAINT IF EXISTS dp_ferias_gozos_sem_sobreposicao;
ALTER TABLE public.dp_ferias_gozos
  ADD CONSTRAINT dp_ferias_gozos_sem_sobreposicao
  EXCLUDE USING gist (
    colaborador_id WITH =,
    daterange(data_inicio, data_fim, '[]') WITH &&
  ) WHERE (status <> 'cancelado');

-- 2) Fila (advisory locks) por colaborador e por unidade
CREATE OR REPLACE FUNCTION private.dp_ferias_fila(
  _colaborador_id uuid,
  _company_id uuid,
  _unidade_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _colaborador_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended('dp_ferias:colaborador:' || _colaborador_id::text, 0));
  END IF;
  IF _company_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended('dp_ferias:escopo:' || _company_id::text
        || ':' || COALESCE(_unidade_id::text, '-'), 0));
  END IF;
END;
$$;

-- 3) Período bloqueado + limite de simultâneos, reutilizável
CREATE OR REPLACE FUNCTION private.dp_ferias_regras_check(
  _colaborador_id uuid,
  _company_id uuid,
  _data_inicio date,
  _data_fim date,
  _ignorar_gozo_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col record;
  v_bloq record;
  v_regra record;
  v_conc int;
BEGIN
  SELECT id, unidade_id, cargo_id, turno INTO v_col
  FROM public.dp_colaboradores WHERE id = _colaborador_id;
  IF v_col.id IS NULL THEN
    RAISE EXCEPTION 'FERIAS_COLABORADOR_NAO_ENCONTRADO';
  END IF;

  PERFORM private.dp_ferias_fila(_colaborador_id, _company_id, v_col.unidade_id);

  SELECT * INTO v_bloq
  FROM public.dp_ferias_bloqueios b
  WHERE b.company_id = _company_id
    AND b.ativo
    AND NOT b.permite_excecao
    AND (b.unidade_id IS NULL OR b.unidade_id = v_col.unidade_id)
    AND (
      (NOT b.recorrente_anual
        AND daterange(b.data_inicio, b.data_fim, '[]') && daterange(_data_inicio, _data_fim, '[]'))
      OR (
        b.recorrente_anual AND EXISTS (
          SELECT 1 FROM generate_series(
            EXTRACT(YEAR FROM _data_inicio)::int - 1,
            EXTRACT(YEAR FROM _data_fim)::int
          ) AS y
          WHERE daterange(
                  make_date(y, EXTRACT(MONTH FROM b.data_inicio)::int, EXTRACT(DAY FROM b.data_inicio)::int),
                  make_date(y, EXTRACT(MONTH FROM b.data_inicio)::int, EXTRACT(DAY FROM b.data_inicio)::int)
                    + (b.data_fim - b.data_inicio),
                  '[]'
                ) && daterange(_data_inicio, _data_fim, '[]')
        )
      )
    )
  LIMIT 1;

  IF v_bloq.id IS NOT NULL THEN
    RAISE EXCEPTION 'Período bloqueado para férias: %', v_bloq.nome;
  END IF;

  SELECT * INTO v_regra
  FROM public.dp_ferias_regras r
  WHERE r.company_id = _company_id
    AND r.ativo
    AND (r.unidade_id IS NULL OR r.unidade_id = v_col.unidade_id)
    AND (r.cargo_id IS NULL OR r.cargo_id = v_col.cargo_id)
    AND (r.turno IS NULL OR r.turno = v_col.turno)
  ORDER BY (r.cargo_id IS NOT NULL)::int + (r.unidade_id IS NOT NULL)::int + (r.turno IS NOT NULL)::int DESC
  LIMIT 1;

  IF v_regra.id IS NOT NULL THEN
    SELECT COUNT(DISTINCT g.colaborador_id) INTO v_conc
    FROM public.dp_ferias_gozos g
    JOIN public.dp_colaboradores c ON c.id = g.colaborador_id
    WHERE g.company_id = _company_id
      AND (_ignorar_gozo_id IS NULL OR g.id <> _ignorar_gozo_id)
      AND g.status <> 'cancelado'
      AND g.colaborador_id <> _colaborador_id
      AND daterange(g.data_inicio, g.data_fim, '[]') && daterange(_data_inicio, _data_fim, '[]')
      AND (v_regra.unidade_id IS NULL OR c.unidade_id = v_regra.unidade_id)
      AND (v_regra.cargo_id IS NULL OR c.cargo_id = v_regra.cargo_id)
      AND (v_regra.turno IS NULL OR c.turno = v_regra.turno);

    IF v_conc + 1 > v_regra.max_simultaneos THEN
      RAISE EXCEPTION 'Limite de % colaborador(es) simultaneamente em férias já atingido neste período.', v_regra.max_simultaneos;
    END IF;
  END IF;
END;
$$;

-- 4) Cobertura mínima do turno: dias que ficariam descobertos
CREATE OR REPLACE FUNCTION private.dp_ferias_cobertura_descoberta(
  _colaborador_id uuid,
  _company_id uuid,
  _data_inicio date,
  _data_fim date,
  _ignorar_gozo_id uuid DEFAULT NULL
) RETURNS TABLE (data date, minimo int, previsto int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col record;
BEGIN
  SELECT c.id, c.unidade_id, c.cargo_id INTO v_col
  FROM public.dp_colaboradores c WHERE c.id = _colaborador_id;
  IF v_col.id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH dias AS (
    SELECT d::date AS data
    FROM generate_series(_data_inicio, _data_fim, INTERVAL '1 day') d
  ),
  regras AS (
    SELECT r.cargo_id, r.turno_id, r.dia_semana, r.minimo,
           r.vigencia_inicio, r.vigencia_fim
    FROM public.dp_cobertura_minima r
    WHERE r.company_id = _company_id
      AND COALESCE(r.ativo, true)
      AND (r.unidade_id IS NULL OR r.unidade_id = v_col.unidade_id)
      AND (r.cargo_id IS NULL OR r.cargo_id = v_col.cargo_id)
  )
  SELECT dias.data, regras.minimo::int, COALESCE(prev.qtd, 0)::int
  FROM dias
  JOIN regras
    ON (regras.dia_semana IS NULL OR regras.dia_semana = EXTRACT(DOW FROM dias.data)::int)
   AND (regras.vigencia_inicio IS NULL OR regras.vigencia_inicio <= dias.data)
   AND (regras.vigencia_fim IS NULL OR regras.vigencia_fim >= dias.data)
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT ei.colaborador_id)::int AS qtd
    FROM public.dp_escala_itens ei
    JOIN public.dp_colaboradores c2 ON c2.id = ei.colaborador_id
    WHERE ei.data = dias.data
      AND ei.company_id = _company_id
      AND ei.tipo::text = 'trabalho'
      AND ei.colaborador_id <> _colaborador_id
      AND (regras.cargo_id IS NULL OR c2.cargo_id = regras.cargo_id)
      AND (regras.turno_id IS NULL OR ei.turno_id = regras.turno_id)
      -- quem já está de férias naquele dia não conta como cobertura
      AND NOT EXISTS (
        SELECT 1 FROM public.dp_ferias_gozos g
        WHERE g.colaborador_id = ei.colaborador_id
          AND g.status <> 'cancelado'
          AND (_ignorar_gozo_id IS NULL OR g.id <> _ignorar_gozo_id)
          AND dias.data BETWEEN g.data_inicio AND g.data_fim
      )
  ) prev ON true
  WHERE COALESCE(prev.qtd, 0) < regras.minimo
  ORDER BY 1;
END;
$$;

-- 5) Trigger passa a usar a regra compartilhada (última barreira)
CREATE OR REPLACE FUNCTION public.dp_ferias_gozo_validar_regras()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelado' THEN
    RETURN NEW;
  END IF;
  PERFORM private.dp_ferias_regras_check(
    NEW.colaborador_id, NEW.company_id, NEW.data_inicio, NEW.data_fim, NEW.id);
  RETURN NEW;
END;
$$;

-- 6) Validação central: fila, sobreposição por colaborador, cobertura mínima
CREATE OR REPLACE FUNCTION public.dp_ferias_validar_programacao(
  _colaborador_id uuid,
  _periodo_id uuid,
  _data_inicio date,
  _data_fim date,
  _dias_abono integer DEFAULT 0,
  _justificativa text DEFAULT NULL,
  _ignorar_gozo_id uuid DEFAULT NULL,
  _modo text DEFAULT 'gestor'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col record;
  v_periodo record;
  v_usados int;
  v_novos int;
  v_cfg record;
  v_d date;
  v_dow int;
  v_trabalha boolean;
  v_fracoes int;
  v_dias_novos int;
  v_maior int;
  v_desc record;
  v_tem_justificativa boolean := COALESCE(btrim(_justificativa), '') <> '';
BEGIN
  IF _data_inicio IS NULL OR _data_fim IS NULL OR _data_fim < _data_inicio THEN
    RAISE EXCEPTION 'FERIAS_DATAS_INVALIDAS';
  END IF;

  SELECT id, company_id, unidade_id INTO v_col
  FROM public.dp_colaboradores WHERE id = _colaborador_id;
  IF v_col.id IS NULL THEN
    RAISE EXCEPTION 'FERIAS_COLABORADOR_NAO_ENCONTRADO';
  END IF;

  -- entra na fila antes de qualquer conferência
  PERFORM private.dp_ferias_fila(_colaborador_id, v_col.company_id, v_col.unidade_id);

  SELECT * INTO v_periodo FROM public.dp_ferias_periodos WHERE id = _periodo_id FOR UPDATE;
  IF v_periodo.id IS NULL OR v_periodo.colaborador_id <> _colaborador_id THEN
    RAISE EXCEPTION 'FERIAS_PERIODO_NAO_ENCONTRADO';
  END IF;
  IF v_periodo.requer_revisao THEN
    RAISE EXCEPTION 'FERIAS_PERIODO_EM_REVISAO';
  END IF;

  SELECT COALESCE(SUM(g.dias + g.dias_abono), 0) INTO v_usados
  FROM public.dp_ferias_gozos g
  WHERE g.periodo_id = _periodo_id
    AND g.status <> 'cancelado'
    AND (_ignorar_gozo_id IS NULL OR g.id <> _ignorar_gozo_id);

  v_novos := (_data_fim - _data_inicio + 1) + COALESCE(_dias_abono, 0);
  IF v_usados + v_novos > v_periodo.dias_direito THEN
    RAISE EXCEPTION 'FERIAS_SALDO_INSUFICIENTE';
  END IF;

  -- sobreposição considera todas as férias do colaborador, de qualquer período
  IF EXISTS (
    SELECT 1 FROM public.dp_ferias_gozos g
    WHERE g.colaborador_id = _colaborador_id
      AND g.status <> 'cancelado'
      AND (_ignorar_gozo_id IS NULL OR g.id <> _ignorar_gozo_id)
      AND daterange(g.data_inicio, g.data_fim, '[]') && daterange(_data_inicio, _data_fim, '[]')
  ) THEN
    RAISE EXCEPTION 'FERIAS_SOBREPOSICAO';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.dp_convocacoes cv
    JOIN public.dp_convocacao_ocorrencias oc ON oc.id = cv.ocorrencia_id
    WHERE cv.colaborador_id = _colaborador_id
      AND cv.status = 'aceita'
      AND oc.data BETWEEN _data_inicio AND _data_fim
  ) THEN
    RAISE EXCEPTION 'FERIAS_CONVOCACAO_ACEITA';
  END IF;

  -- período bloqueado e limite de pessoas simultâneas
  PERFORM private.dp_ferias_regras_check(
    _colaborador_id, v_col.company_id, _data_inicio, _data_fim, _ignorar_gozo_id);

  SELECT * INTO v_cfg FROM public.dp_ferias_config(v_col.company_id, v_col.unidade_id);

  SELECT COUNT(*)::int INTO v_fracoes
  FROM public.dp_ferias_gozos g
  WHERE g.periodo_id = _periodo_id
    AND g.status <> 'cancelado'
    AND (_ignorar_gozo_id IS NULL OR g.id <> _ignorar_gozo_id);

  v_dias_novos := (_data_fim - _data_inicio + 1);

  IF v_fracoes > 0 THEN
    IF v_fracoes + 1 > COALESCE(v_cfg.fracionamento_max, 3) THEN
      RAISE EXCEPTION 'FERIAS_FRACIONAMENTO_LIMITE';
    END IF;

    IF v_dias_novos < COALESCE(v_cfg.fracao_min_dias, 5) THEN
      RAISE EXCEPTION 'FERIAS_FRACAO_CURTA';
    END IF;

    SELECT COALESCE(MAX(g.dias), 0) INTO v_maior
    FROM public.dp_ferias_gozos g
    WHERE g.periodo_id = _periodo_id
      AND g.status <> 'cancelado'
      AND (_ignorar_gozo_id IS NULL OR g.id <> _ignorar_gozo_id);

    IF v_usados + v_novos >= v_periodo.dias_direito
       AND GREATEST(v_maior, v_dias_novos) < COALESCE(v_cfg.fracao_maior_dias, 14) THEN
      RAISE EXCEPTION 'FERIAS_FRACAO_MAIOR_AUSENTE';
    END IF;
  ELSIF v_dias_novos < COALESCE(v_cfg.fracao_min_dias, 5)
        AND v_novos < v_periodo.dias_direito THEN
    RAISE EXCEPTION 'FERIAS_FRACAO_CURTA';
  END IF;

  FOR v_d IN SELECT generate_series(_data_inicio + 1, _data_inicio + 2, INTERVAL '1 day')::date LOOP
    IF v_col.unidade_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.dp_feriados_resolver(v_col.unidade_id, v_d, v_d)
    ) THEN
      RAISE EXCEPTION 'FERIAS_INICIO_VESPERA';
    END IF;

    v_dow := EXTRACT(DOW FROM v_d)::int;
    SELECT cd.trabalha INTO v_trabalha
    FROM public.dp_colaborador_config_trabalho ct
    JOIN public.dp_colaborador_config_dias cd ON cd.config_id = ct.id
    WHERE ct.colaborador_id = _colaborador_id
      AND ct.vigencia_fim IS NULL
      AND cd.dow = v_dow
    LIMIT 1;

    IF v_trabalha IS FALSE OR (v_trabalha IS NULL AND v_dow = 0) THEN
      RAISE EXCEPTION 'FERIAS_INICIO_VESPERA';
    END IF;
  END LOOP;

  -- cobertura mínima do turno: só com justificativa registrada é possível seguir
  IF NOT v_tem_justificativa THEN
    SELECT * INTO v_desc
    FROM private.dp_ferias_cobertura_descoberta(
      _colaborador_id, v_col.company_id, _data_inicio, _data_fim, _ignorar_gozo_id)
    LIMIT 1;

    IF v_desc.data IS NOT NULL THEN
      RAISE EXCEPTION 'FERIAS_COBERTURA_MINIMA:%', to_char(v_desc.data, 'DD/MM/YYYY');
    END IF;
  END IF;

  -- no pedido do colaborador a antecedência é avaliada pelo gestor na aprovação
  IF _modo <> 'pedido'
     AND (_data_inicio - CURRENT_DATE) < COALESCE(v_cfg.aviso_antecedencia_dias, 60)
     AND NOT v_tem_justificativa THEN
    RAISE EXCEPTION 'FERIAS_AVISO_ANTECEDENCIA';
  END IF;
END;
$$;

-- 7) Pedido do colaborador com a mesma régua
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

  IF _data_inicio IS NULL OR _data_fim IS NULL OR _data_fim < _data_inicio THEN
    RAISE EXCEPTION 'FERIAS_DATAS_INVALIDAS';
  END IF;
  IF _data_inicio <= CURRENT_DATE THEN
    RAISE EXCEPTION 'FERIAS_DATA_PASSADA';
  END IF;

  PERFORM private.dp_ferias_fila(v_col.id, v_col.company_id, v_col.unidade_id);

  -- mesmas regras da aprovação (saldo, sobreposição, bloqueio, limite, fracionamento)
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

-- 8) Cancelamento também entra na fila
CREATE OR REPLACE FUNCTION public.dp_ferias_cancelar(_gozo_id uuid, _motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gozo record;
  v_col record;
BEGIN
  IF COALESCE(btrim(_motivo), '') = '' THEN
    RAISE EXCEPTION 'FERIAS_MOTIVO_OBRIGATORIO';
  END IF;

  SELECT * INTO v_gozo FROM public.dp_ferias_gozos WHERE id = _gozo_id FOR UPDATE;
  IF v_gozo.id IS NULL THEN
    RAISE EXCEPTION 'FERIAS_NAO_ENCONTRADA';
  END IF;
  IF NOT private.is_company_admin_or_owner(auth.uid(), v_gozo.company_id) THEN
    RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO';
  END IF;
  IF v_gozo.status = 'cancelado' THEN
    RETURN;
  END IF;
  IF v_gozo.status = 'concluido' THEN
    RAISE EXCEPTION 'FERIAS_JA_CONCLUIDA';
  END IF;

  SELECT id, user_id, unidade_id INTO v_col
  FROM public.dp_colaboradores WHERE id = v_gozo.colaborador_id;

  PERFORM private.dp_ferias_fila(v_gozo.colaborador_id, v_gozo.company_id, v_col.unidade_id);

  UPDATE public.dp_ferias_gozos
  SET status = 'cancelado',
      cancelado_em = now(),
      cancelado_por = auth.uid(),
      motivo_cancelamento = btrim(_motivo)
  WHERE id = _gozo_id;

  IF v_col.user_id IS NOT NULL THEN
    INSERT INTO public.dp_notificacoes (
      company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id, chave
    ) VALUES (
      v_gozo.company_id, v_col.user_id, v_col.id, 'ferias_canceladas',
      'Suas férias foram canceladas',
      to_char(v_gozo.data_inicio, 'DD/MM/YYYY') || ' a ' || to_char(v_gozo.data_fim, 'DD/MM/YYYY')
        || ' · ' || btrim(_motivo),
      'dp_ferias_gozos', v_gozo.id, 'ferias_canceladas:' || v_gozo.id::text
    ) ON CONFLICT (chave) WHERE chave IS NOT NULL DO NOTHING;
  END IF;
END;
$$;

-- 9) Fechar gravação direta pelo aplicativo (leitura preservada)
DROP POLICY IF EXISTS dp_ferias_gozos_admin_write ON public.dp_ferias_gozos;
CREATE POLICY dp_ferias_gozos_admin_read ON public.dp_ferias_gozos
  FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

DROP POLICY IF EXISTS dp_ferias_periodos_admin_write ON public.dp_ferias_periodos;
CREATE POLICY dp_ferias_periodos_admin_read ON public.dp_ferias_periodos
  FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

REVOKE INSERT, UPDATE, DELETE ON public.dp_ferias_gozos FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.dp_ferias_periodos FROM authenticated;
REVOKE ALL ON public.dp_ferias_gozos FROM anon;
REVOKE ALL ON public.dp_ferias_periodos FROM anon;
GRANT SELECT ON public.dp_ferias_gozos TO authenticated;
GRANT SELECT ON public.dp_ferias_periodos TO authenticated;
GRANT ALL ON public.dp_ferias_gozos TO service_role;
GRANT ALL ON public.dp_ferias_periodos TO service_role;

REVOKE ALL ON FUNCTION private.dp_ferias_fila(uuid, uuid, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_ferias_regras_check(uuid, uuid, date, date, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_ferias_cobertura_descoberta(uuid, uuid, date, date, uuid) FROM anon, authenticated;