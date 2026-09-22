-- 1) Novo tipo de notificação
ALTER TYPE public.dp_notificacao_tipo ADD VALUE IF NOT EXISTS 'folga_remarcada';

-- 2) Dias de descanso válidos da unidade (fallback fim de semana)
CREATE OR REPLACE FUNCTION public.dp_dias_descanso_validos(_company uuid, _unidade uuid)
RETURNS smallint[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT NULLIF(cfg.dias_descanso_negociados, '{}'::smallint[])
       FROM public.dp_config_dp cfg
      WHERE cfg.company_id = _company
        AND (cfg.unidade_id = _unidade OR cfg.unidade_id IS NULL)
      ORDER BY (cfg.unidade_id IS NULL)
      LIMIT 1),
    ARRAY[0, 6]::smallint[]);
$$;

GRANT EXECUTE ON FUNCTION public.dp_dias_descanso_validos(uuid, uuid) TO authenticated;

-- 3) Remarcar a própria folga (move em uma única transação)
CREATE OR REPLACE FUNCTION public.dp_folga_remarcar(
  p_data_atual date,
  p_data_nova date,
  p_motivo text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  DELETE FROM public.dp_folgas WHERE id = v_folga.id;

  INSERT INTO public.dp_folgas(
    company_id, colaborador_id, data, tipo, origem, status, extra, criado_por, observacao)
  VALUES (v_company, v_colab, p_data_nova, 'normal'::public.dp_folga_tipo,
          'solicitacao'::public.dp_folga_origem, 'agendada'::public.dp_folga_status,
          COALESCE(v_folga.extra, false), v_uid,
          'Mudança da folga de ' || to_char(p_data_atual, 'DD/MM/YYYY')
          || COALESCE(' — ' || v_motivo, ''))
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
$$;

REVOKE ALL ON FUNCTION public.dp_folga_remarcar(date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folga_remarcar(date, date, text) TO authenticated;

-- 4) Pedir a mudança ao DP quando a remarcação direta não é possível
CREATE OR REPLACE FUNCTION public.dp_folga_remarcar_solicitar(
  p_data_atual date,
  p_data_nova date,
  p_motivo text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_colab uuid;
  v_company uuid;
  v_id uuid;
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
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

  SELECT c.company_id INTO v_company FROM public.dp_colaboradores c WHERE c.id = v_colab;

  IF p_data_nova < CURRENT_DATE OR p_data_atual < CURRENT_DATE THEN
    RAISE EXCEPTION 'PAST_DATE_NOT_EDITABLE: datas passadas não podem ser solicitadas.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_colab::text || '|solic_folga|' || p_data_nova::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.dp_solicitacoes s
     WHERE s.colaborador_id = v_colab AND s.tipo = 'folga'
       AND s.data_alvo = p_data_nova AND s.status = 'pendente'
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST: já existe uma solicitação pendente para este dia.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.dp_solicitacoes(
    company_id, colaborador_id, criado_por, tipo, data_alvo, data_fim, motivo, status, fora_da_janela)
  VALUES (v_company, v_colab, v_uid, 'folga', p_data_nova, p_data_atual,
          'MUDANCA_DE_FOLGA' || COALESCE(' — ' || v_motivo, ''), 'pendente', true)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'solicitacao_id', v_id,
                            'data_atual', p_data_atual, 'data_nova', p_data_nova);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_folga_remarcar_solicitar(date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folga_remarcar_solicitar(date, date, text) TO authenticated;

-- 5) Aprovar pedido de folga passa a criar (ou mover) a folga de fato
CREATE OR REPLACE FUNCTION public.dp_solicitacao_responder(
  p_id uuid,
  p_status public.dp_solicitacao_status,
  p_resposta text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row record;
  v_unidade uuid;
  v_cargo uuid;
  v_setor uuid;
  v_lim jsonb;
  v_troca boolean := false;
  v_mudanca boolean := false;
  v_folga_antiga uuid;
  v_folga_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_id IS NULL OR p_status IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a solicitação e a decisão.' USING ERRCODE = '22023';
  END IF;
  IF p_status NOT IN ('aprovada'::public.dp_solicitacao_status, 'recusada'::public.dp_solicitacao_status) THEN
    RAISE EXCEPTION 'INVALID_INPUT: decisão inválida.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.dp_solicitacoes WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'NAO_ENCONTRADA: solicitação não encontrada.' USING ERRCODE = '22023';
  END IF;
  IF NOT private.is_company_admin_or_owner(v_uid, v_row.company_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso restrito a administradores da empresa.' USING ERRCODE = '42501';
  END IF;
  IF v_row.status <> 'pendente'::public.dp_solicitacao_status THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: esta solicitação já foi respondida.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_status = 'aprovada'::public.dp_solicitacao_status
     AND v_row.tipo = 'folga'::public.dp_solicitacao_tipo
     AND v_row.data_alvo IS NOT NULL THEN
    SELECT c.unidade_id, c.cargo_id, c.setor_id INTO v_unidade, v_cargo, v_setor
      FROM public.dp_colaboradores c WHERE c.id = v_row.colaborador_id;

    PERFORM pg_advisory_xact_lock(hashtextextended(
      v_row.company_id::text || '|folga_dia|' || COALESCE(v_unidade::text, 'sem') || '|' || v_row.data_alvo::text, 0));
    PERFORM pg_advisory_xact_lock(hashtextextended(
      v_row.colaborador_id::text || '|folga_self|' || v_row.data_alvo::text, 0));

    v_lim := public.dp_folga_limite_dia(
      v_row.company_id, v_unidade, v_cargo, v_row.data_alvo, v_row.colaborador_id, v_setor);
    IF COALESCE((v_lim->>'excedido')::boolean, false) THEN
      RAISE EXCEPTION 'FOLGA_LIMITE_DIA: este dia já atingiu o limite de pessoas em folga.'
        USING ERRCODE = 'check_violation';
    END IF;

    v_troca := v_row.data_fim IS NOT NULL
           AND v_row.data_fim <> v_row.data_alvo
           AND extract(dow from v_row.data_fim)::smallint = ANY (
                 public.dp_dias_fixos_folga(v_row.colaborador_id, v_row.data_fim));

    v_mudanca := NOT v_troca
             AND v_row.data_fim IS NOT NULL
             AND v_row.data_fim <> v_row.data_alvo
             AND COALESCE(v_row.motivo, '') LIKE 'MUDANCA_DE_FOLGA%';

    IF v_troca THEN
      INSERT INTO public.dp_folgas(
        company_id, colaborador_id, data, tipo, origem, status, criado_por, observacao)
      VALUES (v_row.company_id, v_row.colaborador_id, v_row.data_alvo,
              'normal'::public.dp_folga_tipo, 'troca'::public.dp_folga_origem,
              'agendada'::public.dp_folga_status, v_uid,
              'Troca da folga do fim de semana de ' || to_char(v_row.data_fim, 'DD/MM/YYYY'))
      ON CONFLICT DO NOTHING;

      INSERT INTO public.dp_dia_trabalho_excepcional(
        company_id, colaborador_id, data, origem, solicitacao_id, criado_por)
      VALUES (v_row.company_id, v_row.colaborador_id, v_row.data_fim,
              'troca_fds', v_row.id, v_uid)
      ON CONFLICT (colaborador_id, data) DO NOTHING;
    ELSE
      IF v_mudanca THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(
          v_row.colaborador_id::text || '|folga_self|' || v_row.data_fim::text, 0));

        SELECT f.id INTO v_folga_antiga
          FROM public.dp_folgas f
         WHERE f.colaborador_id = v_row.colaborador_id
           AND f.data = v_row.data_fim
           AND f.status = 'agendada'
         ORDER BY f.created_at DESC
         LIMIT 1
         FOR UPDATE;

        IF v_folga_antiga IS NOT NULL THEN
          DELETE FROM public.dp_folgas WHERE id = v_folga_antiga;
        END IF;
      END IF;

      INSERT INTO public.dp_folgas(
        company_id, colaborador_id, data, tipo, origem, status, extra, criado_por, observacao)
      VALUES (v_row.company_id, v_row.colaborador_id, v_row.data_alvo,
              'normal'::public.dp_folga_tipo, 'solicitacao'::public.dp_folga_origem,
              'agendada'::public.dp_folga_status, false, v_uid,
              CASE WHEN v_mudanca
                THEN 'Mudança da folga de ' || to_char(v_row.data_fim, 'DD/MM/YYYY') || ' aprovada pelo DP'
                ELSE 'Solicitação de folga aprovada pelo DP' END)
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_folga_id;
    END IF;
  END IF;

  UPDATE public.dp_solicitacoes
     SET status = p_status,
         respondido_por = v_uid,
         respondido_em = now(),
         resposta_admin = NULLIF(btrim(COALESCE(p_resposta, '')), ''),
         updated_at = now()
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'solicitacao_id', p_id, 'status', p_status,
                            'limite', v_lim, 'troca_fds', v_troca,
                            'mudanca_de_folga', v_mudanca, 'folga_id', v_folga_id);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_solicitacao_responder(uuid, public.dp_solicitacao_status, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_solicitacao_responder(uuid, public.dp_solicitacao_status, text) TO authenticated;