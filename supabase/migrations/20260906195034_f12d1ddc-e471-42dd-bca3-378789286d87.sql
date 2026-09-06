-- A. Avisos idempotentes
ALTER TABLE public.dp_notificacoes ADD COLUMN IF NOT EXISTS chave text;
CREATE UNIQUE INDEX IF NOT EXISTS dp_notificacoes_chave_uidx
  ON public.dp_notificacoes (chave) WHERE chave IS NOT NULL;

ALTER TYPE public.dp_notificacao_tipo ADD VALUE IF NOT EXISTS 'ferias_periodo_disponivel';
ALTER TYPE public.dp_notificacao_tipo ADD VALUE IF NOT EXISTS 'ferias_vencimento';
ALTER TYPE public.dp_notificacao_tipo ADD VALUE IF NOT EXISTS 'ferias_programadas';
ALTER TYPE public.dp_notificacao_tipo ADD VALUE IF NOT EXISTS 'ferias_recusadas';
ALTER TYPE public.dp_notificacao_tipo ADD VALUE IF NOT EXISTS 'ferias_alteradas';
ALTER TYPE public.dp_notificacao_tipo ADD VALUE IF NOT EXISTS 'ferias_canceladas';
ALTER TYPE public.dp_notificacao_tipo ADD VALUE IF NOT EXISTS 'ferias_proximas';
ALTER TYPE public.dp_notificacao_tipo ADD VALUE IF NOT EXISTS 'ferias_retorno';

-- B. Configuração de férias (empresa + override por unidade)
ALTER TABLE public.dp_config_dp
  ADD COLUMN IF NOT EXISTS ferias_aviso_antecedencia_dias smallint NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS ferias_adiantamento_13 text NOT NULL DEFAULT 'legal';

ALTER TABLE public.dp_config_dp DROP CONSTRAINT IF EXISTS ck_dp_config_ferias_adiantamento_13;
ALTER TABLE public.dp_config_dp
  ADD CONSTRAINT ck_dp_config_ferias_adiantamento_13
  CHECK (ferias_adiantamento_13 IN ('nao', 'legal', 'qualquer_epoca'));

ALTER TABLE public.dp_config_dp DROP CONSTRAINT IF EXISTS ck_dp_config_ferias_antecedencia;
ALTER TABLE public.dp_config_dp
  ADD CONSTRAINT ck_dp_config_ferias_antecedencia
  CHECK (ferias_aviso_antecedencia_dias BETWEEN 0 AND 365);

-- C. Férias: origem, ciência, cancelamento e contabilidade
ALTER TABLE public.dp_ferias_gozos
  ADD COLUMN IF NOT EXISTS solicitacao_id uuid REFERENCES public.dp_solicitacoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'gestor',
  ADD COLUMN IF NOT EXISTS aviso_justificativa text,
  ADD COLUMN IF NOT EXISTS cancelado_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_por uuid,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text,
  ADD COLUMN IF NOT EXISTS ciente_em timestamptz,
  ADD COLUMN IF NOT EXISTS ciente_por uuid,
  ADD COLUMN IF NOT EXISTS contabilidade_status text NOT NULL DEFAULT 'a_informar',
  ADD COLUMN IF NOT EXISTS informado_em timestamptz,
  ADD COLUMN IF NOT EXISTS informado_por uuid;

ALTER TABLE public.dp_ferias_gozos DROP CONSTRAINT IF EXISTS ck_dp_ferias_gozo_origem;
ALTER TABLE public.dp_ferias_gozos
  ADD CONSTRAINT ck_dp_ferias_gozo_origem
  CHECK (origem IN ('solicitacao_colaborador', 'gestor', 'importacao'));

ALTER TABLE public.dp_ferias_gozos DROP CONSTRAINT IF EXISTS ck_dp_ferias_gozo_contab;
ALTER TABLE public.dp_ferias_gozos
  ADD CONSTRAINT ck_dp_ferias_gozo_contab
  CHECK (contabilidade_status IN ('a_informar', 'informada'));

CREATE INDEX IF NOT EXISTS dp_ferias_gozos_periodo_datas_idx
  ON public.dp_ferias_gozos (colaborador_id, data_inicio, data_fim) WHERE status <> 'cancelado';

-- D. Detalhes da solicitação de férias (1:1 com dp_solicitacoes)
CREATE TABLE IF NOT EXISTS public.dp_ferias_solicitacao_detalhes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  solicitacao_id uuid NOT NULL UNIQUE REFERENCES public.dp_solicitacoes(id) ON DELETE CASCADE,
  periodo_id uuid NOT NULL REFERENCES public.dp_ferias_periodos(id) ON DELETE RESTRICT,
  colaborador_id uuid NOT NULL,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  dias smallint NOT NULL,
  dias_abono smallint NOT NULL DEFAULT 0,
  adiantar_13 boolean NOT NULL DEFAULT false,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.dp_ferias_solicitacao_detalhes TO authenticated;
GRANT ALL ON public.dp_ferias_solicitacao_detalhes TO service_role;

ALTER TABLE public.dp_ferias_solicitacao_detalhes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ferias_sol_det_select" ON public.dp_ferias_solicitacao_detalhes;
CREATE POLICY "ferias_sol_det_select"
ON public.dp_ferias_solicitacao_detalhes
FOR SELECT TO authenticated
USING (
  private.is_company_member(auth.uid(), company_id)
  OR private.is_company_owner(auth.uid(), company_id)
  OR EXISTS (
    SELECT 1 FROM public.dp_colaboradores c
    WHERE c.id = dp_ferias_solicitacao_detalhes.colaborador_id
      AND c.user_id = auth.uid()
  )
);

DROP TRIGGER IF EXISTS dp_ferias_sol_det_updated_at ON public.dp_ferias_solicitacao_detalhes;
CREATE TRIGGER dp_ferias_sol_det_updated_at
BEFORE UPDATE ON public.dp_ferias_solicitacao_detalhes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- E. Configuração resolvida de férias (unidade sobrepõe empresa)
CREATE OR REPLACE FUNCTION public.dp_ferias_config(_company_id uuid, _unidade_id uuid DEFAULT NULL)
RETURNS TABLE (aviso_antecedencia_dias smallint, adiantamento_13 text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(u.ferias_aviso_antecedencia_dias, e.ferias_aviso_antecedencia_dias, 60::smallint),
         COALESCE(u.ferias_adiantamento_13, e.ferias_adiantamento_13, 'legal')
  FROM (SELECT 1) x
  LEFT JOIN public.dp_config_dp e
    ON e.company_id = _company_id AND e.unidade_id IS NULL
  LEFT JOIN public.dp_config_dp u
    ON u.company_id = _company_id AND _unidade_id IS NOT NULL AND u.unidade_id = _unidade_id
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_config(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_config(uuid, uuid) TO authenticated;

-- F. Validações extras de programação (sobre as regras já aplicadas por trigger)
CREATE OR REPLACE FUNCTION public.dp_ferias_validar_programacao(
  _colaborador_id uuid,
  _periodo_id uuid,
  _data_inicio date,
  _data_fim date,
  _dias_abono integer,
  _justificativa text,
  _ignorar_gozo_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col record;
  v_periodo record;
  v_usados int;
  v_novos int;
  v_antecedencia smallint;
BEGIN
  IF _data_inicio IS NULL OR _data_fim IS NULL OR _data_fim < _data_inicio THEN
    RAISE EXCEPTION 'FERIAS_DATAS_INVALIDAS';
  END IF;

  SELECT id, company_id, unidade_id INTO v_col
  FROM public.dp_colaboradores WHERE id = _colaborador_id;
  IF v_col.id IS NULL THEN
    RAISE EXCEPTION 'FERIAS_COLABORADOR_NAO_ENCONTRADO';
  END IF;

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

  -- Sobreposição com outras férias do mesmo colaborador
  IF EXISTS (
    SELECT 1 FROM public.dp_ferias_gozos g
    WHERE g.colaborador_id = _colaborador_id
      AND g.status <> 'cancelado'
      AND (_ignorar_gozo_id IS NULL OR g.id <> _ignorar_gozo_id)
      AND daterange(g.data_inicio, g.data_fim, '[]') && daterange(_data_inicio, _data_fim, '[]')
  ) THEN
    RAISE EXCEPTION 'FERIAS_SOBREPOSICAO';
  END IF;

  -- Convocação já aceita dentro do período solicitado
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

  -- Antecedência do aviso de férias
  SELECT c.aviso_antecedencia_dias INTO v_antecedencia
  FROM public.dp_ferias_config(v_col.company_id, v_col.unidade_id) c;

  IF (_data_inicio - CURRENT_DATE) < COALESCE(v_antecedencia, 60)
     AND COALESCE(btrim(_justificativa), '') = '' THEN
    RAISE EXCEPTION 'FERIAS_AVISO_ANTECEDENCIA';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_validar_programacao(uuid, uuid, date, date, integer, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_validar_programacao(uuid, uuid, date, date, integer, text, uuid) TO authenticated;

-- G. Colaborador solicita férias
CREATE OR REPLACE FUNCTION public.dp_ferias_solicitar(
  _periodo_id uuid,
  _data_inicio date,
  _data_fim date,
  _dias_abono integer DEFAULT 0,
  _adiantar_13 boolean DEFAULT false,
  _observacao text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_periodo record;
  v_col record;
  v_solicitacao_id uuid;
  v_usados int;
  v_novos int;
BEGIN
  SELECT * INTO v_periodo FROM public.dp_ferias_periodos WHERE id = _periodo_id FOR UPDATE;
  IF v_periodo.id IS NULL THEN
    RAISE EXCEPTION 'FERIAS_PERIODO_NAO_ENCONTRADO';
  END IF;

  SELECT id, company_id, user_id INTO v_col
  FROM public.dp_colaboradores WHERE id = v_periodo.colaborador_id;

  IF v_col.user_id IS NULL OR v_col.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO';
  END IF;

  IF _data_inicio IS NULL OR _data_fim IS NULL OR _data_fim < _data_inicio THEN
    RAISE EXCEPTION 'FERIAS_DATAS_INVALIDAS';
  END IF;
  IF _data_inicio <= CURRENT_DATE THEN
    RAISE EXCEPTION 'FERIAS_DATA_PASSADA';
  END IF;

  SELECT COALESCE(SUM(g.dias + g.dias_abono), 0) INTO v_usados
  FROM public.dp_ferias_gozos g
  WHERE g.periodo_id = _periodo_id AND g.status <> 'cancelado';

  v_novos := (_data_fim - _data_inicio + 1) + COALESCE(_dias_abono, 0);
  IF v_usados + v_novos > v_periodo.dias_direito THEN
    RAISE EXCEPTION 'FERIAS_SALDO_INSUFICIENTE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.dp_ferias_solicitacao_detalhes d
    JOIN public.dp_solicitacoes s ON s.id = d.solicitacao_id
    WHERE d.colaborador_id = v_col.id
      AND s.status = 'pendente'
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

REVOKE ALL ON FUNCTION public.dp_ferias_solicitar(uuid, date, date, integer, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_solicitar(uuid, date, date, integer, boolean, text) TO authenticated;

-- H. Gestor programa férias (com ou sem solicitação prévia)
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

  INSERT INTO public.dp_ferias_gozos (
    company_id, periodo_id, colaborador_id, data_inicio, data_fim,
    dias_abono, adiantar_13, status, observacao, criado_por,
    aprovado_por, aprovado_em, origem, solicitacao_id, aviso_justificativa
  ) VALUES (
    v_periodo.company_id, _periodo_id, v_periodo.colaborador_id, _data_inicio, _data_fim,
    COALESCE(_dias_abono, 0)::smallint, COALESCE(_adiantar_13, false), 'aprovado',
    NULLIF(btrim(_observacao), ''), auth.uid(), auth.uid(), now(),
    COALESCE(_origem, 'gestor'), _solicitacao_id, NULLIF(btrim(_justificativa), '')
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
  END IF;

  RETURN v_gozo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_programar(uuid, date, date, integer, boolean, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_programar(uuid, date, date, integer, boolean, text, text, uuid, text) TO authenticated;

-- I. Aprovar / recusar solicitação
CREATE OR REPLACE FUNCTION public.dp_ferias_aprovar(
  _solicitacao_id uuid,
  _justificativa text DEFAULT NULL,
  _resposta text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sol record;
  v_det record;
  v_gozo_id uuid;
BEGIN
  SELECT * INTO v_sol FROM public.dp_solicitacoes WHERE id = _solicitacao_id FOR UPDATE;
  IF v_sol.id IS NULL OR v_sol.tipo <> 'ferias' THEN
    RAISE EXCEPTION 'FERIAS_SOLICITACAO_NAO_ENCONTRADA';
  END IF;
  IF v_sol.status <> 'pendente' THEN
    RAISE EXCEPTION 'FERIAS_SOLICITACAO_JA_RESPONDIDA';
  END IF;
  IF NOT private.is_company_admin_or_owner(auth.uid(), v_sol.company_id) THEN
    RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO';
  END IF;

  SELECT * INTO v_det FROM public.dp_ferias_solicitacao_detalhes WHERE solicitacao_id = _solicitacao_id;
  IF v_det.id IS NULL THEN
    RAISE EXCEPTION 'FERIAS_SOLICITACAO_SEM_DETALHES';
  END IF;

  v_gozo_id := public.dp_ferias_programar(
    v_det.periodo_id, v_det.data_inicio, v_det.data_fim, v_det.dias_abono,
    v_det.adiantar_13, v_det.observacao, _justificativa, _solicitacao_id,
    'solicitacao_colaborador'
  );

  UPDATE public.dp_solicitacoes
  SET status = 'aprovada',
      resposta_admin = NULLIF(btrim(_resposta), ''),
      respondido_por = auth.uid(),
      respondido_em = now()
  WHERE id = _solicitacao_id;

  RETURN v_gozo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_aprovar(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_aprovar(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.dp_ferias_recusar(_solicitacao_id uuid, _motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sol record;
BEGIN
  IF COALESCE(btrim(_motivo), '') = '' THEN
    RAISE EXCEPTION 'FERIAS_MOTIVO_OBRIGATORIO';
  END IF;

  SELECT * INTO v_sol FROM public.dp_solicitacoes WHERE id = _solicitacao_id FOR UPDATE;
  IF v_sol.id IS NULL OR v_sol.tipo <> 'ferias' THEN
    RAISE EXCEPTION 'FERIAS_SOLICITACAO_NAO_ENCONTRADA';
  END IF;
  IF v_sol.status <> 'pendente' THEN
    RAISE EXCEPTION 'FERIAS_SOLICITACAO_JA_RESPONDIDA';
  END IF;
  IF NOT private.is_company_admin_or_owner(auth.uid(), v_sol.company_id) THEN
    RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO';
  END IF;

  UPDATE public.dp_solicitacoes
  SET status = 'recusada',
      resposta_admin = btrim(_motivo),
      respondido_por = auth.uid(),
      respondido_em = now()
  WHERE id = _solicitacao_id;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_recusar(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_recusar(uuid, text) TO authenticated;

-- J. Cancelar sem perder histórico
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

  UPDATE public.dp_ferias_gozos
  SET status = 'cancelado',
      cancelado_em = now(),
      cancelado_por = auth.uid(),
      motivo_cancelamento = btrim(_motivo)
  WHERE id = _gozo_id;

  SELECT id, user_id INTO v_col FROM public.dp_colaboradores WHERE id = v_gozo.colaborador_id;
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

REVOKE ALL ON FUNCTION public.dp_ferias_cancelar(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_cancelar(uuid, text) TO authenticated;

-- K. Ciência do colaborador
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
      ciente_por = COALESCE(ciente_por, auth.uid())
  WHERE id = _gozo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_registrar_ciencia(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_registrar_ciencia(uuid) TO authenticated;

-- L. Minhas férias (portal do colaborador)
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
                    'observacao', g.observacao
                  ) ORDER BY g.data_inicio DESC)
           FROM public.dp_ferias_gozos g
           WHERE g.periodo_id = p.id
         ), '[]'::jsonb)
  FROM public.dp_ferias_periodos p
  CROSS JOIN public.dp_ferias_config(v_col.company_id, v_col.unidade_id) cfg
  WHERE p.colaborador_id = v_col.id
  ORDER BY p.inicio_aquisitivo DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_minhas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_minhas() TO authenticated;

-- M. Materialização de status e avisos de prazo/retorno (idempotente)
CREATE OR REPLACE FUNCTION public.dp_ferias_materializar_status(_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alterados int := 0;
  v_n int;
BEGIN
  IF NOT (
    private.is_company_member(auth.uid(), _company_id)
    OR private.is_company_owner(auth.uid(), _company_id)
  ) THEN
    RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO';
  END IF;

  UPDATE public.dp_ferias_gozos g
  SET status = 'em_gozo'
  WHERE g.company_id = _company_id
    AND g.status = 'aprovado'
    AND CURRENT_DATE BETWEEN g.data_inicio AND g.data_fim;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_alterados := v_alterados + v_n;

  UPDATE public.dp_ferias_gozos g
  SET status = 'concluido'
  WHERE g.company_id = _company_id
    AND g.status IN ('aprovado', 'em_gozo')
    AND CURRENT_DATE > g.data_fim;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_alterados := v_alterados + v_n;

  -- Aviso de prazo de concessão a 30 dias (uma vez por período)
  INSERT INTO public.dp_notificacoes (
    company_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id, para_admins, chave
  )
  SELECT p.company_id, p.colaborador_id, 'ferias_vencimento',
         c.nome || ' tem férias pendentes com prazo próximo',
         p.dias_saldo || ' dias de férias pendentes e o prazo termina em '
           || to_char(p.limite_concessivo, 'DD/MM/YYYY'),
         'dp_ferias_periodos', p.id, true,
         'ferias_vencimento:' || p.id::text
  FROM public.dp_ferias_periodos p
  JOIN public.dp_colaboradores c ON c.id = p.colaborador_id
  WHERE p.company_id = _company_id
    AND p.dias_saldo > 0
    AND p.status NOT IN ('concluido')
    AND p.limite_concessivo - CURRENT_DATE BETWEEN 0 AND 30
  ON CONFLICT (chave) WHERE chave IS NOT NULL DO NOTHING;

  -- Retorno das férias amanhã
  INSERT INTO public.dp_notificacoes (
    company_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id, para_admins, chave
  )
  SELECT g.company_id, g.colaborador_id, 'ferias_retorno',
         c.nome || ' retorna das férias amanhã',
         'Férias de ' || to_char(g.data_inicio, 'DD/MM') || ' a ' || to_char(g.data_fim, 'DD/MM'),
         'dp_ferias_gozos', g.id, true,
         'ferias_retorno:' || g.id::text
  FROM public.dp_ferias_gozos g
  JOIN public.dp_colaboradores c ON c.id = g.colaborador_id
  WHERE g.company_id = _company_id
    AND g.status IN ('aprovado', 'em_gozo')
    AND g.data_fim = CURRENT_DATE
  ON CONFLICT (chave) WHERE chave IS NOT NULL DO NOTHING;

  RETURN v_alterados;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_materializar_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_materializar_status(uuid) TO authenticated;