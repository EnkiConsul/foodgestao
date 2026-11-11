-- Escala 12x36 (Art. 59-A CLT): ciclo de 48h a partir da data do primeiro plantão.
ALTER TABLE public.dp_colaborador_config_trabalho
  ADD COLUMN IF NOT EXISTS escala_modelo text NOT NULL DEFAULT 'semanal',
  ADD COLUMN IF NOT EXISTS data_primeiro_plantao date;

ALTER TABLE public.dp_colaborador_config_trabalho
  DROP CONSTRAINT IF EXISTS dp_config_trabalho_escala_modelo_chk;
ALTER TABLE public.dp_colaborador_config_trabalho
  ADD CONSTRAINT dp_config_trabalho_escala_modelo_chk CHECK (escala_modelo IN ('semanal', '12x36'));
ALTER TABLE public.dp_colaborador_config_trabalho
  DROP CONSTRAINT IF EXISTS dp_config_trabalho_12x36_primeiro_chk;
ALTER TABLE public.dp_colaborador_config_trabalho
  ADD CONSTRAINT dp_config_trabalho_12x36_primeiro_chk CHECK (escala_modelo <> '12x36' OR data_primeiro_plantao IS NOT NULL);

COMMENT ON COLUMN public.dp_colaborador_config_trabalho.escala_modelo IS 'semanal = grade por dia da semana; 12x36 = plantão alternado (Art. 59-A CLT) contado a partir de data_primeiro_plantao.';
COMMENT ON COLUMN public.dp_colaborador_config_trabalho.data_primeiro_plantao IS 'Referência do ciclo 12x36: diferença par de dias = plantão, ímpar = descanso de 36h.';

ALTER TABLE public.dp_trocas
  ADD COLUMN IF NOT EXISTS riscos_12x36 jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.dp_trocas.riscos_12x36 IS 'Plantões 12x36 em dias seguidos autorizados pelo gestor a pedido do colaborador (evidência da ciência).';

CREATE OR REPLACE FUNCTION private.dp_12x36_paridade(_primeiro date, _data date)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE WHEN _primeiro IS NULL OR _data IS NULL THEN NULL
              ELSE mod(mod(_data - _primeiro, 2) + 2, 2) = 0 END;
$$;

-- NULL = não está em 12x36 na data; true = plantão; false = descanso de 36h.
CREATE OR REPLACE FUNCTION private.dp_12x36_plantao_em(_colab uuid, _data date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN ct.escala_modelo = '12x36' THEN private.dp_12x36_paridade(ct.data_primeiro_plantao, _data) END
    FROM (SELECT 1) x
    LEFT JOIN LATERAL (
      SELECT c.escala_modelo, c.data_primeiro_plantao
        FROM public.dp_colaborador_config_trabalho c
       WHERE c.colaborador_id = _colab
         AND c.vigencia_inicio <= _data
         AND (c.vigencia_fim IS NULL OR c.vigencia_fim >= _data)
       ORDER BY c.vigencia_inicio DESC, c.id
       LIMIT 1
    ) ct ON true;
$$;

-- A pessoa trabalha em _d depois de trocar _cedida (passa a trabalhar) por _nova (passa a descansar)?
CREATE OR REPLACE FUNCTION private.dp_12x36_trabalha_apos_troca(_colab uuid, _d date, _cedida date, _nova date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN _d = _nova THEN false
    WHEN _d = _cedida THEN true
    WHEN private.dp_colab_afastado_em(_colab, _d) OR public.dp_rotina_ausencia_operacional_em(_colab, _d) THEN false
    WHEN EXISTS (SELECT 1 FROM public.dp_folgas f WHERE f.colaborador_id = _colab AND f.data = _d AND f.status <> 'cancelada') THEN false
    WHEN EXISTS (SELECT 1 FROM public.dp_dia_trabalho_excepcional e WHERE e.colaborador_id = _colab AND e.data = _d) THEN true
    ELSE coalesce(private.dp_12x36_plantao_em(_colab, _d), false)
  END;
$$;

-- Participantes em 12x36 que ficariam com plantões em dias seguidos após a troca.
CREATE OR REPLACE FUNCTION private.dp_12x36_consecutivos(_sol uuid, _dest uuid, _original date, _proposta date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'colaborador_id', p.cid, 'nome', c.nome, 'data_plantao', p.cedida, 'data_vizinha', v.d)
           ORDER BY p.cid, v.d), '[]'::jsonb)
    FROM (VALUES (_sol, _original, _proposta), (_dest, _proposta, _original)) p(cid, cedida, nova)
    JOIN public.dp_colaboradores c ON c.id = p.cid
    CROSS JOIN LATERAL (VALUES (p.cedida - 1), (p.cedida + 1)) v(d)
   WHERE p.cid IS NOT NULL AND p.cedida IS NOT NULL
     AND private.dp_12x36_plantao_em(p.cid, p.cedida) IS NOT NULL
     AND private.dp_12x36_trabalha_apos_troca(p.cid, v.d, p.cedida, p.nova);
$$;

REVOKE ALL ON FUNCTION private.dp_12x36_paridade(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dp_12x36_plantao_em(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dp_12x36_trabalha_apos_troca(uuid, date, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dp_12x36_consecutivos(uuid, uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.dp_12x36_paridade(date, date) TO service_role;
GRANT EXECUTE ON FUNCTION private.dp_12x36_plantao_em(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION private.dp_12x36_trabalha_apos_troca(uuid, date, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION private.dp_12x36_consecutivos(uuid, uuid, date, date) TO service_role;

-- Nova vigência criada fora da tela de jornada (alteração de condição, ficha,
-- rotina) mantém o ciclo 12x36 da vigência anterior em vez de virar semanal.
CREATE OR REPLACE FUNCTION private.dp_config_trabalho_herdar_12x36()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ant record;
BEGIN
  IF coalesce(current_setting('app.dp_config_escala_explicita', true), '') = 'on' THEN RETURN NEW; END IF;
  IF NEW.escala_modelo IS DISTINCT FROM 'semanal' THEN RETURN NEW; END IF;
  SELECT c.escala_modelo, c.data_primeiro_plantao INTO ant
    FROM public.dp_colaborador_config_trabalho c
   WHERE c.colaborador_id = NEW.colaborador_id AND c.id <> NEW.id AND c.vigencia_inicio <= NEW.vigencia_inicio
   ORDER BY c.vigencia_inicio DESC, c.created_at DESC
   LIMIT 1;
  IF ant.escala_modelo = '12x36' AND ant.data_primeiro_plantao IS NOT NULL THEN
    NEW.escala_modelo := '12x36';
    NEW.data_primeiro_plantao := ant.data_primeiro_plantao;
    NEW.folga_variavel := false;
    NEW.folga_fixa_dow := NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.dp_config_trabalho_herdar_12x36() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_dp_config_trabalho_herdar_12x36 ON public.dp_colaborador_config_trabalho;
CREATE TRIGGER trg_dp_config_trabalho_herdar_12x36
  BEFORE INSERT ON public.dp_colaborador_config_trabalho
  FOR EACH ROW EXECUTE FUNCTION private.dp_config_trabalho_herdar_12x36();

-- Em 12x36 os sete dias guardam o horário do plantão; quem decide o dia é o ciclo.
CREATE OR REPLACE FUNCTION private.dp_config_dias_12x36()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.dp_colaborador_config_trabalho c WHERE c.id = NEW.config_id AND c.escala_modelo = '12x36') THEN
    NEW.trabalha := true;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.dp_config_dias_12x36() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_dp_config_dias_12x36 ON public.dp_colaborador_config_dias;
CREATE TRIGGER trg_dp_config_dias_12x36
  BEFORE INSERT OR UPDATE OF trabalha ON public.dp_colaborador_config_dias
  FOR EACH ROW EXECUTE FUNCTION private.dp_config_dias_12x36();

-- Troca pelo portal que gera plantões 12x36 seguidos só pode ser registrada pelo gestor.
CREATE OR REPLACE FUNCTION private.dp_trocas_12x36_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.origem_registro IS DISTINCT FROM 'gestor'
     AND jsonb_array_length(private.dp_12x36_consecutivos(NEW.solicitante_id, NEW.destino_id, NEW.data_original, NEW.data_proposta)) > 0 THEN
    RAISE EXCEPTION 'TROCA_12X36_GESTOR: na escala 12x36 esta troca gera plantões em dias seguidos e só pode ser registrada pelo gestor.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.dp_trocas_12x36_guard() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_dp_trocas_12x36_guard ON public.dp_trocas;
CREATE TRIGGER trg_dp_trocas_12x36_guard
  BEFORE INSERT ON public.dp_trocas
  FOR EACH ROW EXECUTE FUNCTION private.dp_trocas_12x36_guard();

CREATE OR REPLACE FUNCTION public.dp_colaborador_config_salvar(p_colaborador_id uuid, p_config jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_inicio date := NULLIF(p_config->>'vigencia_inicio', '')::date;
  v_unidade uuid := NULLIF(p_config->>'unidade_id', '')::uuid;
  v_turno uuid := NULLIF(p_config->>'turno_padrao_id', '')::uuid;
  v_folga_var boolean := COALESCE((p_config->>'folga_variavel')::boolean, true);
  v_folga_dow smallint := NULLIF(p_config->>'folga_fixa_dow', '')::smallint;
  v_dias jsonb := COALESCE(p_config->'dias', '[]'::jsonb);
  v_aberta public.dp_colaborador_config_trabalho;
  v_id uuid;
  v_dia jsonb;
  v_modelo text := COALESCE(NULLIF(p_config->>'escala_modelo', ''), 'semanal');
  v_primeiro date := NULLIF(p_config->>'data_primeiro_plantao', '')::date;
  v_regime text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF v_inicio IS NULL THEN RAISE EXCEPTION 'CONFIG_VIGENCIA_OBRIGATORIA'; END IF;

  SELECT company_id INTO v_company FROM public.dp_colaboradores
   WHERE id = p_colaborador_id AND deleted_at IS NULL;
  IF v_company IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT regime::text INTO v_regime FROM public.dp_colaboradores WHERE id = p_colaborador_id;

  IF NOT (
    private.is_company_admin_or_owner(auth.uid(), v_company)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_company AND c.user_id = auth.uid())
  ) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('dp_colaborador_config:' || p_colaborador_id::text, 0));

  IF v_unidade IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_unidades u WHERE u.id = v_unidade AND u.company_id = v_company
  ) THEN RAISE EXCEPTION 'COLAB_UNIDADE_INVALIDA'; END IF;

  IF v_turno IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_turnos t WHERE t.id = v_turno AND t.company_id = v_company
  ) THEN RAISE EXCEPTION 'CONFIG_TURNO_INVALIDO'; END IF;

  IF v_modelo NOT IN ('semanal', '12x36') THEN RAISE EXCEPTION 'CONFIG_ESCALA_MODELO_INVALIDO'; END IF;
  IF v_modelo = '12x36' THEN
    -- Art. 59-A CLT: 12h de trabalho por 36h de descanso. O ciclo nasce da data do
    -- primeiro plantão; a folga não é escolhida nem fixa por dia da semana.
    IF v_primeiro IS NULL THEN RAISE EXCEPTION 'CONFIG_12X36_PRIMEIRO_PLANTAO_OBRIGATORIO'; END IF;
    IF v_turno IS NULL THEN RAISE EXCEPTION 'CONFIG_12X36_TURNO_OBRIGATORIO'; END IF;
    IF v_regime = 'intermitente' THEN RAISE EXCEPTION 'CONFIG_12X36_REGIME'; END IF;
    v_folga_var := false;
    v_folga_dow := NULL;
    v_dias := (SELECT COALESCE(jsonb_agg(d || jsonb_build_object('trabalha', true)), '[]'::jsonb) FROM jsonb_array_elements(v_dias) d);
  ELSE
    v_primeiro := NULL;
  END IF;
  PERFORM set_config('app.dp_config_escala_explicita', 'on', true);

  IF v_folga_var = false AND v_modelo = 'semanal' AND (v_folga_dow IS NULL OR v_folga_dow < 0 OR v_folga_dow > 6) THEN
    RAISE EXCEPTION 'CONFIG_FOLGA_FIXA_INVALIDA';
  END IF;

  IF jsonb_array_length(v_dias) <> 7 THEN RAISE EXCEPTION 'CONFIG_DIAS_INVALIDOS'; END IF;

  FOR v_dia IN SELECT jsonb_array_elements(v_dias) LOOP
    IF (v_dia->>'dow')::int NOT BETWEEN 0 AND 6 THEN RAISE EXCEPTION 'CONFIG_DIAS_INVALIDOS'; END IF;
    IF (v_dia->>'turno_id') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.dp_turnos t WHERE t.id = (v_dia->>'turno_id')::uuid AND t.company_id = v_company
    ) THEN RAISE EXCEPTION 'CONFIG_TURNO_INVALIDO'; END IF;
    IF (v_dia->>'setor_id') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.dp_setores s WHERE s.id = (v_dia->>'setor_id')::uuid AND s.company_id = v_company
    ) THEN RAISE EXCEPTION 'COLAB_SETOR_INVALIDO'; END IF;
    IF COALESCE((v_dia->>'intervalo_minutos')::int, 0) < 0
       OR COALESCE((v_dia->>'intervalo_minutos')::int, 0) > 480 THEN
      RAISE EXCEPTION 'CONFIG_INTERVALO_INVALIDO';
    END IF;
  END LOOP;

  IF (SELECT count(DISTINCT (d->>'dow')::int) FROM jsonb_array_elements(v_dias) d) <> 7 THEN
    RAISE EXCEPTION 'CONFIG_DIAS_INVALIDOS';
  END IF;

  SELECT c.* INTO v_aberta FROM public.dp_colaborador_config_trabalho c
   WHERE c.colaborador_id = p_colaborador_id AND c.vigencia_fim IS NULL
   ORDER BY c.vigencia_inicio DESC LIMIT 1;

  IF v_aberta.id IS NOT NULL AND v_aberta.vigencia_inicio = v_inicio THEN
    v_id := v_aberta.id;
    UPDATE public.dp_colaborador_config_trabalho
       SET unidade_id = v_unidade,
           turno_padrao_id = v_turno,
           folga_variavel = v_folga_var,
           folga_fixa_dow = CASE WHEN v_folga_var THEN NULL ELSE v_folga_dow END,
           escala_modelo = v_modelo,
           data_primeiro_plantao = v_primeiro,
           observacoes = NULLIF(btrim(COALESCE(p_config->>'observacoes','')), ''),
           updated_at = now()
     WHERE id = v_id;
    DELETE FROM public.dp_colaborador_config_dias WHERE config_id = v_id;
  ELSE
    IF v_aberta.id IS NOT NULL THEN
      UPDATE public.dp_colaborador_config_trabalho
         SET vigencia_fim = GREATEST(v_inicio - 1, vigencia_inicio), updated_at = now()
       WHERE id = v_aberta.id;
    END IF;

    INSERT INTO public.dp_colaborador_config_trabalho (
      company_id, colaborador_id, unidade_id, turno_padrao_id, folga_variavel,
      folga_fixa_dow, observacoes, vigencia_inicio, escala_modelo, data_primeiro_plantao
    ) VALUES (
      v_company, p_colaborador_id, v_unidade, v_turno, v_folga_var,
      CASE WHEN v_folga_var THEN NULL ELSE v_folga_dow END,
      NULLIF(btrim(COALESCE(p_config->>'observacoes','')), ''), v_inicio, v_modelo, v_primeiro
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      SELECT id INTO v_id FROM public.dp_colaborador_config_trabalho
       WHERE colaborador_id = p_colaborador_id AND vigencia_inicio = v_inicio
       ORDER BY created_at DESC LIMIT 1;
      UPDATE public.dp_colaborador_config_trabalho
         SET escala_modelo = v_modelo, data_primeiro_plantao = v_primeiro,
             folga_variavel = v_folga_var,
             folga_fixa_dow = CASE WHEN v_folga_var THEN NULL ELSE v_folga_dow END,
             updated_at = now()
       WHERE id = v_id;
      DELETE FROM public.dp_colaborador_config_dias WHERE config_id = v_id;
    END IF;
  END IF;

  INSERT INTO public.dp_colaborador_config_dias (
    company_id, config_id, dow, trabalha, turno_id, entrada, saida, intervalo_minutos, setor_id
  )
  SELECT v_company, v_id, (d->>'dow')::smallint,
         COALESCE((d->>'trabalha')::boolean, false),
         NULLIF(d->>'turno_id','')::uuid,
         CASE WHEN COALESCE((d->>'trabalha')::boolean,false) THEN NULLIF(d->>'entrada','')::time END,
         CASE WHEN COALESCE((d->>'trabalha')::boolean,false) THEN NULLIF(d->>'saida','')::time END,
         CASE WHEN COALESCE((d->>'trabalha')::boolean,false) THEN NULLIF(d->>'intervalo_minutos','')::int END,
         CASE WHEN COALESCE((d->>'trabalha')::boolean,false) THEN NULLIF(d->>'setor_id','')::uuid END
    FROM jsonb_array_elements(v_dias) d;

  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.dp_jornada_dia_prevista(p_colaborador uuid, p_data date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_wd int := EXTRACT(DOW FROM p_data)::int;
  v_tipo public.dp_escala_item_tipo;
  v_item_turno uuid;
  v_cfg_id uuid;
  v_turno_padrao uuid;
  v_trabalha boolean;
  v_dia_turno uuid;
  v_tem_dia boolean := false;
  v_plantao boolean;
BEGIN
  IF p_colaborador IS NULL OR p_data IS NULL THEN
    RETURN jsonb_build_object('trabalha', false, 'turno_id', NULL, 'fonte', 'invalido');
  END IF;

  SELECT i.tipo, i.turno_id
    INTO v_tipo, v_item_turno
    FROM public.dp_escala_itens i
    JOIN public.dp_escalas e ON e.id = i.escala_id
   WHERE i.colaborador_id = p_colaborador
     AND i.data = p_data
     AND e.status = 'publicada'
   ORDER BY i.updated_at DESC NULLS LAST
   LIMIT 1;

  IF v_tipo IS NOT NULL THEN
    RETURN jsonb_build_object(
      'trabalha', v_tipo = 'trabalho',
      'turno_id', v_item_turno,
      'fonte', 'escala_publicada');
  END IF;

  SELECT ct.id, ct.turno_padrao_id
    INTO v_cfg_id, v_turno_padrao
    FROM public.dp_colaborador_config_trabalho ct
   WHERE ct.colaborador_id = p_colaborador
     AND (ct.vigencia_inicio IS NULL OR ct.vigencia_inicio <= p_data)
     AND (ct.vigencia_fim IS NULL OR ct.vigencia_fim >= p_data)
   ORDER BY ct.vigencia_inicio DESC NULLS LAST
   LIMIT 1;

  IF v_cfg_id IS NULL THEN
    -- sem configuração vigente: assume equipe habitual do dia (fail open)
    RETURN jsonb_build_object('trabalha', true, 'turno_id', NULL, 'fonte', 'sem_configuracao');
  END IF;

  -- 12x36: o dia de trabalho sai do ciclo de 48h, não do dia da semana.
  v_plantao := private.dp_12x36_plantao_em(p_colaborador, p_data);
  IF v_plantao IS NOT NULL THEN
    RETURN jsonb_build_object('trabalha', v_plantao, 'turno_id', v_turno_padrao, 'fonte', 'config_12x36');
  END IF;

  SELECT d.trabalha, d.turno_id, true
    INTO v_trabalha, v_dia_turno, v_tem_dia
    FROM public.dp_colaborador_config_dias d
   WHERE d.config_id = v_cfg_id
     AND d.dow = v_wd
   LIMIT 1;

  IF NOT COALESCE(v_tem_dia, false) THEN
    RETURN jsonb_build_object(
      'trabalha', true, 'turno_id', v_turno_padrao, 'fonte', 'sem_dia_configurado');
  END IF;

  RETURN jsonb_build_object(
    'trabalha', COALESCE(v_trabalha, false),
    'turno_id', COALESCE(v_dia_turno, v_turno_padrao),
    'fonte', 'config_dias');
END;
$function$;

CREATE OR REPLACE FUNCTION public.dp_convocacao_jornada_na_data(_colaborador_id uuid, _data date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dia record;
BEGIN
  -- Dia de descanso do ciclo 12x36 não tem jornada habitual.
  IF private.dp_12x36_plantao_em(_colaborador_id, _data) IS FALSE THEN RETURN NULL; END IF;
  SELECT d.entrada, d.saida, COALESCE(d.intervalo_minutos, 0) AS intervalo_minutos, d.trabalha
    INTO v_dia
    FROM public.dp_colaborador_config_trabalho ct
    JOIN public.dp_colaborador_config_dias d ON d.config_id = ct.id AND d.company_id = ct.company_id
   WHERE ct.colaborador_id = _colaborador_id
     AND (ct.vigencia_inicio IS NULL OR ct.vigencia_inicio <= _data)
     AND (ct.vigencia_fim IS NULL OR ct.vigencia_fim >= _data)
     AND d.dow = EXTRACT(DOW FROM _data)::int
   ORDER BY ct.vigencia_inicio DESC NULLS LAST
   LIMIT 1;

  IF v_dia IS NULL OR v_dia.trabalha IS FALSE OR v_dia.entrada IS NULL OR v_dia.saida IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'entrada', v_dia.entrada,
    'saida', v_dia.saida,
    'intervalo_minutos', v_dia.intervalo_minutos,
    'termina_no_dia_seguinte', (v_dia.saida <= v_dia.entrada));
END;
$function$;

CREATE OR REPLACE FUNCTION private.dp_troca_folga_fixa_livre(_colab uuid, _data date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN private.dp_12x36_plantao_em(_colab, _data) IS NULL
              THEN extract(dow from _data)::smallint = ANY (public.dp_dias_fixos_folga(_colab, _data))
              ELSE NOT private.dp_12x36_plantao_em(_colab, _data) END
     AND NOT EXISTS (SELECT 1 FROM public.dp_dia_trabalho_excepcional e WHERE e.colaborador_id = _colab AND e.data = _data);
$function$;

-- Descanso de 36h do ciclo 12x36 entra na rotina do portal como folga, salvo trabalho por troca ou escala publicada.
CREATE OR REPLACE FUNCTION public.dp_rotina_folga_em(p_colaborador uuid, p_data date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT EXISTS (SELECT 1 FROM public.dp_folgas f WHERE f.colaborador_id=p_colaborador AND f.data=p_data AND coalesce(f.status::text,'') <> 'cancelada')
 OR EXISTS (SELECT 1 FROM public.dp_solicitacoes s WHERE s.colaborador_id=p_colaborador AND s.tipo='folga' AND s.status='aprovada' AND s.removido_em IS NULL AND s.data_alvo=p_data)
 OR (private.dp_12x36_plantao_em(p_colaborador, p_data) IS FALSE
     AND NOT EXISTS (SELECT 1 FROM public.dp_dia_trabalho_excepcional e WHERE e.colaborador_id = p_colaborador AND e.data = p_data)
     AND NOT EXISTS (SELECT 1 FROM public.dp_escala_itens i JOIN public.dp_escalas es ON es.id = i.escala_id
                      WHERE i.colaborador_id = p_colaborador AND i.data = p_data AND i.tipo = 'trabalho' AND es.status = 'publicada'));
$function$;

CREATE OR REPLACE FUNCTION public.dp_folga_exige_descanso_fds(_company uuid, _colab uuid, _dias integer[], _competencia date)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_c record;
  v_cfg_id uuid;
  v_fixa int;
  v_dias_trab int[];
  v_dias_uso int[] := COALESCE(_dias, '{}'::int[]);
  v_ini date := date_trunc('month', COALESCE(_competencia, now()::date))::date;
  v_fim date := (date_trunc('month', COALESCE(_competencia, now()::date)) + interval '1 month - 1 day')::date;
BEGIN
  IF _company IS NULL OR _colab IS NULL THEN RETURN false; END IF;

  SELECT c.id, c.regime, c.vinculo_label, c.unidade_id, c.forma_pagamento
    INTO v_c
    FROM public.dp_colaboradores c
   WHERE c.id = _colab AND c.company_id = _company
     AND c.deleted_at IS NULL AND c.ativo IS NOT false;

  IF v_c.id IS NULL THEN RETURN false; END IF;

  -- CLT e freelancer mensalista (trabalha o mês todo) seguem a regra; demais vínculos não
  IF v_c.regime IS NOT NULL AND v_c.regime::text <> 'clt'
     AND NOT (v_c.regime::text = 'freelancer' AND COALESCE(v_c.forma_pagamento::text, '') = 'mensalista') THEN
    RETURN false;
  END IF;

  IF lower(COALESCE(v_c.vinculo_label, '')) IN ('socio', 'sócio') THEN RETURN false; END IF;

  SELECT t.id, t.folga_fixa_dow INTO v_cfg_id, v_fixa
    FROM public.dp_colaborador_config_trabalho t
   WHERE t.colaborador_id = _colab
     AND t.company_id = _company
     AND t.vigencia_fim IS NULL
   ORDER BY t.vigencia_inicio DESC NULLS LAST
   LIMIT 1;

  IF v_cfg_id IS NOT NULL THEN
    -- 12x36 não escolhe folga: o ciclo de 48h já alterna domingos de descanso (Art. 59-A CLT).
    IF EXISTS (SELECT 1 FROM public.dp_colaborador_config_trabalho t WHERE t.id = v_cfg_id AND t.escala_modelo = '12x36') THEN RETURN false; END IF;
    IF v_fixa = 0 THEN RETURN false; END IF;

    SELECT array_agg(d.dow ORDER BY d.dow) INTO v_dias_trab
      FROM public.dp_colaborador_config_dias d
     WHERE d.config_id = v_cfg_id AND d.trabalha IS TRUE;

    IF v_dias_trab IS NOT NULL AND array_length(v_dias_trab, 1) IS NOT NULL THEN
      IF NOT (0 = ANY (v_dias_trab)) THEN RETURN false; END IF;
      IF array_length(v_dias_uso, 1) IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM unnest(v_dias_uso) AS x WHERE x = ANY (v_dias_trab)) THEN
        RETURN false;
      END IF;
    END IF;
  END IF;

  IF array_length(v_dias_uso, 1) IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.dp_ferias_gozos g
       WHERE g.colaborador_id = _colab
         AND g.status::text <> 'cancelado'
         AND g.data_inicio <= v_fim AND g.data_fim >= v_ini
    ) OR EXISTS (
      SELECT 1 FROM public.dp_folgas f
       WHERE f.colaborador_id = _colab
         AND f.status::text <> 'cancelada'
         AND f.tipo::text IN ('ferias', 'licenca')
         AND f.data BETWEEN v_ini AND v_fim
    ) THEN RETURN false; END IF;

    RETURN true;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM generate_series(v_ini, v_fim, interval '1 day') AS d
     WHERE EXTRACT(DOW FROM d)::int = ANY (v_dias_uso)
       AND NOT EXISTS (
         SELECT 1 FROM public.dp_ferias_gozos g
          WHERE g.colaborador_id = _colab
            AND g.status::text <> 'cancelado'
            AND d::date BETWEEN g.data_inicio AND g.data_fim)
       AND NOT EXISTS (
         SELECT 1 FROM public.dp_folgas f
          WHERE f.colaborador_id = _colab
            AND f.status::text <> 'cancelada'
            AND f.tipo::text IN ('ferias', 'licenca')
            AND f.data = d::date)
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.dp_troca_gestor_registrar(_company uuid, _sol uuid, _dest uuid, _original date, _proposta date, _motivo text, _ciente_dsr boolean DEFAULT false, _notificar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v jsonb; tid uuid; risco jsonb; cid uuid; r12 jsonb;
BEGIN
 IF length(btrim(coalesce(_motivo,'')))<3 THEN RAISE EXCEPTION 'INVALID_INPUT: motivo obrigatório'; END IF;
 -- Serialize both people in canonical order; overlapping/reversed swaps cannot consume the same leave.
 FOR cid IN SELECT x FROM unnest(ARRAY[_sol,_dest]) x ORDER BY x LOOP PERFORM pg_advisory_xact_lock(hashtextextended(cid::text || '|troca_gestor',0)); END LOOP;
 v:=private.dp_troca_gestor_validar(_company,_sol,_dest,_original,_proposta);
 -- Medido antes de efetivar: a própria troca cria a folga e o dia excepcional.
 r12:=private.dp_12x36_consecutivos(_sol,_dest,_original,_proposta);
 IF jsonb_array_length(v->'riscos')>0 AND NOT coalesce(_ciente_dsr,false) THEN RAISE EXCEPTION 'DSR_CIENCIA_OBRIGATORIA'; END IF;
 -- 12x36: plantões em dias seguidos só com pedido expresso do colaborador confirmado pelo gestor (Art. 59-A CLT).
 IF jsonb_array_length(r12)>0 AND NOT coalesce(_ciente_dsr,false) THEN RAISE EXCEPTION 'PLANTAO_12X36_CIENCIA_OBRIGATORIA'; END IF;
 IF jsonb_array_length(r12)>0 AND length(btrim(coalesce(_motivo,'')))<10 THEN RAISE EXCEPTION 'PLANTAO_12X36_MOTIVO_OBRIGATORIO'; END IF;
 INSERT INTO public.dp_trocas(company_id,solicitante_id,destino_id,data_original,data_proposta,motivo,status,created_by,gestor_id,origem_registro,notificar_portal,riscos_12x36)
 VALUES(_company,_sol,_dest,_original,_proposta,btrim(_motivo),'pendente_gestor',auth.uid(),auth.uid(),'gestor',coalesce(_notificar,false),r12) RETURNING id INTO tid;
 PERFORM private.dp_troca_efetivar(tid,auth.uid());
 UPDATE public.dp_trocas SET status='aprovada',gestor_resposta='aprovada: Ajuste operacional autorizado pelo gestor. ' || btrim(_motivo) || CASE WHEN jsonb_array_length(r12)>0 THEN ' Plantões 12x36 em dias seguidos a pedido expresso do colaborador, com ciência do gestor (Art. 59-A CLT).' ELSE '' END,gestor_respondido_em=now() WHERE id=tid;
 -- Existing linked evidence is retained; authorization is not an external point posting.
 UPDATE public.dp_ocorrencias o SET tratativa_ponto=false,tratativa_status='nao_se_aplica',tratativa_decisao=NULL,analisado_por=auth.uid(),
 justificativa_inicial=format('%s por troca autorizada pelo gestor com %s. Datas: %s e %s. Motivo: %s.%s',CASE WHEN o.subtipo='troca_trabalho' THEN 'Trabalho previsto' ELSE 'Folga' END,c.nome,to_char(_original,'DD/MM/YYYY'),to_char(_proposta,'DD/MM/YYYY'),btrim(_motivo),CASE WHEN me.origem_cadastro='preadmissao_rotina' THEN ' Registro operacional durante processo de admissão; sem aceite contratual.' ELSE ' Justificativa para conferência no sistema externo, sem apuração de ponto pelo AVETO 360.' END)
 FROM public.dp_colaboradores me,public.dp_colaboradores c WHERE o.troca_id=tid AND o.estado<>'cancelada' AND me.id=o.colaborador_id AND c.id=CASE WHEN o.colaborador_id=_sol THEN _dest ELSE _sol END;
 FOR risco IN SELECT * FROM jsonb_array_elements(v->'riscos') LOOP
  INSERT INTO public.dp_dsr_ciencias(company_id,colaborador_id,user_id,papel,referencia_tabela,referencia_id,data_referencia,dias_seguidos)
  VALUES(_company,(risco->>'colaborador_id')::uuid,auth.uid(),'gestor','dp_trocas',tid,_original,(risco->>'dias')::integer);
 END LOOP;
 RETURN jsonb_build_object('troca_id',tid,'status','aprovada');
END $function$;

CREATE OR REPLACE FUNCTION public.dp_troca_gestor_previa(_company uuid, _sol uuid, _dest uuid, _original date, _proposta date)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT private.dp_troca_gestor_validar(_company,_sol,_dest,_original,_proposta)
   || jsonb_build_object('participantes',private.dp_troca_gestor_participantes(_company,_sol,_dest,_original,_proposta),
                         'riscos_12x36',private.dp_12x36_consecutivos(_sol,_dest,_original,_proposta));
$function$;
