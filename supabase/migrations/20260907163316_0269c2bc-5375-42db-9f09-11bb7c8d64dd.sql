CREATE OR REPLACE FUNCTION public.dp_folga_reserva_indisponibilidade(p_company uuid, p_unidade uuid, p_cargo uuid DEFAULT NULL::uuid, p_data date DEFAULT NULL::date, p_setor uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_cfg record;
BEGIN
  IF p_company IS NULL OR p_data IS NULL THEN
    RETURN 0;
  END IF;

  IF v_uid IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.company_members m
                       WHERE m.company_id = p_company AND m.user_id = v_uid)
     AND NOT EXISTS (SELECT 1 FROM public.companies c
                       WHERE c.id = p_company AND c.owner_id = v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN: empresa fora do seu escopo.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_cfg FROM public.dp_convocacao_config_resolvida(p_company, p_unidade);
  IF NOT COALESCE(v_cfg.disponibilidade_reserva_folga, false) THEN
    RETURN 0;
  END IF;

  RETURN (
    SELECT count(*)::int
      FROM public.dp_indisponibilidades i
      JOIN public.dp_colaboradores c ON c.id = i.colaborador_id
     WHERE i.company_id = p_company
       AND i.data = p_data
       AND i.cancelada_em IS NULL
       AND COALESCE(i.conflito, false) = false
       AND c.deleted_at IS NULL
       AND c.ativo IS NOT false
       AND COALESCE(public.dp_regime_convocavel(c.regime), false)
       AND (p_unidade IS NULL OR c.unidade_id = p_unidade)
       AND (p_cargo IS NULL OR c.cargo_id = p_cargo)
       AND (p_setor IS NULL OR public.dp_setor_previsto_id(c.id, p_data) = p_setor)
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.dp_folga_reserva_indisponibilidade(uuid, uuid, uuid, date, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folga_reserva_indisponibilidade(uuid, uuid, uuid, date, uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.dp_indisponibilidade_marcar(date, text);

CREATE OR REPLACE FUNCTION public.dp_indisponibilidade_marcar(
  p_data date,
  p_motivo text DEFAULT NULL::text,
  p_confirmar_conflito boolean DEFAULT false,
  p_ciencia_multa boolean DEFAULT false)
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
  v_conf_id uuid;
  v_conflito boolean := false;
  v_ciencia timestamptz;
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

  SELECT c.id INTO v_conf_id
    FROM public.dp_convocacoes c
   WHERE c.company_id = v_company
     AND c.colaborador_id = v_colab_id
     AND c.data = p_data
     AND (c.status IN ('aceita', 'encerrada_operacionalmente') OR c.comparecimento IS NOT NULL)
   ORDER BY c.created_at DESC
   LIMIT 1;

  IF v_conf_id IS NOT NULL THEN
    IF NOT COALESCE(p_confirmar_conflito, false) THEN
      RAISE EXCEPTION 'ACCEPTED_CALL_REQUIRES_REPLACEMENT: convocação confirmada neste dia.'
        USING ERRCODE = '22023';
    END IF;
    IF v_motivo IS NULL THEN
      RAISE EXCEPTION 'INVALID_INPUT: informe o motivo para avisar que não poderá comparecer.'
        USING ERRCODE = '22023';
    END IF;
    IF v_regime = 'intermitente' AND NOT COALESCE(p_ciencia_multa, false) THEN
      RAISE EXCEPTION 'CIENCIA_MULTA_OBRIGATORIA: é preciso registrar ciência da multa prevista em lei.'
        USING ERRCODE = '22023';
    END IF;
    v_conflito := true;
    IF v_regime = 'intermitente' THEN
      v_ciencia := v_agora;
    END IF;
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
      'janela', v_estado_janela, 'alteracao_tardia', false, 'conflito', v_conflito);
  END IF;

  INSERT INTO public.dp_indisponibilidades(
    company_id, colaborador_id, data, motivo, origem, criado_por,
    informada_em, dentro_da_janela, alteracao_tardia,
    conflito, conflito_convocacao_id, ciencia_multa_em)
  VALUES (v_company, v_colab_id, p_data, v_motivo, 'colaborador', v_uid,
          v_agora, v_estado_janela = 'aberta', v_tardia,
          v_conflito, v_conf_id, v_ciencia)
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

  IF v_conflito THEN
    INSERT INTO public.dp_notificacoes(
      company_id, tipo, titulo, descricao, ref_table, ref_id, para_admins)
    VALUES (
      v_company, 'disponibilidade_conflito_convocacao',
      'Aviso de possível ausência em convocação confirmada',
      COALESCE(v_nome, 'Trabalhador') || ' avisou que não poderá comparecer em '
        || to_char(p_data, 'DD/MM/YYYY') || '. Motivo: ' || v_motivo,
      'dp_indisponibilidades', v_id, true);

    PERFORM public.dp_convocacao_log_evento_trabalhador(
      v_company, NULL, NULL, 'indisponibilidade_conflito',
      jsonb_build_object(
        'convocacao_id', v_conf_id,
        'indisponibilidade_id', v_id,
        'data', p_data,
        'motivo', v_motivo,
        'ciencia_multa', v_ciencia IS NOT NULL));
  END IF;

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
    CASE WHEN v_conflito THEN 'indisponibilidade_conflito'
         WHEN v_tardia THEN 'indisponibilidade_alteracao_tardia'
         ELSE 'indisponibilidade_criada' END,
    'dp_indisponibilidades', v_id::text,
    jsonb_build_object('data', p_data, 'ofertas_encerradas', v_encerradas,
                       'ofertas_encerradas_por_tempo', v_temporais,
                       'janela', v_estado_janela,
                       'janela_abre', v_janela->>'abre',
                       'janela_fecha', v_janela->>'fecha',
                       'conflito', v_conflito,
                       'convocacao_id', v_conf_id,
                       'ciencia_multa_em', v_ciencia));

  RETURN jsonb_build_object(
    'ok', true, 'indisponibilidade_id', v_id, 'data', p_data,
    'idempotente', false, 'ofertas_encerradas', v_encerradas,
    'ofertas_encerradas_por_tempo', v_temporais,
    'janela', v_estado_janela, 'alteracao_tardia', v_tardia,
    'conflito', v_conflito);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.dp_indisponibilidade_marcar(date, text, boolean, boolean) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_indisponibilidade_marcar(date, text, boolean, boolean) TO authenticated, service_role;
