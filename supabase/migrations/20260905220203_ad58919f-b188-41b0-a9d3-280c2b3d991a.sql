-- 1) Período mensal ligado por padrão
ALTER TABLE public.dp_config_dp ALTER COLUMN folga_janela_ativa SET DEFAULT true;

UPDATE public.dp_config_dp
   SET folga_janela_ativa = true
 WHERE folga_janela_ativa = false
   AND folga_janela_abre_dia = 10
   AND folga_janela_fecha_dia = 20;

-- 2) Tipo e nome nas regras de folga
ALTER TABLE public.dp_folga_limite_regras
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'quantidade',
  ADD COLUMN IF NOT EXISTS nome text;

UPDATE public.dp_folga_limite_regras r
   SET tipo = 'cargo'
 WHERE EXISTS (SELECT 1 FROM public.dp_folga_limite_regra_cargos rc WHERE rc.regra_id = r.id);

ALTER TABLE public.dp_folga_limite_regras
  DROP CONSTRAINT IF EXISTS dp_folga_limite_regras_tipo_chk;
ALTER TABLE public.dp_folga_limite_regras
  ADD CONSTRAINT dp_folga_limite_regras_tipo_chk
  CHECK (tipo IN ('quantidade', 'cargo', 'colaboradores'));

-- 3) Colaboradores que não folgam juntos
CREATE TABLE IF NOT EXISTS public.dp_folga_limite_regra_colaboradores (
  regra_id uuid NOT NULL REFERENCES public.dp_folga_limite_regras(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (regra_id, colaborador_id)
);

CREATE INDEX IF NOT EXISTS dp_folga_limite_regra_colab_colab_idx
  ON public.dp_folga_limite_regra_colaboradores(colaborador_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_folga_limite_regra_colaboradores TO authenticated;
GRANT ALL ON public.dp_folga_limite_regra_colaboradores TO service_role;

ALTER TABLE public.dp_folga_limite_regra_colaboradores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dp_folga_limite_colab_read ON public.dp_folga_limite_regra_colaboradores;
CREATE POLICY dp_folga_limite_colab_read
  ON public.dp_folga_limite_regra_colaboradores FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.dp_folga_limite_regras r
     WHERE r.id = regra_id AND private.is_company_member(auth.uid(), r.company_id)));

DROP POLICY IF EXISTS dp_folga_limite_colab_write ON public.dp_folga_limite_regra_colaboradores;
CREATE POLICY dp_folga_limite_colab_write
  ON public.dp_folga_limite_regra_colaboradores FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.dp_folga_limite_regras r
     WHERE r.id = regra_id AND private.is_company_admin_or_owner(auth.uid(), r.company_id)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.dp_folga_limite_regras r
     WHERE r.id = regra_id AND private.is_company_admin_or_owner(auth.uid(), r.company_id)));

-- 4) Limite do dia considera apenas regras de quantidade/cargo
CREATE OR REPLACE FUNCTION public.dp_folga_limite_dia(p_company uuid, p_unidade uuid, p_cargo uuid, p_data date, p_ignorar_colaborador uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_wd int;
  v_limite int;
  v_origem text := 'sem_limite';
  v_regra_id uuid;
  v_por_cargo boolean := false;
  v_em_folga int := 0;
BEGIN
  IF p_company IS NULL OR p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: empresa e data são obrigatórias.' USING ERRCODE = '22023';
  END IF;

  IF v_uid IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.company_members m
                      WHERE m.company_id = p_company AND m.user_id = v_uid)
     AND NOT EXISTS (SELECT 1 FROM public.companies c
                      WHERE c.id = p_company AND c.owner_id = v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN: empresa fora do seu escopo.' USING ERRCODE = '42501';
  END IF;

  v_wd := EXTRACT(DOW FROM p_data)::int;

  SELECT dc.limite_folgas INTO v_limite
    FROM public.dp_dia_config dc
   WHERE dc.company_id = p_company
     AND dc.data = p_data
     AND (dc.unidade_id IS NULL OR dc.unidade_id = p_unidade)
   ORDER BY (dc.unidade_id IS NOT NULL) DESC
   LIMIT 1;

  IF v_limite IS NOT NULL THEN
    v_origem := 'excecao_data';
  ELSE
    SELECT r.maximo, r.id,
           EXISTS (SELECT 1 FROM public.dp_folga_limite_regra_cargos rc WHERE rc.regra_id = r.id)
      INTO v_limite, v_regra_id, v_por_cargo
      FROM public.dp_folga_limite_regras r
     WHERE r.company_id = p_company
       AND r.ativo = true
       AND r.tipo IN ('quantidade', 'cargo')
       AND (r.unidade_id IS NULL OR r.unidade_id = p_unidade)
       AND (r.dia_semana IS NULL OR r.dia_semana = v_wd)
       AND (r.vigencia_inicio IS NULL OR r.vigencia_inicio <= p_data)
       AND (r.vigencia_fim IS NULL OR r.vigencia_fim >= p_data)
       AND (
         NOT EXISTS (SELECT 1 FROM public.dp_folga_limite_regra_cargos rc WHERE rc.regra_id = r.id)
         OR (p_cargo IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.dp_folga_limite_regra_cargos rc
               WHERE rc.regra_id = r.id AND rc.cargo_id = p_cargo))
       )
     ORDER BY (r.unidade_id IS NOT NULL) DESC,
              (EXISTS (SELECT 1 FROM public.dp_folga_limite_regra_cargos rc WHERE rc.regra_id = r.id)) DESC,
              (r.dia_semana IS NOT NULL) DESC,
              r.vigencia_inicio DESC NULLS LAST
     LIMIT 1;

    IF v_limite IS NOT NULL THEN
      v_origem := 'regra_recorrente';
    END IF;
  END IF;

  SELECT count(*) INTO v_em_folga
    FROM public.dp_colaboradores c
   WHERE c.company_id = p_company
     AND c.deleted_at IS NULL
     AND (p_unidade IS NULL OR c.unidade_id = p_unidade)
     AND (NOT v_por_cargo OR p_cargo IS NULL OR c.cargo_id = p_cargo)
     AND (p_ignorar_colaborador IS NULL OR c.id <> p_ignorar_colaborador)
     AND (
       EXISTS (SELECT 1 FROM public.dp_folgas f
                WHERE f.colaborador_id = c.id AND f.data = p_data
                  AND f.status <> 'cancelada' AND f.extra = false
                  AND f.tipo NOT IN ('ferias', 'licenca'))
       OR EXISTS (SELECT 1 FROM public.dp_solicitacoes s
                   WHERE s.colaborador_id = c.id AND s.tipo = 'folga'
                     AND s.data_alvo = p_data AND s.status = 'aprovada')
     );

  RETURN jsonb_build_object(
    'limite', v_limite,
    'origem', v_origem,
    'regra_id', v_regra_id,
    'por_cargo', v_por_cargo,
    'em_folga', COALESCE(v_em_folga, 0),
    'disponivel', CASE WHEN v_limite IS NULL THEN NULL
                       ELSE GREATEST(v_limite - COALESCE(v_em_folga, 0), 0) END,
    'excedido', CASE WHEN v_limite IS NULL THEN false
                     ELSE COALESCE(v_em_folga, 0) >= v_limite END);
END;
$function$;

-- 5) Conflito entre colaboradores que não podem folgar juntos
CREATE OR REPLACE FUNCTION public.dp_folga_conflito_colaboradores(
  _company uuid, _colaborador uuid, _data date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_wd int;
  v_unidade uuid;
  v_row record;
BEGIN
  IF _company IS NULL OR _colaborador IS NULL OR _data IS NULL THEN
    RETURN jsonb_build_object('conflito', false);
  END IF;

  v_wd := EXTRACT(DOW FROM _data)::int;
  SELECT unidade_id INTO v_unidade FROM public.dp_colaboradores WHERE id = _colaborador;

  SELECT r.id AS regra_id, r.nome, c2.id AS colega_id, c2.nome AS colega_nome
    INTO v_row
    FROM public.dp_folga_limite_regras r
    JOIN public.dp_folga_limite_regra_colaboradores m1
      ON m1.regra_id = r.id AND m1.colaborador_id = _colaborador
    JOIN public.dp_folga_limite_regra_colaboradores m2
      ON m2.regra_id = r.id AND m2.colaborador_id <> _colaborador
    JOIN public.dp_colaboradores c2 ON c2.id = m2.colaborador_id
   WHERE r.company_id = _company
     AND r.ativo = true
     AND r.tipo = 'colaboradores'
     AND (r.unidade_id IS NULL OR r.unidade_id = v_unidade)
     AND (r.dia_semana IS NULL OR r.dia_semana = v_wd)
     AND (r.vigencia_inicio IS NULL OR r.vigencia_inicio <= _data)
     AND (r.vigencia_fim IS NULL OR r.vigencia_fim >= _data)
     AND (
       EXISTS (SELECT 1 FROM public.dp_folgas f
                WHERE f.colaborador_id = c2.id AND f.data = _data
                  AND f.status <> 'cancelada' AND f.extra = false
                  AND f.tipo NOT IN ('ferias', 'licenca'))
       OR EXISTS (SELECT 1 FROM public.dp_solicitacoes s
                   WHERE s.colaborador_id = c2.id AND s.tipo = 'folga'
                     AND s.data_alvo = _data AND s.status IN ('pendente', 'aprovada'))
     )
   LIMIT 1;

  IF v_row.colega_id IS NULL THEN
    RETURN jsonb_build_object('conflito', false);
  END IF;

  RETURN jsonb_build_object(
    'conflito', true,
    'regra_id', v_row.regra_id,
    'regra_nome', v_row.nome,
    'colega_id', v_row.colega_id,
    'colega_nome', v_row.colega_nome);
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_folga_conflito_colaboradores(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folga_conflito_colaboradores(uuid, uuid, date) TO authenticated, service_role;

-- 6) dp_folga_criar_admin devolve o conflito
CREATE OR REPLACE FUNCTION public.dp_folga_criar_admin(p_colaborador_id uuid, p_data date, p_tipo text DEFAULT 'normal'::text, p_extra boolean DEFAULT false, p_observacao text DEFAULT NULL::text, p_confirmar_deficit boolean DEFAULT false, p_substituir_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_unidade uuid;
  v_cargo uuid;
  v_res jsonb;
  v_conf jsonb;
  v_id uuid;
  v_canceladas int := 0;
  r record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_colaborador_id IS NULL OR p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe colaborador e data.' USING ERRCODE = '22023';
  END IF;

  SELECT company_id, unidade_id, cargo_id INTO v_company, v_unidade, v_cargo
    FROM public.dp_colaboradores
   WHERE id = p_colaborador_id AND ativo = true AND deleted_at IS NULL;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: colaborador inexistente ou inativo.' USING ERRCODE = '23503';
  END IF;

  IF NOT private.is_company_admin_or_owner(v_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: apenas responsáveis da empresa podem lançar folgas.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_colaborador_id::text || '|folga|' || p_data::text, 0));

  v_res := public.dp_folga_limite_dia(
    v_company, v_unidade, v_cargo, p_data, p_colaborador_id);

  IF COALESCE((v_res->>'excedido')::boolean, false)
     AND COALESCE(p_extra, false) = false
     AND p_tipo NOT IN ('ferias', 'licenca') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'limite_atingido', true,
      'limite', v_res,
      'mensagem', format(
        'Este dia já atingiu o limite de %s pessoa(s) em folga.', (v_res->>'limite')::int));
  END IF;

  IF p_tipo NOT IN ('ferias', 'licenca') AND COALESCE(p_extra, false) = false THEN
    v_conf := public.dp_folga_conflito_colaboradores(v_company, p_colaborador_id, p_data);
    IF COALESCE((v_conf->>'conflito')::boolean, false) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'incompatibilidade', true,
        'colega', v_conf->>'colega_nome',
        'conflito', v_conf,
        'mensagem', format(
          '%s já está de folga neste dia e essas pessoas não podem folgar juntas.',
          v_conf->>'colega_nome'));
    END IF;
  END IF;

  IF p_substituir_ids IS NOT NULL AND array_length(p_substituir_ids, 1) > 0 THEN
    FOR r IN
      UPDATE public.dp_folgas f
         SET status = 'cancelada',
             observacao = btrim(concat_ws(' | ', NULLIF(f.observacao, ''),
               'Substituída por folga de ' || to_char(p_data, 'DD/MM/YYYY'))),
             updated_at = now()
       WHERE f.id = ANY(p_substituir_ids)
         AND f.company_id = v_company
         AND f.colaborador_id = p_colaborador_id
         AND f.status <> 'cancelada'
      RETURNING f.id, f.data
    LOOP
      v_canceladas := v_canceladas + 1;
      PERFORM public.insert_audit_log(
        'folga_cancelada_substituicao', 'dp_folgas', r.id::text,
        jsonb_build_object('company_id', v_company, 'colaborador_id', p_colaborador_id,
                           'data_cancelada', r.data, 'data_nova', p_data));
    END LOOP;
  END IF;

  INSERT INTO public.dp_folgas(
    company_id, colaborador_id, data, tipo, origem, status, extra, observacao, criado_por)
  VALUES (v_company, p_colaborador_id, p_data, p_tipo::public.dp_folga_tipo,
          'admin_manual', 'agendada', COALESCE(p_extra, false),
          NULLIF(btrim(COALESCE(p_observacao, '')), ''), v_uid)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true, 'folga_id', v_id, 'canceladas', v_canceladas, 'limite', v_res);
END;
$function$;

-- 7) dp_folga_solicitar recusa o conflito
CREATE OR REPLACE FUNCTION public.dp_folga_solicitar(p_data date, p_motivo text DEFAULT NULL::text, p_fora_da_janela boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_colab uuid;
  v_company uuid;
  v_unidade uuid;
  v_cargo uuid;
  v_res jsonb;
  v_conf jsonb;
  v_janela jsonb;
  v_fora boolean := false;
  v_id uuid;
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
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

  SELECT c.company_id, c.unidade_id, c.cargo_id
    INTO v_company, v_unidade, v_cargo
    FROM public.dp_colaboradores c WHERE c.id = v_colab;

  IF p_data < CURRENT_DATE THEN
    RAISE EXCEPTION 'PAST_DATE_NOT_EDITABLE: datas passadas não podem ser solicitadas.'
      USING ERRCODE = '22023';
  END IF;

  v_janela := public.dp_folgas_janela_efetiva(v_company, v_unidade, NULL);
  IF COALESCE((v_janela->>'ativa')::boolean, false) THEN
    IF (v_janela->>'estado') <> 'aberta'
       OR date_trunc('month', p_data) <> date_trunc('month', (v_janela->>'competencia')::date) THEN
      IF NOT COALESCE(p_fora_da_janela, false) THEN
        RAISE EXCEPTION 'FOLGA_FORA_DA_JANELA: fora do período de escolha das folgas.'
          USING ERRCODE = 'check_violation';
      END IF;
      v_fora := true;
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_colab::text || '|solic_folga|' || p_data::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.dp_solicitacoes s
     WHERE s.colaborador_id = v_colab AND s.tipo = 'folga'
       AND s.data_alvo = p_data AND s.status = 'pendente'
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST: já existe uma solicitação pendente para este dia.'
      USING ERRCODE = '22023';
  END IF;

  v_res := public.dp_folga_limite_dia(v_company, v_unidade, v_cargo, p_data, v_colab);

  IF COALESCE((v_res->>'excedido')::boolean, false) THEN
    RAISE EXCEPTION 'FOLGA_LIMITE_DIA: este dia já atingiu o limite de pessoas em folga.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_conf := public.dp_folga_conflito_colaboradores(v_company, v_colab, p_data);
  IF COALESCE((v_conf->>'conflito')::boolean, false) THEN
    RAISE EXCEPTION 'FOLGA_INCOMPATIBILIDADE: % já está de folga neste dia e vocês não podem folgar juntos.',
      COALESCE(v_conf->>'colega_nome', 'Outra pessoa') USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.dp_solicitacoes(
    company_id, colaborador_id, criado_por, tipo, data_alvo, motivo, status, fora_da_janela)
  VALUES (v_company, v_colab, v_uid, 'folga', p_data,
          CASE WHEN v_fora THEN
            'FORA_DA_JANELA_DE_MARCACAO' || COALESCE(' — ' || v_motivo, '')
          ELSE v_motivo END,
          'pendente', v_fora)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true, 'solicitacao_id', v_id, 'limite', v_res,
    'fora_da_janela', v_fora, 'janela', v_janela);
END;
$function$;

-- 8) Distribuição automática evita dias em conflito
CREATE OR REPLACE FUNCTION public.dp_folga_autoatribuir_competencia(_company uuid, _unidade uuid, _competencia date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_comp date := date_trunc('month', _competencia)::date;
  v_fim date := (date_trunc('month', _competencia) + interval '1 month - 1 day')::date;
  v_dias int[];
  v_exigidas int;
  v_exec_id uuid;
  v_colab record;
  v_data date;
  v_escolhida date;
  v_lim jsonb;
  v_melhor_ocupacao int;
  v_faltam int;
  v_geradas int := 0;
  v_excedidas int := 0;
  v_detalhes jsonb := '[]'::jsonb;
  v_contingencia boolean;
  v_ja int;
  v_conflitou boolean;
BEGIN
  IF _company IS NULL OR _competencia IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: empresa e competência obrigatórias.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    _company::text || '|folga_auto|' || COALESCE(_unidade::text, 'todas') || '|' || v_comp::text, 0));

  SELECT id INTO v_exec_id
    FROM public.dp_folga_autoatribuicao_execucoes
   WHERE company_id = _company
     AND COALESCE(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = COALESCE(_unidade, '00000000-0000-0000-0000-000000000000'::uuid)
     AND competencia = v_comp
   FOR UPDATE;

  IF v_exec_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.dp_folga_autoatribuicao_execucoes
     WHERE id = v_exec_id AND status = 'concluida'
  ) THEN
    RETURN jsonb_build_object('ok', true, 'idempotente', true, 'execucao_id', v_exec_id);
  END IF;

  IF v_exec_id IS NULL THEN
    INSERT INTO public.dp_folga_autoatribuicao_execucoes(
      company_id, unidade_id, competencia, status, iniciada_em)
    VALUES (_company, _unidade, v_comp, 'processando', now())
    RETURNING id INTO v_exec_id;
  ELSE
    UPDATE public.dp_folga_autoatribuicao_execucoes
       SET status = 'processando', iniciada_em = now(), erro = NULL
     WHERE id = v_exec_id;
  END IF;

  v_dias := public.dp_folga_dias_fds_aplicaveis(_company, _unidade);
  SELECT COALESCE((public.dp_folgas_janela_efetiva(_company, _unidade, NULL)->>'folgas_exigidas')::int, 1)
    INTO v_exigidas;

  IF v_exigidas <= 0 OR v_dias IS NULL OR array_length(v_dias, 1) IS NULL THEN
    UPDATE public.dp_folga_autoatribuicao_execucoes
       SET status = 'concluida', concluida_em = now(), quantidade_gerada = 0, quantidade_excedida = 0
     WHERE id = v_exec_id;
    RETURN jsonb_build_object('ok', true, 'geradas', 0, 'excedidas', 0, 'execucao_id', v_exec_id);
  END IF;

  FOR v_colab IN
    SELECT c.id, c.cargo_id, c.unidade_id, c.nome
      FROM public.dp_colaboradores c
     WHERE c.company_id = _company
       AND c.deleted_at IS NULL
       AND c.ativo IS NOT false
       AND (_unidade IS NULL OR c.unidade_id = _unidade)
       AND lower(COALESCE(c.vinculo_label, '')) NOT IN ('socio', 'sócio')
     ORDER BY c.nome
  LOOP
    SELECT count(*) INTO v_ja
      FROM public.dp_folgas f
     WHERE f.colaborador_id = v_colab.id
       AND f.data BETWEEN v_comp AND v_fim
       AND f.status <> 'cancelada'
       AND f.extra = false
       AND f.tipo NOT IN ('ferias', 'licenca')
       AND EXTRACT(DOW FROM f.data)::int = ANY (v_dias);

    v_faltam := v_exigidas - COALESCE(v_ja, 0);

    WHILE v_faltam > 0 LOOP
      v_escolhida := NULL;
      v_melhor_ocupacao := NULL;
      v_contingencia := false;
      v_conflitou := false;

      FOR v_data IN
        SELECT d::date FROM generate_series(v_comp, v_fim, interval '1 day') AS d
         WHERE EXTRACT(DOW FROM d)::int = ANY (v_dias)
         ORDER BY d
      LOOP
        IF EXISTS (
          SELECT 1 FROM public.dp_folgas f
           WHERE f.colaborador_id = v_colab.id AND f.data = v_data AND f.status <> 'cancelada'
        ) THEN
          CONTINUE;
        END IF;

        IF COALESCE((public.dp_folga_conflito_colaboradores(
              _company, v_colab.id, v_data)->>'conflito')::boolean, false) THEN
          v_conflitou := true;
          CONTINUE;
        END IF;

        v_lim := public.dp_folga_limite_dia(_company, v_colab.unidade_id, v_colab.cargo_id, v_data, NULL);

        IF COALESCE((v_lim->>'excedido')::boolean, false) THEN
          CONTINUE;
        END IF;

        IF (v_lim->>'em_folga')::int = 0 THEN
          v_escolhida := v_data;
          EXIT;
        END IF;

        IF v_melhor_ocupacao IS NULL OR (v_lim->>'em_folga')::int < v_melhor_ocupacao THEN
          v_melhor_ocupacao := (v_lim->>'em_folga')::int;
          v_escolhida := v_data;
        END IF;
      END LOOP;

      IF v_escolhida IS NULL THEN
        v_contingencia := true;
        SELECT d::date INTO v_escolhida
          FROM generate_series(v_comp, v_fim, interval '1 day') AS d
         WHERE EXTRACT(DOW FROM d)::int = ANY (v_dias)
           AND NOT EXISTS (
             SELECT 1 FROM public.dp_folgas f
              WHERE f.colaborador_id = v_colab.id AND f.data = d::date
                AND f.status <> 'cancelada')
           AND NOT COALESCE((public.dp_folga_conflito_colaboradores(
                 _company, v_colab.id, d::date)->>'conflito')::boolean, false)
         ORDER BY d DESC
         LIMIT 1;
      END IF;

      IF v_escolhida IS NULL THEN
        v_detalhes := v_detalhes || jsonb_build_object(
          'colaborador_id', v_colab.id,
          'colaborador_nome', v_colab.nome,
          'unidade_id', v_colab.unidade_id,
          'competencia', v_comp,
          'motivo', CASE WHEN v_conflitou THEN 'SEM_DIA_SEM_CONFLITO' ELSE 'SEM_DIA_DISPONIVEL' END);
        EXIT;
      END IF;

      v_lim := public.dp_folga_limite_dia(_company, v_colab.unidade_id, v_colab.cargo_id, v_escolhida, NULL);

      IF v_contingencia THEN
        PERFORM set_config('dp.folga_auto_contingencia', 'on', true);
      END IF;

      INSERT INTO public.dp_folgas(
        company_id, colaborador_id, data, tipo, origem, status, extra, observacao)
      VALUES (_company, v_colab.id, v_escolhida, 'normal',
              'auto_fechamento_periodo', 'agendada', false,
              'Folga definida automaticamente no fechamento do período de escolha.');

      IF v_contingencia THEN
        PERFORM set_config('dp.folga_auto_contingencia', 'off', true);
        v_excedidas := v_excedidas + 1;
        v_detalhes := v_detalhes || jsonb_build_object(
          'colaborador_id', v_colab.id,
          'colaborador_nome', v_colab.nome,
          'cargo_id', v_colab.cargo_id,
          'unidade_id', v_colab.unidade_id,
          'data', v_escolhida,
          'competencia', v_comp,
          'regra_id', v_lim->'regra_id',
          'limite', v_lim->'limite',
          'ocupacao_anterior', v_lim->'em_folga',
          'ocupacao_resultante', COALESCE((v_lim->>'em_folga')::int, 0) + 1,
          'motivo', 'SEM_VAGA_NO_MES');
      END IF;

      v_geradas := v_geradas + 1;
      v_faltam := v_faltam - 1;
    END LOOP;
  END LOOP;

  UPDATE public.dp_folga_autoatribuicao_execucoes
     SET status = 'concluida', concluida_em = now(),
         quantidade_gerada = v_geradas, quantidade_excedida = v_excedidas,
         detalhes = v_detalhes
   WHERE id = v_exec_id;

  RETURN jsonb_build_object(
    'ok', true, 'execucao_id', v_exec_id, 'geradas', v_geradas,
    'excedidas', v_excedidas, 'competencia', v_comp);
END;
$function$;