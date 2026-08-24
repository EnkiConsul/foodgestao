-- ============================================================
-- Convocações · público selecionado + horário geral (nova tela única)
-- ============================================================

-- 1) Grupo: horário geral opcional e modo de público (técnico, invisível na UI)
ALTER TABLE public.dp_convocacao_grupos
  ADD COLUMN IF NOT EXISTS horario_geral_entrada time,
  ADD COLUMN IF NOT EXISTS horario_geral_saida time,
  ADD COLUMN IF NOT EXISTS horario_geral_intervalo_minutos integer,
  ADD COLUMN IF NOT EXISTS horario_geral_termina_no_dia_seguinte boolean,
  ADD COLUMN IF NOT EXISTS publico_modo text NOT NULL DEFAULT 'legacy_auto';

ALTER TABLE public.dp_convocacao_grupos
  DROP CONSTRAINT IF EXISTS ck_dp_conv_grupos_publico_modo;
ALTER TABLE public.dp_convocacao_grupos
  ADD CONSTRAINT ck_dp_conv_grupos_publico_modo
  CHECK (publico_modo IN ('legacy_auto', 'selecionado'));

ALTER TABLE public.dp_convocacao_grupos
  DROP CONSTRAINT IF EXISTS ck_dp_conv_grupos_horario_geral;
ALTER TABLE public.dp_convocacao_grupos
  ADD CONSTRAINT ck_dp_conv_grupos_horario_geral
  CHECK (
    (horario_geral_entrada IS NULL AND horario_geral_saida IS NULL)
    OR (horario_geral_entrada IS NOT NULL AND horario_geral_saida IS NOT NULL)
  );

ALTER TABLE public.dp_convocacao_grupos
  DROP CONSTRAINT IF EXISTS ck_dp_conv_grupos_horario_geral_intervalo;
ALTER TABLE public.dp_convocacao_grupos
  ADD CONSTRAINT ck_dp_conv_grupos_horario_geral_intervalo
  CHECK (horario_geral_intervalo_minutos IS NULL OR horario_geral_intervalo_minutos >= 0);

-- 2) Unicidade necessária para FK composta tenant-safe (ocorrência pertence ao grupo)
ALTER TABLE public.dp_convocacao_ocorrencias
  DROP CONSTRAINT IF EXISTS uq_dp_conv_ocor_id_grupo_company;
ALTER TABLE public.dp_convocacao_ocorrencias
  ADD CONSTRAINT uq_dp_conv_ocor_id_grupo_company UNIQUE (id, grupo_id, company_id);

-- 3) Destinatários (modelo normalizado, soft delete, override por ocorrência)
CREATE TABLE IF NOT EXISTS public.dp_convocacao_destinatarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  grupo_id uuid NOT NULL,
  ocorrencia_id uuid,
  colaborador_id uuid NOT NULL,
  entrada time,
  saida time,
  intervalo_minutos integer,
  termina_no_dia_seguinte boolean,
  removido_em timestamptz,
  removido_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT fk_dp_conv_dest_grupo
    FOREIGN KEY (grupo_id, company_id)
    REFERENCES public.dp_convocacao_grupos (id, company_id) ON DELETE CASCADE,
  CONSTRAINT fk_dp_conv_dest_ocorrencia
    FOREIGN KEY (ocorrencia_id, grupo_id, company_id)
    REFERENCES public.dp_convocacao_ocorrencias (id, grupo_id, company_id) ON DELETE CASCADE,
  CONSTRAINT fk_dp_conv_dest_colaborador
    FOREIGN KEY (colaborador_id, company_id)
    REFERENCES public.dp_colaboradores (id, company_id) ON DELETE CASCADE,
  CONSTRAINT ck_dp_conv_dest_horario
    CHECK ((entrada IS NULL AND saida IS NULL) OR (entrada IS NOT NULL AND saida IS NOT NULL)),
  CONSTRAINT ck_dp_conv_dest_intervalo
    CHECK (intervalo_minutos IS NULL OR intervalo_minutos >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_dp_conv_dest_global
  ON public.dp_convocacao_destinatarios (grupo_id, colaborador_id)
  WHERE ocorrencia_id IS NULL AND removido_em IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_dp_conv_dest_override
  ON public.dp_convocacao_destinatarios (ocorrencia_id, colaborador_id)
  WHERE ocorrencia_id IS NOT NULL AND removido_em IS NULL;

CREATE INDEX IF NOT EXISTS ix_dp_conv_dest_grupo
  ON public.dp_convocacao_destinatarios (company_id, grupo_id)
  WHERE removido_em IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_convocacao_destinatarios TO authenticated;
GRANT ALL ON public.dp_convocacao_destinatarios TO service_role;

ALTER TABLE public.dp_convocacao_destinatarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dp_conv_dest_select_admin ON public.dp_convocacao_destinatarios;
CREATE POLICY dp_conv_dest_select_admin
  ON public.dp_convocacao_destinatarios FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

CREATE OR REPLACE FUNCTION public.dp_conv_dest_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dp_conv_dest_touch ON public.dp_convocacao_destinatarios;
CREATE TRIGGER trg_dp_conv_dest_touch
  BEFORE UPDATE ON public.dp_convocacao_destinatarios
  FOR EACH ROW EXECUTE FUNCTION public.dp_conv_dest_touch();

-- 4) Janela da necessidade sugerida pelos fixos do mesmo cargo/unidade/dia
CREATE OR REPLACE FUNCTION public.dp_convocacao_necessidade_sugerida(
  _company_id uuid, _unidade_id uuid, _cargo_id uuid, _data date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_janelas jsonb := '[]'::jsonb;
  v_top record;
  v_qtd integer;
BEGIN
  IF _company_id IS NULL OR _cargo_id IS NULL OR _data IS NULL THEN
    RETURN jsonb_build_object('sugerido', NULL, 'ambiguo', false, 'alternativas', '[]'::jsonb);
  END IF;
  IF NOT private.is_company_admin_or_owner(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso negado.' USING ERRCODE = '42501';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS tmp_conv_janelas (
    entrada time, saida time, intervalo_minutos integer,
    termina_no_dia_seguinte boolean, quantidade integer
  ) ON COMMIT DROP;
  DELETE FROM tmp_conv_janelas;

  INSERT INTO tmp_conv_janelas
  SELECT j.entrada, j.saida, j.intervalo_minutos, j.vira, count(*)::int
    FROM (
      -- escala efetivamente programada no dia
      SELECT ei.entrada, ei.saida,
             COALESCE(ei.intervalo_minutos, 0) AS intervalo_minutos,
             COALESCE(ei.termina_no_dia_seguinte, false) AS vira
        FROM public.dp_escala_itens ei
        JOIN public.dp_colaboradores c
          ON c.id = ei.colaborador_id AND c.company_id = ei.company_id
       WHERE ei.company_id = _company_id
         AND ei.data = _data
         AND ei.tipo::text <> 'folga'
         AND ei.entrada IS NOT NULL AND ei.saida IS NOT NULL
         AND c.cargo_id = _cargo_id
         AND (_unidade_id IS NULL OR c.unidade_id = _unidade_id)
         AND c.ativo IS NOT FALSE
         AND NOT public.dp_regime_convocavel(c.regime)
      UNION ALL
      -- configuração de trabalho vigente dos fixos para o dia da semana
      SELECT d.entrada, d.saida,
             COALESCE(d.intervalo_minutos, 0) AS intervalo_minutos,
             false AS vira
        FROM public.dp_colaborador_config_trabalho ct
        JOIN public.dp_colaborador_config_dias d
          ON d.config_id = ct.id AND d.company_id = ct.company_id
        JOIN public.dp_colaboradores c
          ON c.id = ct.colaborador_id AND c.company_id = ct.company_id
       WHERE ct.company_id = _company_id
         AND d.dow = EXTRACT(DOW FROM _data)::int
         AND d.trabalha IS TRUE
         AND d.entrada IS NOT NULL AND d.saida IS NOT NULL
         AND (ct.vigencia_inicio IS NULL OR ct.vigencia_inicio <= _data)
         AND (ct.vigencia_fim IS NULL OR ct.vigencia_fim >= _data)
         AND c.cargo_id = _cargo_id
         AND (_unidade_id IS NULL OR c.unidade_id = _unidade_id)
         AND c.ativo IS NOT FALSE
         AND NOT public.dp_regime_convocavel(c.regime)
    ) j
   GROUP BY j.entrada, j.saida, j.intervalo_minutos, j.vira;

  SELECT count(*) INTO v_qtd FROM tmp_conv_janelas;
  IF COALESCE(v_qtd, 0) = 0 THEN
    RETURN jsonb_build_object('sugerido', NULL, 'ambiguo', false, 'alternativas', '[]'::jsonb);
  END IF;

  SELECT * INTO v_top
    FROM tmp_conv_janelas
   ORDER BY quantidade DESC, entrada, saida
   LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'entrada', t.entrada, 'saida', t.saida,
           'intervalo_minutos', t.intervalo_minutos,
           'termina_no_dia_seguinte', t.termina_no_dia_seguinte,
           'quantidade', t.quantidade)
         ORDER BY t.quantidade DESC, t.entrada), '[]'::jsonb)
    INTO v_janelas
    FROM tmp_conv_janelas t;

  RETURN jsonb_build_object(
    'sugerido', jsonb_build_object(
      'entrada', v_top.entrada, 'saida', v_top.saida,
      'intervalo_minutos', v_top.intervalo_minutos,
      'termina_no_dia_seguinte', v_top.termina_no_dia_seguinte,
      'quantidade', v_top.quantidade),
    'ambiguo', (SELECT count(*) > 1 FROM tmp_conv_janelas WHERE quantidade = v_top.quantidade),
    'alternativas', v_janelas);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_convocacao_necessidade_sugerida(uuid, uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_necessidade_sugerida(uuid, uuid, uuid, date) TO authenticated;

-- 5) Definir o conjunto de destinatários globais do grupo (idempotente, sem DELETE)
CREATE OR REPLACE FUNCTION public.dp_convocacao_definir_destinatarios(
  p_grupo_id uuid, p_colaboradores uuid[], p_expected_updated_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_company uuid;
  v_grupo public.dp_convocacao_grupos;
  v_ids uuid[];
  v_bad uuid;
  v_ativos jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: autenticação obrigatória.' USING ERRCODE = '42501';
  END IF;
  IF p_grupo_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: identificador do grupo é obrigatório.' USING ERRCODE = '22023';
  END IF;

  SELECT company_id INTO v_company FROM public.dp_convocacao_grupos WHERE id = p_grupo_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: grupo inexistente.' USING ERRCODE = '23503';
  END IF;
  v_uid := public.dp_convocacao_exige_admin(v_company);

  SELECT * INTO v_grupo
    FROM public.dp_convocacao_grupos
   WHERE id = p_grupo_id AND company_id = v_company
   FOR UPDATE;

  IF v_grupo.status <> 'rascunho' THEN
    RAISE EXCEPTION 'INVALID_STATE: somente rascunhos aceitam mudança de destinatários.' USING ERRCODE = '22023';
  END IF;
  IF p_expected_updated_at IS NULL OR v_grupo.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'CONCURRENT_MODIFICATION: o grupo foi alterado por outra pessoa.' USING ERRCODE = '40001';
  END IF;

  SELECT ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_colaboradores, '{}'::uuid[])) AS x WHERE x IS NOT NULL)
    INTO v_ids;

  SELECT c.id INTO v_bad
    FROM unnest(v_ids) AS t(id)
    LEFT JOIN public.dp_colaboradores c
      ON c.id = t.id AND c.company_id = v_company
   WHERE c.id IS NULL
      OR c.ativo IS FALSE
      OR NOT public.dp_regime_convocavel(c.regime)
      OR c.unidade_id IS NULL
      OR c.unidade_id <> v_grupo.unidade_id
   LIMIT 1;

  IF EXISTS (
    SELECT 1 FROM unnest(v_ids) AS t(id)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.dp_colaboradores c
        WHERE c.id = t.id AND c.company_id = v_company
          AND c.ativo IS NOT FALSE
          AND public.dp_regime_convocavel(c.regime)
          AND c.unidade_id IS NOT NULL
          AND c.unidade_id = v_grupo.unidade_id)
  ) THEN
    RAISE EXCEPTION 'INVALID_RECIPIENT: há pessoa fora da empresa, inativa, de outra unidade ou sem vínculo convocável.'
      USING ERRCODE = '22023';
  END IF;

  -- soft remove do que saiu (global e overrides do grupo)
  UPDATE public.dp_convocacao_destinatarios d
     SET removido_em = now(), removido_por = v_uid
   WHERE d.grupo_id = v_grupo.id
     AND d.company_id = v_company
     AND d.removido_em IS NULL
     AND NOT (d.colaborador_id = ANY (v_ids));

  -- insere o que entrou; mantém iguais
  INSERT INTO public.dp_convocacao_destinatarios(
    company_id, grupo_id, ocorrencia_id, colaborador_id, created_by)
  SELECT v_company, v_grupo.id, NULL, t.id, v_uid
    FROM unnest(v_ids) AS t(id)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.dp_convocacao_destinatarios d
      WHERE d.grupo_id = v_grupo.id AND d.company_id = v_company
        AND d.ocorrencia_id IS NULL AND d.removido_em IS NULL
        AND d.colaborador_id = t.id);

  UPDATE public.dp_convocacao_grupos
     SET publico_modo = 'selecionado', updated_at = now()
   WHERE id = v_grupo.id AND company_id = v_company
  RETURNING * INTO v_grupo;

  PERFORM public.dp_convocacao_log_evento(
    v_company, v_grupo.id, NULL, 'destinatarios_definidos',
    jsonb_build_object('quantidade', COALESCE(array_length(v_ids, 1), 0)));

  SELECT COALESCE(jsonb_agg(d.colaborador_id ORDER BY d.colaborador_id), '[]'::jsonb)
    INTO v_ativos
    FROM public.dp_convocacao_destinatarios d
   WHERE d.grupo_id = v_grupo.id AND d.company_id = v_company
     AND d.ocorrencia_id IS NULL AND d.removido_em IS NULL;

  RETURN jsonb_build_object(
    'grupo_id', v_grupo.id,
    'updated_at', v_grupo.updated_at,
    'publico_modo', v_grupo.publico_modo,
    'destinatarios', v_ativos);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_convocacao_definir_destinatarios(uuid, uuid[], timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_definir_destinatarios(uuid, uuid[], timestamptz) TO authenticated;

-- 6) Override de horário por destinatário/ocorrência (remoção lógica com NULLs)
CREATE OR REPLACE FUNCTION public.dp_convocacao_definir_override_destinatario(
  p_ocorrencia_id uuid,
  p_colaborador_id uuid,
  p_entrada time,
  p_saida time,
  p_intervalo_minutos integer,
  p_termina_no_dia_seguinte boolean,
  p_expected_updated_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_company uuid;
  v_ocor public.dp_convocacao_ocorrencias;
  v_grupo public.dp_convocacao_grupos;
  v_row public.dp_convocacao_destinatarios;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: autenticação obrigatória.' USING ERRCODE = '42501';
  END IF;
  IF p_ocorrencia_id IS NULL OR p_colaborador_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: ocorrência e colaborador são obrigatórios.' USING ERRCODE = '22023';
  END IF;

  SELECT company_id INTO v_company FROM public.dp_convocacao_ocorrencias WHERE id = p_ocorrencia_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: necessidade inexistente.' USING ERRCODE = '23503';
  END IF;
  v_uid := public.dp_convocacao_exige_admin(v_company);

  SELECT * INTO v_ocor FROM public.dp_convocacao_ocorrencias
   WHERE id = p_ocorrencia_id AND company_id = v_company FOR UPDATE;

  SELECT * INTO v_grupo FROM public.dp_convocacao_grupos
   WHERE id = v_ocor.grupo_id AND company_id = v_company FOR UPDATE;

  IF v_grupo.status <> 'rascunho' OR v_ocor.status <> 'rascunho' THEN
    RAISE EXCEPTION 'INVALID_STATE: somente rascunhos aceitam override de horário.' USING ERRCODE = '22023';
  END IF;
  IF p_expected_updated_at IS NULL OR v_grupo.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'CONCURRENT_MODIFICATION: o grupo foi alterado por outra pessoa.' USING ERRCODE = '40001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.dp_convocacao_destinatarios d
     WHERE d.grupo_id = v_grupo.id AND d.company_id = v_company
       AND d.ocorrencia_id IS NULL AND d.removido_em IS NULL
       AND d.colaborador_id = p_colaborador_id
  ) THEN
    RAISE EXCEPTION 'INVALID_RECIPIENT: a pessoa não está no conjunto selecionado do grupo.' USING ERRCODE = '22023';
  END IF;

  IF (p_entrada IS NULL) <> (p_saida IS NULL) THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe entrada e saída juntas.' USING ERRCODE = '22023';
  END IF;
  IF p_intervalo_minutos IS NOT NULL AND p_intervalo_minutos < 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: intervalo não pode ser negativo.' USING ERRCODE = '22023';
  END IF;

  -- remoção lógica do override: horário nulo apaga a linha de override
  IF p_entrada IS NULL THEN
    UPDATE public.dp_convocacao_destinatarios
       SET removido_em = now(), removido_por = v_uid
     WHERE ocorrencia_id = p_ocorrencia_id AND company_id = v_company
       AND colaborador_id = p_colaborador_id AND removido_em IS NULL;
  ELSE
    UPDATE public.dp_convocacao_destinatarios
       SET entrada = p_entrada, saida = p_saida,
           intervalo_minutos = COALESCE(p_intervalo_minutos, 0),
           termina_no_dia_seguinte = COALESCE(p_termina_no_dia_seguinte, false)
     WHERE ocorrencia_id = p_ocorrencia_id AND company_id = v_company
       AND colaborador_id = p_colaborador_id AND removido_em IS NULL
    RETURNING * INTO v_row;

    IF v_row.id IS NULL THEN
      INSERT INTO public.dp_convocacao_destinatarios(
        company_id, grupo_id, ocorrencia_id, colaborador_id,
        entrada, saida, intervalo_minutos, termina_no_dia_seguinte, created_by)
      VALUES (v_company, v_grupo.id, p_ocorrencia_id, p_colaborador_id,
        p_entrada, p_saida, COALESCE(p_intervalo_minutos, 0),
        COALESCE(p_termina_no_dia_seguinte, false), v_uid);
    END IF;
  END IF;

  UPDATE public.dp_convocacao_grupos
     SET updated_at = now()
   WHERE id = v_grupo.id AND company_id = v_company
  RETURNING * INTO v_grupo;

  RETURN jsonb_build_object(
    'ocorrencia_id', p_ocorrencia_id,
    'colaborador_id', p_colaborador_id,
    'grupo_updated_at', v_grupo.updated_at,
    'removido', p_entrada IS NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_convocacao_definir_override_destinatario(uuid, uuid, time, time, integer, boolean, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_definir_override_destinatario(uuid, uuid, time, time, integer, boolean, timestamptz) TO authenticated;

-- 7) Horário efetivo por candidato: override > avaliação (que já cobre geral/jornada)
CREATE OR REPLACE FUNCTION public.dp_convocacao_horario_efetivo(
  _ocorrencia_id uuid, _colaborador_id uuid, _aval jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_o public.dp_convocacao_ocorrencias;
  v_ov public.dp_convocacao_destinatarios;
  v_n_ini integer; v_n_fim integer; v_o_ini integer; v_o_fim integer;
  v_vira boolean; v_carga numeric; v_rem jsonb;
BEGIN
  IF (_aval->>'apto')::boolean IS NOT TRUE THEN
    RETURN _aval;
  END IF;

  SELECT * INTO v_ov
    FROM public.dp_convocacao_destinatarios
   WHERE ocorrencia_id = _ocorrencia_id
     AND colaborador_id = _colaborador_id
     AND removido_em IS NULL
     AND entrada IS NOT NULL AND saida IS NOT NULL
   LIMIT 1;

  IF v_ov.id IS NULL THEN
    RETURN _aval;
  END IF;

  SELECT * INTO v_o FROM public.dp_convocacao_ocorrencias WHERE id = _ocorrencia_id;

  v_n_ini := EXTRACT(HOUR FROM v_o.necessidade_entrada)::int * 60 + EXTRACT(MINUTE FROM v_o.necessidade_entrada)::int;
  v_n_fim := EXTRACT(HOUR FROM v_o.necessidade_saida)::int * 60 + EXTRACT(MINUTE FROM v_o.necessidade_saida)::int;
  IF COALESCE(v_o.necessidade_termina_no_dia_seguinte, false) OR v_n_fim <= v_n_ini THEN
    v_n_fim := v_n_fim + 1440;
  END IF;

  v_vira := COALESCE(v_ov.termina_no_dia_seguinte, false);
  v_o_ini := EXTRACT(HOUR FROM v_ov.entrada)::int * 60 + EXTRACT(MINUTE FROM v_ov.entrada)::int;
  v_o_fim := EXTRACT(HOUR FROM v_ov.saida)::int * 60 + EXTRACT(MINUTE FROM v_ov.saida)::int;
  IF v_vira OR v_o_fim <= v_o_ini THEN
    v_o_fim := v_o_fim + 1440;
    v_vira := true;
  END IF;

  IF NOT (v_o_ini <= v_n_ini AND v_o_fim >= v_n_fim) THEN
    RETURN jsonb_build_object('apto', false, 'motivo', 'COMPATIBILIDADE_INCOMPATIVEL');
  END IF;

  v_carga := round(((v_o_fim - v_o_ini) - GREATEST(COALESCE(v_ov.intervalo_minutos, 0), 0))::numeric / 60.0, 2);
  IF v_carga <= 0 THEN
    RETURN jsonb_build_object('apto', false, 'motivo', 'CARGA_INVALIDA');
  END IF;

  v_rem := public.dp_convocacao_remuneracao_snapshot(_colaborador_id, v_carga);
  IF (v_rem->>'elegivel')::boolean IS NOT TRUE THEN
    RETURN jsonb_build_object('apto', false, 'motivo', v_rem->>'motivo');
  END IF;

  RETURN jsonb_build_object(
    'apto', true, 'motivo', NULL,
    'entrada', v_ov.entrada, 'saida', v_ov.saida,
    'intervalo_minutos', COALESCE(v_ov.intervalo_minutos, 0),
    'termina_no_dia_seguinte', v_vira,
    'carga_prevista_horas', v_carga,
    'compatibilidade', 'integral',
    'regime_snapshot', _aval->>'regime_snapshot',
    'remuneracao_snapshot', v_rem - 'elegivel');
END;
$$;

REVOKE ALL ON FUNCTION public.dp_convocacao_horario_efetivo(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_horario_efetivo(uuid, uuid, jsonb) TO authenticated;

-- 8) Publicação: público restrito fail closed + horário efetivo com override
CREATE OR REPLACE FUNCTION public.dp_convocacao_publicar_grupo(
  p_grupo_id uuid, p_expected_updated_at timestamptz, p_confirmacoes jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_company uuid;
  v_grupo public.dp_convocacao_grupos;
  v_cfg record;
  v_tz text;
  v_agora timestamptz := now();
  v_ocor public.dp_convocacao_ocorrencias;
  v_aval jsonb;
  v_nec_inicio timestamptz;
  v_off_inicio timestamptz;
  v_off_fim timestamptz;
  v_antecedencia integer;
  v_fora boolean;
  v_conf jsonb;
  v_just text;
  v_prazo_base timestamptz;
  v_ofertas integer;
  v_total_ofertas integer := 0;
  v_diag jsonb := '[]'::jsonb;
  v_usados jsonb := '{}'::jsonb;
  v_chave text;
  v_cand record;
  v_pend integer;
  v_publicadas integer;
  v_sem_oferta integer;
  v_restrito boolean;
  v_dest_total integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: autenticação obrigatória.' USING ERRCODE = '42501';
  END IF;
  IF p_grupo_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: identificador do grupo é obrigatório.' USING ERRCODE = '22023';
  END IF;

  SELECT company_id INTO v_company FROM public.dp_convocacao_grupos WHERE id = p_grupo_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: grupo inexistente.' USING ERRCODE = '23503';
  END IF;

  v_uid := public.dp_convocacao_exige_admin(v_company);

  SELECT * INTO v_grupo
    FROM public.dp_convocacao_grupos
   WHERE id = p_grupo_id AND company_id = v_company
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: grupo inexistente.' USING ERRCODE = '23503';
  END IF;

  IF v_grupo.status = 'publicado' THEN
    SELECT count(*) FILTER (WHERE o.status = 'rascunho'),
           count(*) FILTER (WHERE o.status IN ('publicada','preenchida')),
           count(*) FILTER (WHERE o.status = 'publicada'
                              AND NOT EXISTS (SELECT 1 FROM public.dp_convocacoes c WHERE c.ocorrencia_id = o.id))
      INTO v_pend, v_publicadas, v_sem_oferta
      FROM public.dp_convocacao_ocorrencias o
     WHERE o.grupo_id = v_grupo.id AND o.company_id = v_company;

    IF COALESCE(v_pend, 0) > 0 OR COALESCE(v_sem_oferta, 0) > 0 THEN
      RAISE EXCEPTION 'PUBLICATION_INCONSISTENT: o grupo está publicado com necessidades incoerentes.' USING ERRCODE = '22023';
    END IF;

    SELECT count(*) INTO v_total_ofertas
      FROM public.dp_convocacoes c
      JOIN public.dp_convocacao_ocorrencias o ON o.id = c.ocorrencia_id
     WHERE o.grupo_id = v_grupo.id AND o.company_id = v_company;

    RETURN jsonb_build_object('grupo_id', v_grupo.id, 'status', v_grupo.status,
      'ocorrencias_publicadas', v_publicadas, 'ofertas', v_total_ofertas,
      'idempotente', true, 'diagnostico', '[]'::jsonb);
  END IF;

  IF v_grupo.status <> 'rascunho' THEN
    RAISE EXCEPTION 'INVALID_STATE: somente grupos em rascunho podem ser publicados.' USING ERRCODE = '22023';
  END IF;

  IF p_expected_updated_at IS NULL OR v_grupo.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'CONCURRENT_MODIFICATION: o grupo foi alterado por outra pessoa. Recarregue e tente novamente.' USING ERRCODE = '40001';
  END IF;

  v_restrito := COALESCE(v_grupo.publico_modo, 'legacy_auto') = 'selecionado';

  -- FAIL CLOSED: público selecionado sem destinatário ativo NUNCA vira envio geral.
  IF v_restrito THEN
    SELECT count(*) INTO v_dest_total
      FROM public.dp_convocacao_destinatarios d
     WHERE d.grupo_id = v_grupo.id AND d.company_id = v_company
       AND d.ocorrencia_id IS NULL AND d.removido_em IS NULL;
    IF COALESCE(v_dest_total, 0) = 0 THEN
      RAISE EXCEPTION 'PUBLICATION_NO_RECIPIENTS: nenhum destinatário selecionado para esta convocação.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  v_tz := public.dp_convocacao_timezone(v_company, v_grupo.unidade_id);
  SELECT * INTO v_cfg FROM public.dp_convocacao_config_resolvida(v_company, v_grupo.unidade_id) LIMIT 1;

  IF v_grupo.modalidade <> 'individual' AND COALESCE(v_cfg.permite_oferta_aberta, true) IS FALSE AND NOT v_restrito THEN
    RAISE EXCEPTION 'OPEN_CALL_NOT_ALLOWED: as regras atuais não permitem convocação aberta nesta unidade.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.dp_convocacao_ocorrencias o
     WHERE o.grupo_id = v_grupo.id AND o.company_id = v_company AND o.status = 'rascunho'
  ) THEN
    RAISE EXCEPTION 'INVALID_STATE: o grupo não possui necessidades em rascunho para publicar.' USING ERRCODE = '22023';
  END IF;

  FOR v_ocor IN
    SELECT * FROM public.dp_convocacao_ocorrencias o
     WHERE o.grupo_id = v_grupo.id AND o.company_id = v_company AND o.status = 'rascunho'
     ORDER BY o.data, o.necessidade_entrada, o.necessidade_saida, o.cargo_id, o.id
     FOR UPDATE
  LOOP
    v_nec_inicio := ((v_ocor.data + v_ocor.necessidade_entrada) AT TIME ZONE v_tz);

    IF v_nec_inicio <= v_agora THEN
      RAISE EXCEPTION 'OCCURRENCE_ALREADY_STARTED: a necessidade de % já começou e não pode ser publicada.', v_ocor.data
        USING ERRCODE = '22023';
    END IF;

    v_antecedencia := GREATEST(0, (v_ocor.data - (v_agora AT TIME ZONE v_tz)::date));
    v_fora := v_antecedencia < COALESCE(v_cfg.antecedencia_minima_dias, 3);

    v_conf := NULL;
    v_just := NULL;
    IF v_fora THEN
      SELECT c INTO v_conf
        FROM jsonb_array_elements(COALESCE(p_confirmacoes, '[]'::jsonb)) AS t(c)
       WHERE (c->>'ocorrencia_id')::uuid = v_ocor.id
       LIMIT 1;

      IF v_conf IS NULL OR COALESCE((v_conf->>'confirmado')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'ANTECEDENCE_CONFIRMATION_REQUIRED: a necessidade de % está abaixo da antecedência mínima e exige confirmação consciente.', v_ocor.data
          USING ERRCODE = '22023';
      END IF;

      v_just := NULLIF(btrim(COALESCE(v_conf->>'justificativa', '')), '');
      IF COALESCE(v_cfg.exige_justificativa_excecao, true) AND v_just IS NULL THEN
        RAISE EXCEPTION 'ANTECEDENCE_JUSTIFICATION_REQUIRED: a regra atual exige justificativa para publicar % fora da antecedência.', v_ocor.data
          USING ERRCODE = '22023';
      END IF;
    END IF;

    v_prazo_base := public.dp_adicionar_dias_uteis(v_agora, COALESCE(v_cfg.prazo_resposta_dias_uteis, 1), v_tz);
    v_ofertas := 0;

    IF v_grupo.modalidade = 'individual' THEN
      IF v_ocor.colaborador_alvo_id IS NULL OR v_ocor.vagas <> 1 THEN
        RAISE EXCEPTION 'INVALID_STATE: convocação individual exige uma pessoa e uma vaga na necessidade de %.', v_ocor.data
          USING ERRCODE = '22023';
      END IF;

      IF v_restrito AND NOT EXISTS (
        SELECT 1 FROM public.dp_convocacao_destinatarios d
         WHERE d.grupo_id = v_grupo.id AND d.company_id = v_company
           AND d.ocorrencia_id IS NULL AND d.removido_em IS NULL
           AND d.colaborador_id = v_ocor.colaborador_alvo_id
      ) THEN
        RAISE EXCEPTION 'PUBLICATION_NO_RECIPIENTS: a pessoa da necessidade de % não está entre os destinatários selecionados.', v_ocor.data
          USING ERRCODE = '22023';
      END IF;

      v_chave := v_ocor.data::text || '|' || v_ocor.colaborador_alvo_id::text;
      IF v_usados ? v_chave THEN
        RAISE EXCEPTION 'PUBLICATION_OPTION_A: a pessoa já foi convocada em outra necessidade do dia %.', v_ocor.data
          USING ERRCODE = '22023';
      END IF;

      v_aval := public.dp_convocacao_avaliar_candidato(v_ocor.colaborador_alvo_id, v_ocor.id, NULL, true);
      v_aval := public.dp_convocacao_horario_efetivo(v_ocor.id, v_ocor.colaborador_alvo_id, v_aval);
      IF (v_aval->>'apto')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'PUBLICATION_TARGET_INELIGIBLE: % (necessidade de %).', COALESCE(v_aval->>'motivo', 'INELEGIVEL'), v_ocor.data
          USING ERRCODE = '22023';
      END IF;

      v_off_inicio := ((v_ocor.data + (v_aval->>'entrada')::time) AT TIME ZONE v_tz);
      v_off_fim := ((v_ocor.data
                     + CASE WHEN (v_aval->>'termina_no_dia_seguinte')::boolean THEN 1 ELSE 0 END
                     + (v_aval->>'saida')::time) AT TIME ZONE v_tz);

      IF v_off_inicio <= v_agora THEN
        RAISE EXCEPTION 'OFFER_ALREADY_STARTED: o horário ofertado em % já começou e não pode ser publicado.', v_ocor.data
          USING ERRCODE = '22023';
      END IF;

      INSERT INTO public.dp_convocacoes(
        company_id, unidade_id, colaborador_id, data, entrada, saida, intervalo_minutos,
        termina_no_dia_seguinte, carga_prevista_horas, status, ocorrencia_id, origem_oferta,
        compatibilidade, regime_snapshot, remuneracao_snapshot, timezone_snapshot,
        inicio_previsto, fim_previsto, encerramento_operacional,
        prazo_resposta_base, prazo_resposta, disponibilizada_em, enviada_em, criada_por, observacao)
      VALUES (
        v_company, v_ocor.unidade_id, v_ocor.colaborador_alvo_id, v_ocor.data,
        (v_aval->>'entrada')::time, (v_aval->>'saida')::time, (v_aval->>'intervalo_minutos')::int,
        (v_aval->>'termina_no_dia_seguinte')::boolean, (v_aval->>'carga_prevista_horas')::numeric,
        'pendente', v_ocor.id, 'convocacao',
        v_aval->>'compatibilidade', v_aval->>'regime_snapshot', v_aval->'remuneracao_snapshot', v_tz,
        v_off_inicio, v_off_fim, v_off_fim,
        v_prazo_base, v_prazo_base, v_agora, v_agora, v_uid, v_grupo.observacao);

      v_usados := v_usados || jsonb_build_object(v_chave, true);
      v_ofertas := 1;
    ELSE
      FOR v_cand IN
        SELECT c.id, c.nome
          FROM public.dp_colaboradores c
         WHERE c.company_id = v_company
           AND c.cargo_id = v_ocor.cargo_id
           AND c.unidade_id IS NOT NULL
           AND c.unidade_id = v_ocor.unidade_id
           AND c.ativo IS NOT FALSE
           AND public.dp_regime_convocavel(c.regime)
           AND (
             NOT v_restrito
             OR EXISTS (
               SELECT 1 FROM public.dp_convocacao_destinatarios d
                WHERE d.grupo_id = v_grupo.id AND d.company_id = v_company
                  AND d.ocorrencia_id IS NULL AND d.removido_em IS NULL
                  AND d.colaborador_id = c.id)
           )
         ORDER BY c.nome, c.id
      LOOP
        v_chave := v_ocor.data::text || '|' || v_cand.id::text;
        CONTINUE WHEN v_usados ? v_chave;

        v_aval := public.dp_convocacao_avaliar_candidato(v_cand.id, v_ocor.id, NULL, true);
        v_aval := public.dp_convocacao_horario_efetivo(v_ocor.id, v_cand.id, v_aval);
        CONTINUE WHEN (v_aval->>'apto')::boolean IS NOT TRUE;

        v_off_inicio := ((v_ocor.data + (v_aval->>'entrada')::time) AT TIME ZONE v_tz);
        v_off_fim := ((v_ocor.data
                       + CASE WHEN (v_aval->>'termina_no_dia_seguinte')::boolean THEN 1 ELSE 0 END
                       + (v_aval->>'saida')::time) AT TIME ZONE v_tz);

        CONTINUE WHEN v_off_inicio <= v_agora;

        INSERT INTO public.dp_convocacoes(
          company_id, unidade_id, colaborador_id, data, entrada, saida, intervalo_minutos,
          termina_no_dia_seguinte, carga_prevista_horas, status, ocorrencia_id, origem_oferta,
          compatibilidade, regime_snapshot, remuneracao_snapshot, timezone_snapshot,
          inicio_previsto, fim_previsto, encerramento_operacional,
          prazo_resposta_base, prazo_resposta, disponibilizada_em, enviada_em, criada_por, observacao)
        VALUES (
          v_company, v_ocor.unidade_id, v_cand.id, v_ocor.data,
          (v_aval->>'entrada')::time, (v_aval->>'saida')::time, (v_aval->>'intervalo_minutos')::int,
          (v_aval->>'termina_no_dia_seguinte')::boolean, (v_aval->>'carga_prevista_horas')::numeric,
          'pendente', v_ocor.id, 'convocacao',
          v_aval->>'compatibilidade', v_aval->>'regime_snapshot', v_aval->'remuneracao_snapshot', v_tz,
          v_off_inicio, v_off_fim, v_off_fim,
          v_prazo_base, v_prazo_base, v_agora, v_agora, v_uid, v_grupo.observacao);

        v_usados := v_usados || jsonb_build_object(v_chave, true);
        v_ofertas := v_ofertas + 1;
      END LOOP;

      IF v_ofertas = 0 THEN
        RAISE EXCEPTION 'PUBLICATION_NO_ELIGIBLE: nenhuma pessoa elegível para a necessidade de %.', v_ocor.data
          USING ERRCODE = '22023';
      END IF;
    END IF;

    UPDATE public.dp_convocacao_ocorrencias
       SET status = 'publicada',
           publicada_em = v_agora,
           antecedencia_dias = v_antecedencia,
           fora_antecedencia = v_fora,
           confirmado_fora_prazo_por = CASE WHEN v_fora THEN v_uid ELSE NULL END,
           confirmado_fora_prazo_em = CASE WHEN v_fora THEN v_agora ELSE NULL END,
           justificativa_fora_prazo = v_just,
           updated_at = now()
     WHERE id = v_ocor.id AND company_id = v_company;

    PERFORM public.dp_convocacao_log_evento(
      v_company, v_grupo.id, v_ocor.id, 'ocorrencia_publicada',
      jsonb_build_object('de_status', 'rascunho', 'para_status', 'publicada',
        'ofertas', v_ofertas, 'vagas', v_ocor.vagas,
        'antecedencia_dias', v_antecedencia, 'fora_antecedencia', v_fora));

    v_total_ofertas := v_total_ofertas + v_ofertas;
    v_diag := v_diag || jsonb_build_array(jsonb_build_object(
      'ocorrencia_id', v_ocor.id, 'data', v_ocor.data, 'cargo_id', v_ocor.cargo_id,
      'vagas', v_ocor.vagas, 'ofertas', v_ofertas,
      'faltam_pessoas', GREATEST(0, v_ocor.vagas - v_ofertas),
      'fora_antecedencia', v_fora, 'antecedencia_dias', v_antecedencia));
  END LOOP;

  UPDATE public.dp_convocacao_grupos
     SET status = 'publicado',
         publicado_em = v_agora,
         publicado_por = v_uid,
         updated_at = now()
   WHERE id = v_grupo.id AND company_id = v_company
  RETURNING * INTO v_grupo;

  PERFORM public.dp_convocacao_log_evento(
    v_company, v_grupo.id, NULL, 'grupo_publicado',
    jsonb_build_object('de_status', 'rascunho', 'para_status', 'publicado',
      'ofertas', v_total_ofertas, 'competencia', v_grupo.competencia,
      'modalidade', v_grupo.modalidade, 'publico_modo', v_grupo.publico_modo));

  RETURN jsonb_build_object(
    'grupo_id', v_grupo.id,
    'status', v_grupo.status,
    'updated_at', v_grupo.updated_at,
    'ofertas', v_total_ofertas,
    'idempotente', false,
    'diagnostico', v_diag);
END;
$$;