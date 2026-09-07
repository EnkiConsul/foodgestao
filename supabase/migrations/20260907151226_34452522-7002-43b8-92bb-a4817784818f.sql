-- 1. Tipos de notificação da disponibilidade
ALTER TYPE public.dp_notificacao_tipo ADD VALUE IF NOT EXISTS 'disponibilidade_janela_abriu';
ALTER TYPE public.dp_notificacao_tipo ADD VALUE IF NOT EXISTS 'disponibilidade_janela_fechando';
ALTER TYPE public.dp_notificacao_tipo ADD VALUE IF NOT EXISTS 'disponibilidade_alteracao_tardia';

-- 2. Regras da janela de disponibilidade
ALTER TABLE public.dp_convocacao_config
  ADD COLUMN IF NOT EXISTS disponibilidade_janela_abre_dia integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS disponibilidade_janela_fecha_dia integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS disponibilidade_reserva_folga boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS disponibilidade_lembrete_dias integer NOT NULL DEFAULT 2;

ALTER TABLE public.dp_convocacao_config
  DROP CONSTRAINT IF EXISTS chk_dp_conv_config_disponibilidade;
ALTER TABLE public.dp_convocacao_config
  ADD CONSTRAINT chk_dp_conv_config_disponibilidade CHECK (
    disponibilidade_janela_abre_dia BETWEEN 1 AND 28
    AND disponibilidade_janela_fecha_dia BETWEEN 1 AND 28
    AND disponibilidade_janela_abre_dia <= disponibilidade_janela_fecha_dia
    AND disponibilidade_lembrete_dias BETWEEN 0 AND 15
  );

-- 3. Metadados da indisponibilidade (sem apagar nada existente)
ALTER TABLE public.dp_indisponibilidades
  ADD COLUMN IF NOT EXISTS informada_em timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS dentro_da_janela boolean,
  ADD COLUMN IF NOT EXISTS alteracao_tardia boolean NOT NULL DEFAULT false;

-- 4. Config resolvida devolve também os novos padrões
CREATE OR REPLACE FUNCTION public.dp_convocacao_config_resolvida(_company_id uuid, _unidade_id uuid DEFAULT NULL::uuid)
 RETURNS dp_convocacao_config
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE v_cfg public.dp_convocacao_config;
BEGIN
  IF _unidade_id IS NOT NULL THEN
    SELECT * INTO v_cfg FROM public.dp_convocacao_config
      WHERE company_id = _company_id AND unidade_id = _unidade_id;
    IF FOUND THEN RETURN v_cfg; END IF;
  END IF;

  SELECT * INTO v_cfg FROM public.dp_convocacao_config
    WHERE company_id = _company_id AND unidade_id IS NULL;
  IF FOUND THEN RETURN v_cfg; END IF;

  v_cfg.id := NULL;
  v_cfg.company_id := _company_id;
  v_cfg.unidade_id := _unidade_id;
  v_cfg.antecedencia_minima_dias := 3;
  v_cfg.prazo_resposta_dias_uteis := 1;
  v_cfg.aprovacao_modo := 'somente_excecoes';
  v_cfg.sub_intermitente_por_intermitente := true;
  v_cfg.sub_intermitente_por_freelancer := true;
  v_cfg.sub_freelancer_por_intermitente := true;
  v_cfg.sub_freelancer_por_freelancer := true;
  v_cfg.sub_fixo_em_folga_dominical := false;
  v_cfg.reabre_vaga_em_desistencia := true;
  v_cfg.autonomia_colaborador_desistir := true;
  v_cfg.permite_oferta_aberta := true;
  v_cfg.exige_justificativa_excecao := true;
  v_cfg.disponibilidade_janela_abre_dia := 1;
  v_cfg.disponibilidade_janela_fecha_dia := 10;
  v_cfg.disponibilidade_reserva_folga := false;
  v_cfg.disponibilidade_lembrete_dias := 2;
  RETURN v_cfg;
END;
$function$;

-- 5. Cálculo único da janela da competência (fonte da verdade para portal e gestor)
CREATE OR REPLACE FUNCTION public.dp_disponibilidade_janela(
  _company_id uuid,
  _unidade_id uuid DEFAULT NULL::uuid,
  _competencia date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg public.dp_convocacao_config;
  v_tz text;
  v_hoje date;
  v_comp date;
  v_ref date;
  v_abre date;
  v_fecha date;
  v_estado text;
BEGIN
  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a empresa.' USING ERRCODE = '22023';
  END IF;

  v_cfg := public.dp_convocacao_config_resolvida(_company_id, _unidade_id);
  v_tz := public.dp_convocacao_timezone(_company_id, _unidade_id);
  v_hoje := (now() AT TIME ZONE v_tz)::date;
  v_comp := date_trunc('month', COALESCE(_competencia, v_hoje))::date;

  -- a janela acontece no mês anterior à competência planejada
  v_ref := (v_comp - interval '1 month')::date;
  v_abre := v_ref + (v_cfg.disponibilidade_janela_abre_dia - 1);
  v_fecha := v_ref + (v_cfg.disponibilidade_janela_fecha_dia - 1);

  v_estado := CASE
    WHEN v_hoje < v_abre THEN 'antes'
    WHEN v_hoje <= v_fecha THEN 'aberta'
    ELSE 'encerrada'
  END;

  RETURN jsonb_build_object(
    'competencia', v_comp,
    'hoje', v_hoje,
    'abre', v_abre,
    'fecha', v_fecha,
    'estado', v_estado,
    'abre_dia', v_cfg.disponibilidade_janela_abre_dia,
    'fecha_dia', v_cfg.disponibilidade_janela_fecha_dia,
    'reserva_folga', v_cfg.disponibilidade_reserva_folga,
    'lembrete_dias', v_cfg.disponibilidade_lembrete_dias,
    'lembrete_em', v_fecha - v_cfg.disponibilidade_lembrete_dias,
    'timezone', v_tz);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.dp_disponibilidade_janela(uuid, uuid, date) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_disponibilidade_janela(uuid, uuid, date) TO authenticated;

-- 6. Janela do próprio trabalhador (empresa/unidade derivadas da sessão)
CREATE OR REPLACE FUNCTION public.dp_minha_disponibilidade_janela(_competencia date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_colab_id uuid;
  v_company uuid;
  v_unidade uuid;
  v_regime public.dp_regime_trabalho;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;

  v_colab_id := public.dp_colaborador_ativo_of(v_uid);
  IF v_colab_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: cadastro de colaborador não encontrado.' USING ERRCODE = '42501';
  END IF;

  SELECT c.company_id, c.unidade_id, c.regime
    INTO v_company, v_unidade, v_regime
    FROM public.dp_colaboradores c
   WHERE c.id = v_colab_id;

  RETURN public.dp_disponibilidade_janela(v_company, v_unidade, _competencia)
       || jsonb_build_object(
            'convocavel', COALESCE(public.dp_regime_convocavel(v_regime), false),
            'regime', v_regime);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.dp_minha_disponibilidade_janela(date) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_minha_disponibilidade_janela(date) TO authenticated;

-- 7. Marcar indisponibilidade agora grava janela/alteração tardia e avisa o gestor
CREATE OR REPLACE FUNCTION public.dp_indisponibilidade_marcar(p_data date, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_colab_id uuid;
  v_company uuid;
  v_unidade uuid;
  v_nome text;
  v_regime public.dp_regime_trabalho;
  v_tz text;
  v_hoje date;
  v_agora timestamptz := now();
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_existente uuid;
  v_id uuid;
  v_encerradas int := 0;
  v_temporais int := 0;
  v_enc text;
  v_status public.dp_convocacao_status;
  v_mot text;
  v_evento text;
  v_janela jsonb;
  v_estado_janela text;
  v_tardia boolean;
  r record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a data.' USING ERRCODE = '22023';
  END IF;

  v_colab_id := public.dp_colaborador_ativo_of(v_uid);
  IF v_colab_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: cadastro de colaborador não encontrado.' USING ERRCODE = '42501';
  END IF;

  SELECT c.company_id, c.unidade_id, c.regime, c.nome
    INTO v_company, v_unidade, v_regime, v_nome
    FROM public.dp_colaboradores c
   WHERE c.id = v_colab_id;

  IF NOT COALESCE(public.dp_regime_convocavel(v_regime), false) THEN
    RAISE EXCEPTION 'REGIME_NAO_CONVOCAVEL: este vínculo utiliza o fluxo de folgas.'
      USING ERRCODE = '42501';
  END IF;

  v_tz := public.dp_convocacao_timezone(v_company, v_unidade);
  v_hoje := (v_agora AT TIME ZONE v_tz)::date;

  IF p_data < v_hoje THEN
    RAISE EXCEPTION 'PAST_DATE_NOT_EDITABLE: datas passadas não podem ser alteradas.'
      USING ERRCODE = '22023';
  END IF;

  v_janela := public.dp_disponibilidade_janela(
    v_company, v_unidade, date_trunc('month', p_data)::date);
  v_estado_janela := v_janela->>'estado';
  v_tardia := (v_estado_janela = 'encerrada');

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_colab_id::text || '|' || p_data::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.dp_convocacoes c
     WHERE c.company_id = v_company
       AND c.colaborador_id = v_colab_id
       AND c.data = p_data
       AND (c.status IN ('aceita', 'encerrada_operacionalmente') OR c.comparecimento IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'ACCEPTED_CALL_REQUIRES_REPLACEMENT: convocação confirmada neste dia.'
      USING ERRCODE = '22023';
  END IF;

  SELECT i.id INTO v_existente
    FROM public.dp_indisponibilidades i
   WHERE i.colaborador_id = v_colab_id
     AND i.data = p_data
     AND i.cancelada_em IS NULL
   LIMIT 1;

  IF v_existente IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'indisponibilidade_id', v_existente, 'data', p_data,
      'idempotente', true, 'ofertas_encerradas', 0, 'ofertas_encerradas_por_tempo', 0,
      'janela', v_estado_janela, 'alteracao_tardia', false);
  END IF;

  INSERT INTO public.dp_indisponibilidades(
    company_id, colaborador_id, data, motivo, origem, criado_por,
    informada_em, dentro_da_janela, alteracao_tardia)
  VALUES (v_company, v_colab_id, p_data, v_motivo, 'colaborador', v_uid,
          v_agora, v_estado_janela = 'aberta', v_tardia)
  RETURNING id INTO v_id;

  -- 7a. ofertas já encerradas pelo tempo recebem o motivo temporal correto
  FOR r IN
    SELECT c.id, c.ocorrencia_id, c.prazo_resposta, c.inicio_previsto
      FROM public.dp_convocacoes c
     WHERE c.company_id = v_company
       AND c.colaborador_id = v_colab_id
       AND c.data = p_data
       AND c.status = 'pendente'
       AND c.ocorrencia_id IS NOT NULL
     FOR UPDATE
  LOOP
    v_enc := public.dp_convocacao_estado_encerramento(
      r.prazo_resposta, r.inicio_previsto, v_agora);
    IF v_enc IS NULL THEN
      CONTINUE;
    END IF;

    IF v_enc = 'sem_resposta' THEN
      v_status := 'sem_resposta';
      v_mot := 'DEADLINE_EXPIRED';
      v_evento := 'oferta_sem_resposta';
    ELSE
      v_status := 'encerrada_inicio_ocorrencia';
      v_mot := 'OCCURRENCE_ALREADY_STARTED';
      v_evento := 'oferta_encerrada_inicio';
    END IF;

    UPDATE public.dp_convocacoes
       SET status = v_status, encerrada_em = v_agora,
           encerramento_motivo = v_mot, updated_at = now()
     WHERE id = r.id AND status = 'pendente';

    IF FOUND THEN
      v_temporais := v_temporais + 1;
      PERFORM public.dp_convocacao_log_evento_trabalhador(
        v_company, NULL, r.ocorrencia_id, v_evento,
        jsonb_build_object('convocacao_id', r.id, 'motivo', v_mot, 'data', p_data));
    END IF;
  END LOOP;

  -- 7b. ofertas ainda vivas são encerradas pela indisponibilidade declarada
  FOR r IN
    WITH enc AS (
      UPDATE public.dp_convocacoes c
         SET status = 'cancelada',
             encerrada_em = v_agora,
             encerramento_motivo = 'INDISPONIBILIDADE_DECLARADA',
             updated_at = now()
       WHERE c.company_id = v_company
         AND c.colaborador_id = v_colab_id
         AND c.data = p_data
         AND c.status = 'pendente'
         AND c.ocorrencia_id IS NOT NULL
      RETURNING c.id, c.ocorrencia_id
    )
    SELECT * FROM enc
  LOOP
    v_encerradas := v_encerradas + 1;
    PERFORM public.dp_convocacao_log_evento_trabalhador(
      v_company, NULL, r.ocorrencia_id, 'oferta_encerrada_indisponibilidade',
      jsonb_build_object(
        'convocacao_id', r.id,
        'motivo', 'INDISPONIBILIDADE_DECLARADA',
        'data', p_data));
  END LOOP;

  IF v_tardia THEN
    INSERT INTO public.dp_notificacoes(
      company_id, tipo, titulo, descricao, ref_table, ref_id, para_admins)
    VALUES (
      v_company, 'disponibilidade_alteracao_tardia',
      'Alteração tardia de disponibilidade',
      COALESCE(v_nome, 'Trabalhador') || ' informou indisponibilidade em '
        || to_char(p_data, 'DD/MM/YYYY') || ' após o fechamento do período de planejamento.',
      'dp_indisponibilidades', v_id, true);
  END IF;

  PERFORM public.insert_audit_log(
    CASE WHEN v_tardia THEN 'indisponibilidade_alteracao_tardia' ELSE 'indisponibilidade_criada' END,
    'dp_indisponibilidades', v_id::text,
    jsonb_build_object('data', p_data, 'ofertas_encerradas', v_encerradas,
                       'ofertas_encerradas_por_tempo', v_temporais,
                       'janela', v_estado_janela,
                       'janela_abre', v_janela->>'abre',
                       'janela_fecha', v_janela->>'fecha'));

  RETURN jsonb_build_object(
    'ok', true, 'indisponibilidade_id', v_id, 'data', p_data,
    'idempotente', false, 'ofertas_encerradas', v_encerradas,
    'ofertas_encerradas_por_tempo', v_temporais,
    'janela', v_estado_janela, 'alteracao_tardia', v_tardia);
END;
$function$;

-- 8. Salvar config passa a persistir as regras de disponibilidade
DROP FUNCTION IF EXISTS public.dp_convocacao_salvar_config(uuid, uuid, integer, integer, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, timestamptz);

CREATE OR REPLACE FUNCTION public.dp_convocacao_salvar_config(
  p_company_id uuid,
  p_unidade_id uuid DEFAULT NULL::uuid,
  p_antecedencia_minima_dias integer DEFAULT 3,
  p_prazo_resposta_dias_uteis integer DEFAULT 1,
  p_aprovacao_modo text DEFAULT 'somente_excecoes'::text,
  p_sub_intermitente_por_intermitente boolean DEFAULT true,
  p_sub_intermitente_por_freelancer boolean DEFAULT true,
  p_sub_freelancer_por_intermitente boolean DEFAULT true,
  p_sub_freelancer_por_freelancer boolean DEFAULT true,
  p_sub_fixo_em_folga_dominical boolean DEFAULT false,
  p_reabre_vaga_em_desistencia boolean DEFAULT true,
  p_autonomia_colaborador_desistir boolean DEFAULT true,
  p_permite_oferta_aberta boolean DEFAULT true,
  p_exige_justificativa_excecao boolean DEFAULT true,
  p_disponibilidade_janela_abre_dia integer DEFAULT 1,
  p_disponibilidade_janela_fecha_dia integer DEFAULT 10,
  p_disponibilidade_reserva_folga boolean DEFAULT false,
  p_disponibilidade_lembrete_dias integer DEFAULT 2,
  p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_row public.dp_convocacao_config;
  v_atual jsonb;
  v_desejado jsonb;
BEGIN
  IF p_unidade_id IS NOT NULL THEN
    SELECT company_id INTO v_company FROM public.dp_unidades WHERE id = p_unidade_id;
    IF v_company IS NULL THEN
      RAISE EXCEPTION 'UNIT_NOT_FOUND: unidade inexistente.' USING ERRCODE = '23503';
    END IF;
  ELSE
    IF p_company_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_INPUT: informe a empresa ou a unidade.' USING ERRCODE = '22023';
    END IF;
    v_company := p_company_id;
  END IF;

  PERFORM public.dp_convocacao_exige_admin(v_company);

  IF p_disponibilidade_janela_abre_dia NOT BETWEEN 1 AND 28
     OR p_disponibilidade_janela_fecha_dia NOT BETWEEN 1 AND 28
     OR p_disponibilidade_janela_abre_dia > p_disponibilidade_janela_fecha_dia THEN
    RAISE EXCEPTION 'INVALID_INPUT: período de disponibilidade inválido (use dias de 1 a 28, abertura antes do fechamento).'
      USING ERRCODE = '22023';
  END IF;
  IF p_disponibilidade_lembrete_dias NOT BETWEEN 0 AND 15 THEN
    RAISE EXCEPTION 'INVALID_INPUT: lembrete deve ficar entre 0 e 15 dias.' USING ERRCODE = '22023';
  END IF;

  v_desejado := jsonb_build_object(
    'antecedencia_minima_dias', p_antecedencia_minima_dias,
    'prazo_resposta_dias_uteis', p_prazo_resposta_dias_uteis,
    'aprovacao_modo', p_aprovacao_modo,
    'sub_intermitente_por_intermitente', p_sub_intermitente_por_intermitente,
    'sub_intermitente_por_freelancer', p_sub_intermitente_por_freelancer,
    'sub_freelancer_por_intermitente', p_sub_freelancer_por_intermitente,
    'sub_freelancer_por_freelancer', p_sub_freelancer_por_freelancer,
    'sub_fixo_em_folga_dominical', p_sub_fixo_em_folga_dominical,
    'reabre_vaga_em_desistencia', p_reabre_vaga_em_desistencia,
    'autonomia_colaborador_desistir', p_autonomia_colaborador_desistir,
    'permite_oferta_aberta', p_permite_oferta_aberta,
    'exige_justificativa_excecao', p_exige_justificativa_excecao,
    'disponibilidade_janela_abre_dia', p_disponibilidade_janela_abre_dia,
    'disponibilidade_janela_fecha_dia', p_disponibilidade_janela_fecha_dia,
    'disponibilidade_reserva_folga', p_disponibilidade_reserva_folga,
    'disponibilidade_lembrete_dias', p_disponibilidade_lembrete_dias);

  SELECT * INTO v_row
    FROM public.dp_convocacao_config
   WHERE company_id = v_company AND unidade_id IS NOT DISTINCT FROM p_unidade_id
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.dp_convocacao_config(
      company_id, unidade_id, antecedencia_minima_dias, prazo_resposta_dias_uteis, aprovacao_modo,
      sub_intermitente_por_intermitente, sub_intermitente_por_freelancer,
      sub_freelancer_por_intermitente, sub_freelancer_por_freelancer,
      sub_fixo_em_folga_dominical, reabre_vaga_em_desistencia, autonomia_colaborador_desistir,
      permite_oferta_aberta, exige_justificativa_excecao,
      disponibilidade_janela_abre_dia, disponibilidade_janela_fecha_dia,
      disponibilidade_reserva_folga, disponibilidade_lembrete_dias)
    VALUES (
      v_company, p_unidade_id, p_antecedencia_minima_dias, p_prazo_resposta_dias_uteis, p_aprovacao_modo,
      p_sub_intermitente_por_intermitente, p_sub_intermitente_por_freelancer,
      p_sub_freelancer_por_intermitente, p_sub_freelancer_por_freelancer,
      p_sub_fixo_em_folga_dominical, p_reabre_vaga_em_desistencia, p_autonomia_colaborador_desistir,
      p_permite_oferta_aberta, p_exige_justificativa_excecao,
      p_disponibilidade_janela_abre_dia, p_disponibilidade_janela_fecha_dia,
      p_disponibilidade_reserva_folga, p_disponibilidade_lembrete_dias)
    ON CONFLICT ON CONSTRAINT uq_dp_conv_config_escopo DO NOTHING
    RETURNING * INTO v_row;

    IF FOUND AND v_row.id IS NOT NULL THEN
      PERFORM public.dp_convocacao_log_evento(v_row.company_id, NULL, NULL, 'config_criada',
        jsonb_build_object('unidade_id', v_row.unidade_id, 'valores', v_desejado));

      RETURN jsonb_build_object('config_id', v_row.id, 'company_id', v_row.company_id,
        'unidade_id', v_row.unidade_id, 'updated_at', v_row.updated_at,
        'alterado', true, 'idempotente', false);
    END IF;

    SELECT * INTO v_row
      FROM public.dp_convocacao_config
     WHERE company_id = v_company AND unidade_id IS NOT DISTINCT FROM p_unidade_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CONCURRENT_MODIFICATION: a configuração foi alterada por outra pessoa. Recarregue e tente novamente.' USING ERRCODE = '40001';
    END IF;
  END IF;

  v_atual := jsonb_build_object(
    'antecedencia_minima_dias', v_row.antecedencia_minima_dias,
    'prazo_resposta_dias_uteis', v_row.prazo_resposta_dias_uteis,
    'aprovacao_modo', v_row.aprovacao_modo,
    'sub_intermitente_por_intermitente', v_row.sub_intermitente_por_intermitente,
    'sub_intermitente_por_freelancer', v_row.sub_intermitente_por_freelancer,
    'sub_freelancer_por_intermitente', v_row.sub_freelancer_por_intermitente,
    'sub_freelancer_por_freelancer', v_row.sub_freelancer_por_freelancer,
    'sub_fixo_em_folga_dominical', v_row.sub_fixo_em_folga_dominical,
    'reabre_vaga_em_desistencia', v_row.reabre_vaga_em_desistencia,
    'autonomia_colaborador_desistir', v_row.autonomia_colaborador_desistir,
    'permite_oferta_aberta', v_row.permite_oferta_aberta,
    'exige_justificativa_excecao', v_row.exige_justificativa_excecao,
    'disponibilidade_janela_abre_dia', v_row.disponibilidade_janela_abre_dia,
    'disponibilidade_janela_fecha_dia', v_row.disponibilidade_janela_fecha_dia,
    'disponibilidade_reserva_folga', v_row.disponibilidade_reserva_folga,
    'disponibilidade_lembrete_dias', v_row.disponibilidade_lembrete_dias);

  IF v_atual = v_desejado THEN
    RETURN jsonb_build_object('config_id', v_row.id, 'company_id', v_row.company_id,
      'unidade_id', v_row.unidade_id, 'updated_at', v_row.updated_at,
      'alterado', false, 'idempotente', true);
  END IF;

  IF p_expected_updated_at IS NULL OR v_row.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'CONCURRENT_MODIFICATION: a configuração foi alterada por outra pessoa. Recarregue e tente novamente.' USING ERRCODE = '40001';
  END IF;

  UPDATE public.dp_convocacao_config
     SET antecedencia_minima_dias = p_antecedencia_minima_dias,
         prazo_resposta_dias_uteis = p_prazo_resposta_dias_uteis,
         aprovacao_modo = p_aprovacao_modo,
         sub_intermitente_por_intermitente = p_sub_intermitente_por_intermitente,
         sub_intermitente_por_freelancer = p_sub_intermitente_por_freelancer,
         sub_freelancer_por_intermitente = p_sub_freelancer_por_intermitente,
         sub_freelancer_por_freelancer = p_sub_freelancer_por_freelancer,
         sub_fixo_em_folga_dominical = p_sub_fixo_em_folga_dominical,
         reabre_vaga_em_desistencia = p_reabre_vaga_em_desistencia,
         autonomia_colaborador_desistir = p_autonomia_colaborador_desistir,
         permite_oferta_aberta = p_permite_oferta_aberta,
         exige_justificativa_excecao = p_exige_justificativa_excecao,
         disponibilidade_janela_abre_dia = p_disponibilidade_janela_abre_dia,
         disponibilidade_janela_fecha_dia = p_disponibilidade_janela_fecha_dia,
         disponibilidade_reserva_folga = p_disponibilidade_reserva_folga,
         disponibilidade_lembrete_dias = p_disponibilidade_lembrete_dias,
         updated_at = now()
   WHERE id = v_row.id
  RETURNING * INTO v_row;

  PERFORM public.dp_convocacao_log_evento(v_row.company_id, NULL, NULL, 'config_atualizada',
    jsonb_build_object('unidade_id', v_row.unidade_id, 'de', v_atual, 'para', v_desejado));

  RETURN jsonb_build_object('config_id', v_row.id, 'company_id', v_row.company_id,
    'unidade_id', v_row.unidade_id, 'updated_at', v_row.updated_at,
    'alterado', true, 'idempotente', false);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.dp_convocacao_salvar_config(uuid, uuid, integer, integer, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, integer, integer, boolean, integer, timestamptz) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_salvar_config(uuid, uuid, integer, integer, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, integer, integer, boolean, integer, timestamptz) TO authenticated;
