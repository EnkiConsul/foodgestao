
-- Público-alvo nas regras de bloqueio (regra_json.alvo_tipo: todos|cargo|setor|colaborador),
-- prioridade de 1 dia na janela de folgas para quem tem restrição no mês e
-- salvaguarda de descanso (marca acima do limite quando não sobra outra data).
-- Rollback: recriar dp_regra_bloqueia_data / dp_folgas_janela_efetiva / dp_folga_marcar /
-- dp_folgas_validar_unificado com as versões anteriores e DROP das funções private novas.

-- 1) Casamento de data de uma regra (lógica única, reaproveitada)
CREATE OR REPLACE FUNCTION private.dp_regra_casa_data(_tipo text, _mes int, _dia int, _cfg jsonb, _data date)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v_ano int := EXTRACT(YEAR FROM _data)::int;
  v_mes int := EXTRACT(MONTH FROM _data)::int;
  v_dia int := EXTRACT(DAY FROM _data)::int;
  v_dow int := EXTRACT(DOW FROM _data)::int;
  v_meses jsonb; v_dias jsonb; v_inicio date; v_ano_ref int;
  v_ordinal int; v_diasem int; v_pos_dia int; v_first_dow int; v_dia_alvo int; v_sab date;
  v_cfg jsonb := COALESCE(_cfg, '{}'::jsonb);
BEGIN
  BEGIN v_inicio := NULLIF(v_cfg->>'data_inicio','')::date; EXCEPTION WHEN others THEN v_inicio := NULL; END;
  IF v_inicio IS NOT NULL AND _data < v_inicio THEN RETURN false; END IF;
  v_ano_ref := NULLIF(v_cfg->>'ano_referencia','')::int;
  IF COALESCE(v_cfg->>'aplicacao','anual') = 'unica' AND v_ano_ref IS NOT NULL AND v_ano_ref <> v_ano THEN RETURN false; END IF;
  v_meses := COALESCE(v_cfg->'meses','[]'::jsonb);
  IF jsonb_array_length(v_meses) > 0 THEN
    IF NOT (v_meses @> to_jsonb(v_mes)) THEN RETURN false; END IF;
  ELSIF _mes IS NOT NULL AND _mes <> v_mes THEN RETURN false;
  END IF;

  IF _tipo = 'fixa_anual' THEN
    v_dias := COALESCE(v_cfg->'dias','[]'::jsonb);
    IF jsonb_array_length(v_dias) > 0 THEN RETURN v_dias @> to_jsonb(v_dia); END IF;
    RETURN _dia IS NOT NULL AND _dia = v_dia;
  ELSIF _tipo = 'dinamica' AND v_cfg->>'tipo_original' = 'pos_pagamento' THEN
    v_pos_dia := COALESCE(NULLIF(v_cfg->>'pos_pagamento_dia','')::int, 5);
    v_sab := make_date(v_ano, v_mes, LEAST(v_pos_dia, 28)) + 1;
    WHILE EXTRACT(MONTH FROM v_sab)::int = v_mes AND EXTRACT(DOW FROM v_sab)::int <> 6 LOOP v_sab := v_sab + 1; END LOOP;
    IF EXTRACT(MONTH FROM v_sab)::int <> v_mes THEN RETURN false; END IF;
    RETURN _data = v_sab OR (_data = v_sab + 1 AND EXTRACT(MONTH FROM v_sab + 1)::int = v_mes);
  ELSIF _tipo = 'dinamica' THEN
    v_ordinal := COALESCE(NULLIF(v_cfg->>'ordinal','')::int, 1);
    v_diasem := COALESCE(NULLIF(v_cfg->>'dia_semana','')::int, 0);
    IF v_ordinal = 0 THEN RETURN v_dow = v_diasem; END IF;
    v_first_dow := EXTRACT(DOW FROM make_date(v_ano, v_mes, 1))::int;
    v_dia_alvo := 1 + ((v_diasem - v_first_dow + 7) % 7) + (v_ordinal - 1) * 7;
    RETURN v_dia_alvo = v_dia;
  END IF;
  RETURN false;
END $$;

-- 2) Regra vale para a unidade?
CREATE OR REPLACE FUNCTION private.dp_regra_vale_unidade(_regra uuid, _unidade uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.dp_bloqueio_regra_unidades WHERE regra_id = _regra)
      OR (_unidade IS NOT NULL AND EXISTS (SELECT 1 FROM public.dp_bloqueio_regra_unidades WHERE regra_id = _regra AND unidade_id = _unidade));
$$;

-- 3) Bloqueio geral: só regras com público "todos" (mesma semântica de antes)
CREATE OR REPLACE FUNCTION public.dp_regra_bloqueia_data(_company_id uuid, _unidade_id uuid, _data date)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.dp_datas_bloqueadas
     WHERE company_id = _company_id AND data = _data
       AND (unidade_id IS NULL OR unidade_id = _unidade_id)
       AND (liberada = true OR liberada_por_solicitacao IS NOT NULL)
  ) THEN RETURN false; END IF;

  FOR r IN SELECT id, tipo::text AS tipo, mes, dia, regra_json FROM public.dp_bloqueio_regras
            WHERE company_id = _company_id AND ativo = true AND removido_em IS NULL
              AND COALESCE(regra_json->>'alvo_tipo','todos') = 'todos'
  LOOP
    IF NOT private.dp_regra_vale_unidade(r.id, _unidade_id) THEN CONTINUE; END IF;
    IF private.dp_regra_casa_data(r.tipo, r.mes, r.dia, r.regra_json, _data) THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END $$;

-- 4) Bloqueio direcionado (cargo / setor / colaborador). Devolve o nome da regra ou NULL.
CREATE OR REPLACE FUNCTION private.dp_regra_bloqueia_colaborador(_colab uuid, _data date)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; r record;
BEGIN
  SELECT company_id, unidade_id, cargo_id, setor_id INTO c FROM public.dp_colaboradores WHERE id = _colab;
  IF NOT FOUND THEN RETURN NULL; END IF;
  FOR r IN SELECT id, nome, tipo::text AS tipo, mes, dia, regra_json FROM public.dp_bloqueio_regras
            WHERE company_id = c.company_id AND ativo = true AND removido_em IS NULL
              AND (
                (regra_json->>'alvo_tipo' = 'colaborador' AND regra_json->>'colaborador_id' = _colab::text)
                OR (regra_json->>'alvo_tipo' = 'cargo' AND c.cargo_id IS NOT NULL AND regra_json->>'cargo_id' = c.cargo_id::text)
                OR (regra_json->>'alvo_tipo' = 'setor' AND c.setor_id IS NOT NULL AND regra_json->>'setor_id' = c.setor_id::text)
              )
  LOOP
    IF NOT private.dp_regra_vale_unidade(r.id, c.unidade_id) THEN CONTINUE; END IF;
    IF private.dp_regra_casa_data(r.tipo, r.mes, r.dia, r.regra_json, _data) THEN RETURN r.nome; END IF;
  END LOOP;
  RETURN NULL;
END $$;

-- 5) Colaborador tem alguma restrição de folga no mês?
CREATE OR REPLACE FUNCTION private.dp_colab_tem_restricao_mes(_colab uuid, _competencia date)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ini date := date_trunc('month', _competencia)::date; v_fim date; d date;
BEGIN
  v_fim := (v_ini + interval '1 month' - interval '1 day')::date;
  IF EXISTS (SELECT 1 FROM public.dp_bloqueios bl
              WHERE bl.colaborador_id = _colab AND bl.ativo = true AND bl.tipo IN ('folga','todos')
                AND bl.inicio <= v_fim AND (bl.fim IS NULL OR bl.fim >= v_ini)) THEN
    RETURN true;
  END IF;
  d := v_ini;
  WHILE d <= v_fim LOOP
    IF private.dp_regra_bloqueia_colaborador(_colab, d) IS NOT NULL THEN RETURN true; END IF;
    d := d + 1;
  END LOOP;
  RETURN false;
END $$;

-- 6) Data bloqueada para a pessoa (geral, individual ou direcionada)
CREATE OR REPLACE FUNCTION private.dp_folga_data_bloqueada_colab(_colab uuid, _data date)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c record;
BEGIN
  SELECT company_id, unidade_id INTO c FROM public.dp_colaboradores WHERE id = _colab;
  IF private.dp_folga_data_bloqueada(c.company_id, c.unidade_id, _data) THEN RETURN true; END IF;
  IF EXISTS (SELECT 1 FROM public.dp_bloqueios bl WHERE bl.colaborador_id = _colab AND bl.ativo
              AND bl.tipo IN ('folga','todos') AND bl.inicio <= _data AND (bl.fim IS NULL OR bl.fim >= _data)) THEN
    RETURN true;
  END IF;
  RETURN private.dp_regra_bloqueia_colaborador(_colab, _data) IS NOT NULL;
END $$;

REVOKE ALL ON FUNCTION private.dp_regra_casa_data(text,int,int,jsonb,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dp_regra_vale_unidade(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dp_regra_bloqueia_colaborador(uuid,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dp_colab_tem_restricao_mes(uuid,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dp_folga_data_bloqueada_colab(uuid,date) FROM PUBLIC;

-- 7) Janela efetiva: quem tem restrição no mês-alvo abre 1 dia antes (detectado pelo usuário logado)
CREATE OR REPLACE FUNCTION public.dp_folgas_janela_efetiva(_company uuid, _unidade uuid DEFAULT NULL::uuid, _data_ref date DEFAULT NULL::date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_cfg record; v_tz text; v_hoje date; v_abre date; v_fecha date; v_comp date; v_estado text;
  v_colab uuid; v_prioridade boolean := false;
BEGIN
  IF _company IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: empresa obrigatória.' USING ERRCODE = '22023';
  END IF;
  IF NOT private.dp_pode_ler_empresa(_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: sem acesso à empresa.' USING ERRCODE = '42501';
  END IF;

  SELECT folga_janela_ativa, folga_janela_abre_dia, folga_janela_fecha_dia, folga_autoatribuir, folgas_fds_por_mes
    INTO v_cfg FROM public.dp_config_dp
   WHERE company_id = _company AND (unidade_id IS NULL OR unidade_id = _unidade)
   ORDER BY (unidade_id IS NOT NULL) DESC LIMIT 1;

  v_tz := public.dp_convocacao_timezone(_company, _unidade);
  v_hoje := COALESCE(_data_ref, (now() AT TIME ZONE COALESCE(v_tz, 'America/Sao_Paulo'))::date);
  v_comp := (date_trunc('month', v_hoje) + interval '1 month')::date;
  v_abre := date_trunc('month', v_hoje)::date + (COALESCE(v_cfg.folga_janela_abre_dia, 10) - 1);
  v_fecha := date_trunc('month', v_hoje)::date + (COALESCE(v_cfg.folga_janela_fecha_dia, 20) - 1);

  IF auth.uid() IS NOT NULL THEN
    v_colab := public.dp_colaborador_ativo_of(auth.uid());
    IF v_colab IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.dp_colaboradores WHERE id = v_colab AND company_id = _company)
       AND private.dp_colab_tem_restricao_mes(v_colab, v_comp) THEN
      v_prioridade := true;
      IF v_abre > date_trunc('month', v_hoje)::date THEN v_abre := v_abre - 1; END IF;
    END IF;
  END IF;

  v_estado := CASE WHEN v_hoje < v_abre THEN 'antes' WHEN v_hoje > v_fecha THEN 'encerrada' ELSE 'aberta' END;

  RETURN jsonb_build_object(
    'ativa', COALESCE(v_cfg.folga_janela_ativa, false),
    'autoatribuir', COALESCE(v_cfg.folga_autoatribuir, true),
    'abre_dia', EXTRACT(DAY FROM v_abre)::int,
    'abre_dia_padrao', COALESCE(v_cfg.folga_janela_abre_dia, 10),
    'fecha_dia', COALESCE(v_cfg.folga_janela_fecha_dia, 20),
    'hoje', v_hoje, 'abre_em', v_abre, 'fecha_em', v_fecha, 'competencia', v_comp,
    'folgas_exigidas', COALESCE(v_cfg.folgas_fds_por_mes, 1),
    'prioridade', v_prioridade,
    'estado', v_estado);
END;
$function$;

-- 8) Validação unificada: aplica também as regras direcionadas
CREATE OR REPLACE FUNCTION public.dp_folgas_validar_unificado()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_unidade uuid;
  v_wd int := EXTRACT(DOW FROM NEW.data)::int;
  v_self boolean := (NEW.origem = 'solicitacao'::public.dp_folga_origem);
  v_contingencia boolean := COALESCE(current_setting('dp.folga_auto_contingencia', true), 'off') = 'on';
  v_ignora_bloqueio boolean := COALESCE(current_setting('dp.folga_ignora_bloqueio', true), 'off') = 'on';
  v_excedente boolean := COALESCE(current_setting('dp.folga_excedente_autorizado', true), 'off') = 'on';
  v_limite int; v_qtd int; v_mensais int; v_teto int; v_bloq record; v_liberada boolean;
  v_fixa int; v_aniv record; v_bloq_individual boolean; v_socio boolean; v_regra_alvo text;
BEGIN
  IF NEW.status = 'cancelada' THEN RETURN NEW; END IF;

  SELECT unidade_id, folga_fixa_semana, lower(coalesce(vinculo_label, '')) IN ('socio', 'sócio')
    INTO v_unidade, v_fixa, v_socio
    FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;

  IF NEW.tipo NOT IN ('ferias','licenca') AND NOT NEW.extra AND NOT v_ignora_bloqueio THEN
    SELECT motivo, liberada_por_solicitacao, liberada INTO v_bloq
      FROM public.dp_datas_bloqueadas
     WHERE company_id = NEW.company_id AND data = NEW.data
       AND (unidade_id IS NULL OR unidade_id = v_unidade) AND regra_id IS NULL
     ORDER BY (unidade_id = v_unidade) DESC NULLS LAST, unidade_id NULLS LAST LIMIT 1;
    IF FOUND AND v_bloq.liberada_por_solicitacao IS NULL AND COALESCE(v_bloq.liberada, false) = false THEN
      RAISE EXCEPTION 'Data % está bloqueada administrativamente.', NEW.data USING ERRCODE = 'check_violation';
    END IF;
    IF public.dp_regra_bloqueia_data(NEW.company_id, v_unidade, NEW.data) THEN
      SELECT (liberada_por_solicitacao IS NOT NULL OR COALESCE(liberada, false)) INTO v_liberada
        FROM public.dp_datas_bloqueadas
       WHERE company_id = NEW.company_id AND data = NEW.data
         AND (unidade_id IS NULL OR unidade_id = v_unidade)
       ORDER BY (unidade_id = v_unidade) DESC NULLS LAST, unidade_id NULLS LAST LIMIT 1;
      IF NOT COALESCE(v_liberada, false) THEN
        RAISE EXCEPTION 'Esta data está bloqueada por regra da empresa.' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    v_regra_alvo := private.dp_regra_bloqueia_colaborador(NEW.colaborador_id, NEW.data);
    IF v_regra_alvo IS NOT NULL THEN
      RAISE EXCEPTION 'Esta data não está disponível para folga.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.dp_bloqueios bl
    WHERE bl.company_id = NEW.company_id AND bl.colaborador_id = NEW.colaborador_id
      AND bl.ativo = true AND bl.tipo IN ('folga','todos')
      AND bl.inicio <= NEW.data AND (bl.fim IS NULL OR bl.fim >= NEW.data)) INTO v_bloq_individual;
  IF v_bloq_individual THEN
    RAISE EXCEPTION 'Colaborador está bloqueado para marcar folga em %', NEW.data USING ERRCODE = 'check_violation';
  END IF;

  IF NOT NEW.extra AND NEW.tipo NOT IN ('ferias','licenca') AND NOT v_contingencia AND NOT v_excedente THEN
    PERFORM private.dp_folga_lock_vaga(NEW.company_id, v_unidade, NEW.data);
    SELECT limite_folgas INTO v_limite FROM public.dp_dia_config
     WHERE company_id = NEW.company_id AND data = NEW.data
       AND (unidade_id = v_unidade OR unidade_id IS NULL)
     ORDER BY (unidade_id IS NOT NULL) DESC LIMIT 1;
    IF v_limite IS NOT NULL AND v_limite > 0
       AND NOT (v_wd = 0 AND 0::smallint = ANY (COALESCE(public.dp_dias_fixos_folga(NEW.colaborador_id, NEW.data), '{}'::smallint[]))) THEN
      SELECT count(*) INTO v_qtd FROM public.dp_colaboradores c
       WHERE c.company_id = NEW.company_id AND c.deleted_at IS NULL
         AND (v_unidade IS NULL OR c.unidade_id = v_unidade)
         AND c.id <> NEW.colaborador_id
         AND private.dp_folga_ocupa_vaga(c.id, NEW.data);
      IF v_qtd >= v_limite THEN
        RAISE EXCEPTION 'Limite diário de folgas (%) atingido em %', v_limite, NEW.data USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  IF v_self AND NOT COALESCE(v_socio, false) THEN
    IF v_wd IN (0, 6) AND NOT NEW.extra THEN
      SELECT folgas_fds_por_mes INTO v_teto FROM public.dp_config_dp WHERE company_id = NEW.company_id;
      v_teto := COALESCE(v_teto, 1);
      IF v_teto > 0 THEN
        SELECT count(*) INTO v_mensais FROM public.dp_folgas
         WHERE colaborador_id = NEW.colaborador_id AND extra = false AND status <> 'cancelada'
           AND EXTRACT(DOW FROM data) IN (0, 6)
           AND date_trunc('month', data) = date_trunc('month', NEW.data);
        IF v_mensais >= v_teto THEN
          RAISE EXCEPTION 'Você já atingiu o limite de % folga(s) de fim de semana neste mês.', v_teto USING ERRCODE = 'check_violation';
        END IF;
      END IF;
    END IF;
    IF v_fixa IS NOT NULL AND v_fixa = v_wd THEN
      RAISE EXCEPTION 'Este é seu dia de folga fixa. Use "Solicitar exceção" ou uma troca.' USING ERRCODE = 'check_violation';
    END IF;
    SELECT pa.colaborador_id INTO v_aniv FROM public.dp_prioridade_aniversario pa
      JOIN public.dp_colaboradores c ON c.id = pa.colaborador_id
     WHERE pa.company_id = NEW.company_id AND pa.ano = EXTRACT(YEAR FROM NEW.data)::int
       AND pa.mes = EXTRACT(MONTH FROM NEW.data)::int AND pa.aniversariante = true
       AND c.data_nascimento IS NOT NULL AND EXTRACT(DAY FROM c.data_nascimento) = EXTRACT(DAY FROM NEW.data)
     LIMIT 1;
    IF FOUND AND v_aniv.colaborador_id <> NEW.colaborador_id THEN
      RAISE EXCEPTION 'Data reservada para aniversariante.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 9) Marcar folga: janela considera prioridade; salvaguarda acima do limite
CREATE OR REPLACE FUNCTION public.dp_folga_marcar(p_data date)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_colab uuid; v_company uuid; v_unidade uuid; v_cargo uuid; v_setor uuid; v_nome text;
  v_janela jsonb; v_estado text; v_lim jsonb; v_conf jsonb; v_id uuid;
  v_salvaguarda boolean := false; v_fds boolean; d date; v_alternativa boolean := false;
  v_ini date; v_fim date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a data.' USING ERRCODE = '22023';
  END IF;

  v_colab := public.dp_colaborador_ativo_of(v_uid);
  IF v_colab IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: cadastro de colaborador não encontrado.' USING ERRCODE = '42501';
  END IF;

  SELECT c.company_id, c.unidade_id, c.cargo_id, c.setor_id, COALESCE(c.nome_social, c.nome)
    INTO v_company, v_unidade, v_cargo, v_setor, v_nome
    FROM public.dp_colaboradores c WHERE c.id = v_colab;

  IF p_data < CURRENT_DATE THEN
    RAISE EXCEPTION 'PAST_DATE_NOT_EDITABLE: datas passadas não podem ser marcadas.' USING ERRCODE = '22023';
  END IF;

  v_janela := public.dp_folgas_janela_efetiva(v_company, v_unidade, NULL);
  IF COALESCE((v_janela->>'ativa')::boolean, false) THEN
    v_estado := v_janela->>'estado';
    IF v_estado = 'antes' THEN
      RAISE EXCEPTION 'FOLGA_FORA_DA_JANELA: o período de escolha das folgas ainda não abriu.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_estado = 'aberta'
       AND date_trunc('month', p_data) <> date_trunc('month', (v_janela->>'competencia')::date) THEN
      RAISE EXCEPTION 'FOLGA_FORA_DA_JANELA: fora do período de escolha das folgas.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_company::text || '|folga_dia|' || COALESCE(v_unidade::text, 'sem') || '|' || p_data::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_colab::text || '|folga_self|' || p_data::text, 0));

  IF EXISTS (SELECT 1 FROM public.dp_folgas f
              WHERE f.colaborador_id = v_colab AND f.data = p_data AND f.status <> 'cancelada') THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST: você já tem folga marcada neste dia.' USING ERRCODE = '22023';
  END IF;

  v_lim := public.dp_folga_limite_dia(v_company, v_unidade, v_cargo, p_data, NULL, v_setor);
  IF COALESCE((v_lim->>'excedido')::boolean, false) THEN
    -- Salvaguarda: quem tem restrição no mês não pode ficar sem folga.
    IF private.dp_colab_tem_restricao_mes(v_colab, p_data)
       AND NOT private.dp_folga_data_bloqueada_colab(v_colab, p_data) THEN
      v_fds := EXTRACT(DOW FROM p_data) IN (0, 6);
      v_ini := GREATEST(date_trunc('month', p_data)::date, CURRENT_DATE);
      v_fim := (date_trunc('month', p_data) + interval '1 month' - interval '1 day')::date;
      d := v_ini;
      WHILE d <= v_fim AND NOT v_alternativa LOOP
        IF d <> p_data AND (EXTRACT(DOW FROM d) IN (0, 6)) = v_fds
           AND NOT private.dp_folga_data_bloqueada_colab(v_colab, d)
           AND NOT COALESCE((public.dp_folga_limite_dia(v_company, v_unidade, v_cargo, d, NULL, v_setor)->>'excedido')::boolean, false) THEN
          v_alternativa := true;
        END IF;
        d := d + 1;
      END LOOP;
      IF NOT v_alternativa THEN v_salvaguarda := true; END IF;
    END IF;
    IF NOT v_salvaguarda THEN
      RAISE EXCEPTION 'FOLGA_LIMITE_DIA: este dia já atingiu o limite de pessoas em folga.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_conf := public.dp_folga_conflito_colaboradores(v_company, v_colab, p_data);
  IF COALESCE((v_conf->>'conflito')::boolean, false) THEN
    RAISE EXCEPTION 'FOLGA_INCOMPATIBILIDADE: % já está de folga neste dia e vocês não podem folgar juntos.',
      COALESCE(v_conf->>'colega_nome', 'Outra pessoa') USING ERRCODE = 'check_violation';
  END IF;

  IF v_salvaguarda THEN
    PERFORM set_config('dp.folga_excedente_autorizado', 'on', true);
  END IF;

  INSERT INTO public.dp_folgas(company_id, colaborador_id, data, tipo, origem, status, extra, criado_por)
  VALUES (v_company, v_colab, p_data, 'normal', 'solicitacao', 'agendada', false, v_uid)
  RETURNING id INTO v_id;

  IF v_salvaguarda THEN
    PERFORM set_config('dp.folga_excedente_autorizado', 'off', true);
    INSERT INTO public.dp_notificacoes(company_id, tipo, titulo, descricao, ref_table, ref_id, para_admins, chave)
    VALUES (v_company, 'folga_acima_limite'::public.dp_notificacao_tipo,
      'Atenção à cobertura: folga acima do limite',
      format('%s agendou folga em %s acima do limite de vagas da unidade, pois não havia outra data disponível para essa pessoa no mês. Verifique a escala do dia.',
             v_nome, to_char(p_data, 'DD/MM/YYYY')),
      'dp_folgas', v_id, true, 'folga_salvaguarda|' || v_id::text);
  END IF;

  RETURN jsonb_build_object('ok', true, 'folga_id', v_id, 'limite', v_lim);
END;
$function$;
