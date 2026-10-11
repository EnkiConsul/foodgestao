CREATE OR REPLACE FUNCTION private.dp_troca_restricao(_solicitante uuid, _destino uuid, _data_original date, _data_proposta date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  -- Solicitante passa a folgar na data proposta; o colega, na data original.
  SELECT private.dp_regra_bloqueia_colaborador(_solicitante, _data_proposta) IS NOT NULL
      OR private.dp_regra_bloqueia_colaborador(_destino, _data_original) IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION private.dp_troca_restricao(uuid,uuid,date,date) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.dp_troca_responder_colega(p_id uuid, p_aceito boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_colab uuid;
  t public.dp_trocas%ROWTYPE;
  v_cfg public.dp_config_dp;
  v_unidade uuid;
  v_efetivada boolean := false;
  v_status text;
  v_exige_gestor boolean := false;
  v_restricao boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000'; END IF;
  IF p_id IS NULL OR p_aceito IS NULL THEN RAISE EXCEPTION 'INVALID_INPUT: informe a troca e a resposta.' USING ERRCODE = '22023'; END IF;
  v_colab := public.dp_colaborador_ativo_of(v_uid);
  IF v_colab IS NULL THEN RAISE EXCEPTION 'FORBIDDEN: cadastro de colaborador não encontrado.' USING ERRCODE = '42501'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text || '|troca', 0));
  SELECT * INTO t FROM public.dp_trocas WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR t.destino_id <> v_colab THEN RAISE EXCEPTION 'FORBIDDEN: troca não encontrada.' USING ERRCODE = '42501'; END IF;
  IF t.status <> 'pendente_colega' THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: esta troca não está aguardando sua resposta.' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT p_aceito THEN
    UPDATE public.dp_trocas SET colega_resposta = 'recusada', colega_respondido_em = now(), status = 'recusada', updated_at = now() WHERE id = t.id;
    RETURN jsonb_build_object('ok', true, 'troca_id', t.id, 'status', 'recusada', 'efetivada', false);
  END IF;

  UPDATE public.dp_trocas SET colega_resposta = 'aprovada', colega_respondido_em = now(), status = 'pendente_gestor', updated_at = now() WHERE id = t.id;
  v_status := 'pendente_gestor';

  v_exige_gestor := private.dp_troca_exige_gestor(t.data_original, t.data_proposta);
  -- Restrição de folga (cargo, setor ou pessoa) em qualquer lado: só o gestor aprova.
  v_restricao := private.dp_troca_restricao(t.solicitante_id, t.destino_id, t.data_original, t.data_proposta);
  v_exige_gestor := v_exige_gestor OR v_restricao;

  IF NOT v_exige_gestor THEN
    SELECT unidade_id INTO v_unidade FROM public.dp_colaboradores WHERE id = t.destino_id;
    v_cfg := public.dp_config_resolvida(t.company_id, v_unidade);
    IF COALESCE(v_cfg.troca_folga_modo, 'aprovacao_admin') = 'direta' THEN
      PERFORM public.dp_processar_troca_direta(t.id);
      v_efetivada := true;
      v_status := 'aprovada';
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'troca_id', t.id, 'status', v_status, 'efetivada', v_efetivada,
                            'exige_gestor', v_exige_gestor, 'restricao', v_restricao);
END;
$function$;

CREATE OR REPLACE FUNCTION public.dp_troca_propor(p_destino uuid, p_data_original date, p_data_proposta date, p_motivo text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_colab uuid; v_company uuid; v_dest_company uuid;
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000'; END IF;
  v_colab := public.dp_colaborador_ativo_of(v_uid);
  IF v_colab IS NULL THEN RAISE EXCEPTION 'FORBIDDEN: cadastro de colaborador não encontrado.' USING ERRCODE = '42501'; END IF;
  IF p_destino IS NULL OR p_data_original IS NULL OR p_data_proposta IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe o colega e as duas datas.' USING ERRCODE = '22023'; END IF;
  IF v_motivo IS NULL THEN RAISE EXCEPTION 'INVALID_INPUT: informe o motivo.' USING ERRCODE = '22023'; END IF;
  IF p_destino = v_colab THEN RAISE EXCEPTION 'INVALID_INPUT: não é possível trocar com você mesmo.' USING ERRCODE = '22023'; END IF;
  IF p_data_original = p_data_proposta THEN RAISE EXCEPTION 'INVALID_INPUT: as datas precisam ser diferentes.' USING ERRCODE = '22023'; END IF;
  IF p_data_original < CURRENT_DATE OR p_data_proposta < CURRENT_DATE THEN
    RAISE EXCEPTION 'PAST_DATE_NOT_EDITABLE: datas passadas não podem ser trocadas.' USING ERRCODE = '22023'; END IF;

  SELECT company_id INTO v_company FROM public.dp_colaboradores WHERE id = v_colab;
  SELECT company_id INTO v_dest_company FROM public.dp_colaboradores WHERE id = p_destino AND deleted_at IS NULL AND ativo IS NOT false;
  IF v_dest_company IS NULL OR v_dest_company <> v_company THEN
    RAISE EXCEPTION 'FORBIDDEN: colega fora da sua empresa.' USING ERRCODE = '42501'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_company::text || '|troca_dia|' || p_data_original::text || '|' || p_data_proposta::text, 0));

  IF NOT EXISTS (SELECT 1 FROM public.dp_folgas f WHERE f.colaborador_id = v_colab AND f.data = p_data_original AND f.status <> 'cancelada')
     AND NOT private.dp_troca_folga_fixa_livre(v_colab, p_data_original) THEN
    RAISE EXCEPTION 'TROCA_SEM_FOLGA_PROPRIA: você não tem folga na data que ofereceu.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dp_folgas f WHERE f.colaborador_id = p_destino AND f.data = p_data_proposta AND f.status <> 'cancelada')
     AND NOT private.dp_troca_folga_fixa_livre(p_destino, p_data_proposta) THEN
    RAISE EXCEPTION 'TROCA_SEM_FOLGA_COLEGA: o colega não tem folga na data pedida.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dp_folgas f WHERE f.colaborador_id = v_colab AND f.data = p_data_proposta AND f.status <> 'cancelada')
     OR private.dp_troca_folga_fixa_livre(v_colab, p_data_proposta) THEN
    RAISE EXCEPTION 'TROCA_JA_TEM_FOLGA: você já está de folga no dia pedido.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dp_folgas f WHERE f.colaborador_id = p_destino AND f.data = p_data_original AND f.status <> 'cancelada')
     OR private.dp_troca_folga_fixa_livre(p_destino, p_data_original) THEN
    RAISE EXCEPTION 'TROCA_COLEGA_JA_TEM_FOLGA: o colega já está de folga no dia que você ofereceu.' USING ERRCODE = 'check_violation';
  END IF;
  IF private.dp_colab_afastado_em(v_colab, p_data_original) THEN
    RAISE EXCEPTION 'TROCA_FOLGA_EM_AFASTAMENTO: sua folga de % cai em um período de atestado, licença, suspensão ou férias e não pode ser trocada.', to_char(p_data_original, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;
  IF private.dp_colab_afastado_em(p_destino, p_data_proposta) THEN
    RAISE EXCEPTION 'TROCA_FOLGA_EM_AFASTAMENTO_COLEGA: a folga do colega em % cai em um período de atestado, licença, suspensão ou férias e não pode ser trocada.', to_char(p_data_proposta, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dp_trocas t WHERE t.solicitante_id = v_colab AND t.destino_id = p_destino
       AND t.data_original = p_data_original AND t.data_proposta = p_data_proposta AND t.status IN ('pendente_colega', 'pendente_gestor')) THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST: já existe uma troca pendente igual a esta.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.dp_trocas(company_id, solicitante_id, destino_id, data_original, data_proposta, motivo, status, created_by)
  VALUES (v_company, v_colab, p_destino, p_data_original, p_data_proposta, v_motivo, 'pendente_colega', v_uid)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'troca_id', v_id, 'status', 'pendente_colega',
    'exige_gestor', private.dp_troca_exige_gestor(p_data_original, p_data_proposta)
                    OR private.dp_troca_restricao(v_colab, p_destino, p_data_original, p_data_proposta));
END;
$function$;