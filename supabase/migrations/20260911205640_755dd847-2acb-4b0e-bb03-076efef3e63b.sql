-- 1. Colunas de controle do aviso de férias
ALTER TABLE public.dp_ferias_gozos
  ADD COLUMN IF NOT EXISTS aviso_enviado_em timestamptz,
  ADD COLUMN IF NOT EXISTS aviso_fora_prazo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ciente_fora_prazo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aviso_retroativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aviso_retroativo_declarado_por uuid,
  ADD COLUMN IF NOT EXISTS aviso_retroativo_declarado_em timestamptz;

-- 2. Vínculo de documentos com o período de férias
ALTER TABLE public.dp_documentos
  ADD COLUMN IF NOT EXISTS ferias_gozo_id uuid REFERENCES public.dp_ferias_gozos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS dp_documentos_ferias_gozo_idx
  ON public.dp_documentos (ferias_gozo_id) WHERE ferias_gozo_id IS NOT NULL;

-- 3. Programação de férias: registra o aviso e notifica o colaborador
CREATE OR REPLACE FUNCTION public.dp_ferias_programar(
  _periodo_id uuid,
  _data_inicio date,
  _data_fim date,
  _dias_abono integer DEFAULT 0,
  _adiantar_13 boolean DEFAULT false,
  _observacao text DEFAULT NULL,
  _justificativa text DEFAULT NULL,
  _solicitacao_id uuid DEFAULT NULL,
  _origem text DEFAULT 'gestor'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_periodo record;
  v_col record;
  v_gozo_id uuid;
  v_fora_prazo boolean;
  v_dias_aviso integer;
BEGIN
  SELECT * INTO v_periodo FROM public.dp_ferias_periodos WHERE id = _periodo_id;
  IF v_periodo.id IS NULL THEN
    RAISE EXCEPTION 'FERIAS_PERIODO_NAO_ENCONTRADO';
  END IF;

  IF NOT private.is_company_admin_or_owner(auth.uid(), v_periodo.company_id) THEN
    RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO';
  END IF;

  SELECT id, nome, user_id INTO v_col
  FROM public.dp_colaboradores WHERE id = v_periodo.colaborador_id;

  PERFORM public.dp_ferias_validar_programacao(
    v_periodo.colaborador_id, _periodo_id, _data_inicio, _data_fim,
    COALESCE(_dias_abono, 0), _justificativa, NULL
  );

  v_dias_aviso := _data_inicio - CURRENT_DATE;
  v_fora_prazo := v_dias_aviso < 30;

  INSERT INTO public.dp_ferias_gozos (
    company_id, periodo_id, colaborador_id, data_inicio, data_fim,
    dias_abono, adiantar_13, status, observacao, criado_por,
    aprovado_por, aprovado_em, origem, solicitacao_id, aviso_justificativa,
    aviso_em, aviso_enviado_em, aviso_fora_prazo
  ) VALUES (
    v_periodo.company_id, _periodo_id, v_periodo.colaborador_id, _data_inicio, _data_fim,
    COALESCE(_dias_abono, 0)::smallint, COALESCE(_adiantar_13, false), 'aprovado',
    NULLIF(btrim(_observacao), ''), auth.uid(), auth.uid(), now(),
    COALESCE(_origem, 'gestor'), _solicitacao_id, NULLIF(btrim(_justificativa), ''),
    CURRENT_DATE, now(), v_fora_prazo
  )
  RETURNING id INTO v_gozo_id;

  IF v_col.user_id IS NOT NULL THEN
    INSERT INTO public.dp_notificacoes (
      company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id, chave
    ) VALUES (
      v_periodo.company_id, v_col.user_id, v_col.id, 'ferias_programadas',
      'Suas férias foram programadas',
      to_char(_data_inicio, 'DD/MM/YYYY') || ' a ' || to_char(_data_fim, 'DD/MM/YYYY')
        || ' · ' || (_data_fim - _data_inicio + 1) || ' dias',
      'dp_ferias_gozos', v_gozo_id, 'ferias_programadas:' || v_gozo_id::text
    ) ON CONFLICT (chave) WHERE chave IS NOT NULL DO NOTHING;

    INSERT INTO public.dp_notificacoes (
      company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id, chave
    ) VALUES (
      v_periodo.company_id, v_col.user_id, v_col.id, 'ferias_aviso',
      'Aviso de férias — dê sua ciência',
      'Férias de ' || to_char(_data_inicio, 'DD/MM/YYYY') || ' a ' || to_char(_data_fim, 'DD/MM/YYYY')
        || ' · aviso com ' || GREATEST(v_dias_aviso, 0) || ' dias de antecedência'
        || CASE WHEN v_fora_prazo
             THEN '. Comunicação fora do prazo legal de 30 dias.'
                  || COALESCE(' Justificativa: ' || NULLIF(btrim(_justificativa), ''), '')
             ELSE '' END,
      'dp_ferias_gozos', v_gozo_id, 'ferias_aviso:' || v_gozo_id::text
    ) ON CONFLICT (chave) WHERE chave IS NOT NULL DO NOTHING;
  END IF;

  RETURN v_gozo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_programar(uuid, date, date, integer, boolean, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_programar(uuid, date, date, integer, boolean, text, text, uuid, text) TO authenticated;

-- 4. Registro/reenvio do aviso pelo gestor (inclui data retroativa)
CREATE OR REPLACE FUNCTION public.dp_ferias_registrar_aviso(
  _gozo_id uuid,
  _aviso_em date,
  _retroativo boolean DEFAULT false,
  _justificativa text DEFAULT NULL,
  _documento_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gozo record;
  v_col record;
  v_fora_prazo boolean;
  v_dias_aviso integer;
BEGIN
  SELECT * INTO v_gozo FROM public.dp_ferias_gozos WHERE id = _gozo_id;
  IF v_gozo.id IS NULL THEN
    RAISE EXCEPTION 'FERIAS_NAO_ENCONTRADA';
  END IF;
  IF NOT private.is_company_admin_or_owner(auth.uid(), v_gozo.company_id) THEN
    RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO';
  END IF;
  IF _aviso_em IS NULL THEN
    RAISE EXCEPTION 'FERIAS_AVISO_DATA_OBRIGATORIA';
  END IF;
  IF _aviso_em > CURRENT_DATE THEN
    RAISE EXCEPTION 'FERIAS_AVISO_DATA_FUTURA';
  END IF;

  v_dias_aviso := v_gozo.data_inicio - _aviso_em;
  v_fora_prazo := v_dias_aviso < 30;

  IF _aviso_em < CURRENT_DATE THEN
    IF COALESCE(_retroativo, false) = false THEN
      RAISE EXCEPTION 'FERIAS_AVISO_RETROATIVO_SEM_DECLARACAO';
    END IF;
    IF _documento_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.dp_documentos d
      WHERE d.id = _documento_id
        AND d.company_id = v_gozo.company_id
        AND d.tipo = 'aviso_ferias'
    ) THEN
      RAISE EXCEPTION 'FERIAS_AVISO_RETROATIVO_SEM_ANEXO';
    END IF;
  END IF;

  IF v_fora_prazo AND COALESCE(btrim(_justificativa), '') = '' THEN
    RAISE EXCEPTION 'FERIAS_AVISO_ANTECEDENCIA';
  END IF;

  UPDATE public.dp_ferias_gozos
  SET aviso_em = _aviso_em,
      aviso_enviado_em = now(),
      aviso_fora_prazo = v_fora_prazo,
      aviso_justificativa = NULLIF(btrim(_justificativa), ''),
      aviso_retroativo = (_aviso_em < CURRENT_DATE),
      aviso_retroativo_declarado_por =
        CASE WHEN _aviso_em < CURRENT_DATE THEN auth.uid() ELSE NULL END,
      aviso_retroativo_declarado_em =
        CASE WHEN _aviso_em < CURRENT_DATE THEN now() ELSE NULL END
  WHERE id = _gozo_id;

  IF _documento_id IS NOT NULL THEN
    UPDATE public.dp_documentos
    SET ferias_gozo_id = _gozo_id
    WHERE id = _documento_id AND company_id = v_gozo.company_id;
  END IF;

  SELECT id, user_id INTO v_col FROM public.dp_colaboradores WHERE id = v_gozo.colaborador_id;

  IF v_col.user_id IS NOT NULL THEN
    INSERT INTO public.dp_notificacoes (
      company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id, chave
    ) VALUES (
      v_gozo.company_id, v_col.user_id, v_col.id, 'ferias_aviso',
      'Aviso de férias — dê sua ciência',
      'Férias de ' || to_char(v_gozo.data_inicio, 'DD/MM/YYYY') || ' a '
        || to_char(v_gozo.data_fim, 'DD/MM/YYYY')
        || ' · aviso em ' || to_char(_aviso_em, 'DD/MM/YYYY')
        || CASE WHEN v_fora_prazo
             THEN '. Comunicação fora do prazo legal de 30 dias.'
                  || COALESCE(' Justificativa: ' || NULLIF(btrim(_justificativa), ''), '')
             ELSE '' END,
      'dp_ferias_gozos', _gozo_id, 'ferias_aviso:' || _gozo_id::text
    ) ON CONFLICT (chave) WHERE chave IS NOT NULL DO NOTHING;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_registrar_aviso(uuid, date, boolean, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_registrar_aviso(uuid, date, boolean, text, uuid) TO authenticated;

-- 5. Ciência do colaborador guarda se o aviso estava fora do prazo
CREATE OR REPLACE FUNCTION public.dp_ferias_registrar_ciencia(_gozo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gozo record;
BEGIN
  SELECT g.*, c.user_id AS col_user_id
    INTO v_gozo
  FROM public.dp_ferias_gozos g
  JOIN public.dp_colaboradores c ON c.id = g.colaborador_id
  WHERE g.id = _gozo_id;

  IF v_gozo.id IS NULL THEN
    RAISE EXCEPTION 'FERIAS_NAO_ENCONTRADA';
  END IF;
  IF v_gozo.col_user_id IS NULL OR v_gozo.col_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO';
  END IF;

  UPDATE public.dp_ferias_gozos
  SET ciente_em = COALESCE(ciente_em, now()),
      ciente_por = COALESCE(ciente_por, auth.uid()),
      ciente_fora_prazo = CASE WHEN ciente_em IS NULL THEN aviso_fora_prazo ELSE ciente_fora_prazo END
  WHERE id = _gozo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_registrar_ciencia(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_registrar_ciencia(uuid) TO authenticated;

-- 6. Portal do colaborador: dados do aviso e anexos por período de férias
CREATE OR REPLACE FUNCTION public.dp_ferias_minhas()
RETURNS TABLE (
  periodo_id uuid,
  inicio_aquisitivo date,
  fim_aquisitivo date,
  limite_concessivo date,
  dias_direito smallint,
  dias_saldo smallint,
  periodo_status text,
  faltas_informadas boolean,
  adiantamento_13 text,
  aviso_antecedencia_dias smallint,
  gozos jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col record;
BEGIN
  SELECT c.id, c.company_id, c.unidade_id INTO v_col
  FROM public.dp_colaboradores c
  WHERE c.user_id = auth.uid()
  ORDER BY c.ativo DESC NULLS LAST
  LIMIT 1;

  IF v_col.id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.inicio_aquisitivo, p.fim_aquisitivo, p.limite_concessivo,
         p.dias_direito, p.dias_saldo, p.status::text,
         p.faltas_injustificadas IS NOT NULL,
         cfg.adiantamento_13, cfg.aviso_antecedencia_dias,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'id', g.id,
                    'data_inicio', g.data_inicio,
                    'data_fim', g.data_fim,
                    'dias', g.dias,
                    'dias_abono', g.dias_abono,
                    'adiantar_13', g.adiantar_13,
                    'status', g.status,
                    'ciente_em', g.ciente_em,
                    'observacao', g.observacao,
                    'aviso_em', g.aviso_em,
                    'aviso_enviado_em', g.aviso_enviado_em,
                    'aviso_fora_prazo', g.aviso_fora_prazo,
                    'aviso_retroativo', g.aviso_retroativo,
                    'aviso_justificativa', g.aviso_justificativa,
                    'documentos', COALESCE((
                      SELECT jsonb_agg(jsonb_build_object(
                               'id', d.id,
                               'tipo', d.tipo,
                               'titulo', d.titulo,
                               'file_path', d.file_path,
                               'file_name', d.file_name,
                               'created_at', d.created_at
                             ) ORDER BY d.created_at)
                      FROM public.dp_documentos d
                      WHERE d.ferias_gozo_id = g.id
                    ), '[]'::jsonb)
                  ) ORDER BY g.data_inicio DESC)
           FROM public.dp_ferias_gozos g
           WHERE g.periodo_id = p.id
         ), '[]'::jsonb)
  FROM public.dp_ferias_periodos p
  CROSS JOIN public.dp_ferias_config(v_col.company_id, v_col.unidade_id) cfg
  WHERE p.colaborador_id = v_col.id
    AND p.controle_externo = false
  ORDER BY p.inicio_aquisitivo DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_minhas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_minhas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_ferias_minhas() TO service_role;