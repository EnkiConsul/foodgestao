CREATE OR REPLACE FUNCTION public.dp_folga_remarcar(p_data_atual date, p_data_nova date, p_motivo text DEFAULT NULL::text)
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
  v_setor uuid;
  v_nome text;
  v_folga record;
  v_dias smallint[];
  v_lim jsonb;
  v_conf jsonb;
  v_bloq record;
  v_id uuid;
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_nova_fds boolean := extract(dow from p_data_nova)::int IN (0, 6);
  v_direito text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_data_atual IS NULL OR p_data_nova IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe o dia atual e o novo dia.' USING ERRCODE = '22023';
  END IF;
  IF p_data_atual = p_data_nova THEN
    RAISE EXCEPTION 'INVALID_INPUT: escolha um dia diferente do atual.' USING ERRCODE = '22023';
  END IF;

  v_colab := public.dp_colaborador_ativo_of(v_uid);
  IF v_colab IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: cadastro de colaborador não encontrado.' USING ERRCODE = '42501';
  END IF;

  SELECT c.company_id, c.unidade_id, c.cargo_id, c.setor_id, c.nome
    INTO v_company, v_unidade, v_cargo, v_setor, v_nome
    FROM public.dp_colaboradores c WHERE c.id = v_colab;

  IF p_data_atual < CURRENT_DATE OR p_data_nova < CURRENT_DATE THEN
    RAISE EXCEPTION 'PAST_DATE_NOT_EDITABLE: datas passadas não podem ser remarcadas.'
      USING ERRCODE = '22023';
  END IF;
  IF date_trunc('month', p_data_atual) <> date_trunc('month', p_data_nova) THEN
    RAISE EXCEPTION 'FOLGA_REMARCAR_OUTRO_MES: o novo dia precisa ser do mesmo mês da folga atual.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_dias := public.dp_dias_descanso_validos(v_company, v_unidade);
  IF NOT (extract(dow from p_data_nova)::smallint = ANY (v_dias)) THEN
    RAISE EXCEPTION 'FOLGA_REMARCAR_DIA_INVALIDO: este dia não é um dia de descanso previsto na sua unidade.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_company::text || '|folga_dia|' || COALESCE(v_unidade::text, 'sem') || '|' || p_data_nova::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_colab::text || '|folga_self|' || p_data_atual::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_colab::text || '|folga_self|' || p_data_nova::text, 0));

  SELECT * INTO v_folga
    FROM public.dp_folgas f
   WHERE f.colaborador_id = v_colab
     AND f.data = p_data_atual
     AND f.status = 'agendada'
   ORDER BY f.created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF v_folga.id IS NULL THEN
    RAISE EXCEPTION 'FOLGA_NAO_ENCONTRADA: folga não encontrada neste dia.' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(v_folga.tipo::text, 'normal') <> 'normal' THEN
    RAISE EXCEPTION 'FOLGA_REMARCAR_TIPO_INVALIDO: apenas a folga comum pode ser remarcada.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.dp_folgas f
     WHERE f.colaborador_id = v_colab AND f.data = p_data_nova AND f.status <> 'cancelada'
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST: você já tem folga marcada no novo dia.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_bloq
    FROM public.dp_datas_bloqueadas b
   WHERE b.company_id = v_company
     AND b.data = p_data_nova
     AND (b.unidade_id = v_unidade OR b.unidade_id IS NULL)
   ORDER BY (b.unidade_id IS NULL)
   LIMIT 1;
  IF v_bloq.id IS NOT NULL AND NOT COALESCE(v_bloq.liberada, false) THEN
    RAISE EXCEPTION 'FOLGA_REMARCAR_BLOQUEADA: esta data está bloqueada pelo DP.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_lim := public.dp_folga_limite_dia(v_company, v_unidade, v_cargo, p_data_nova, v_colab, v_setor);
  IF COALESCE((v_lim->>'excedido')::boolean, false) THEN
    RAISE EXCEPTION 'FOLGA_REMARCAR_LIMITE_DIA: o novo dia já atingiu o limite de pessoas em folga.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_conf := public.dp_folga_conflito_colaboradores(v_company, v_colab, p_data_nova);
  IF COALESCE((v_conf->>'conflito')::boolean, false) THEN
    RAISE EXCEPTION 'FOLGA_REMARCAR_CONFLITO: % já está de folga neste dia e vocês não podem folgar juntos.',
      COALESCE(v_conf->>'colega_nome', 'Outra pessoa') USING ERRCODE = 'check_violation';
  END IF;

  -- Preserva a origem do direito ao mudar o dia.
  v_direito := CASE
    WHEN v_folga.direito_origem IN ('folga_fixa_deslocada', 'fixa', 'excecao_gestor') THEN v_folga.direito_origem
    WHEN v_nova_fds THEN 'fds'
    ELSE 'dominical_deslocada'
  END;

  DELETE FROM public.dp_folgas WHERE id = v_folga.id;

  INSERT INTO public.dp_folgas(
    company_id, colaborador_id, data, tipo, origem, status, extra, criado_por, observacao, direito_origem)
  VALUES (v_company, v_colab, p_data_nova, 'normal'::public.dp_folga_tipo,
          'solicitacao'::public.dp_folga_origem, 'agendada'::public.dp_folga_status,
          COALESCE(v_folga.extra, false), v_uid,
          'Mudança da folga de ' || to_char(p_data_atual, 'DD/MM/YYYY')
          || COALESCE(' — ' || v_motivo, ''), v_direito)
  RETURNING id INTO v_id;

  INSERT INTO public.dp_notificacoes(
    company_id, tipo, titulo, descricao, ref_table, ref_id, para_admins)
  VALUES (v_company, 'folga_remarcada'::public.dp_notificacao_tipo,
          'Folga remarcada: ' || COALESCE(v_nome, 'colaborador'),
          'De ' || to_char(p_data_atual, 'DD/MM/YYYY') || ' para '
            || to_char(p_data_nova, 'DD/MM/YYYY')
            || COALESCE(' — ' || v_motivo, ''),
          'dp_folgas', v_id, true);

  RETURN jsonb_build_object(
    'ok', true, 'folga_id', v_id, 'data_anterior', p_data_atual, 'data_nova', p_data_nova,
    'limite', v_lim);
END;
$function$;