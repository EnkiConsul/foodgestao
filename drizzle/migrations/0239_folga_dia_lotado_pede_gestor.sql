-- Colaborador nunca marca direto em dia lotado: no mês em curso, quem ainda
-- não tem a folga de fim de semana pede ao gestor, que decide passar do limite.
-- A distribuição automática (fechamento da janela) mantém a contingência.

ALTER TABLE public.dp_solicitacoes
  ADD COLUMN IF NOT EXISTS excede_limite_dia boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.dp_solicitacoes.excede_limite_dia IS
  'Pedido da folga de fim de semana do mês em curso para dia lotado: só vira folga se o gestor aprovar (acima do limite).';

CREATE OR REPLACE FUNCTION public.dp_folga_marcar(p_data date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_colab uuid; v_company uuid; v_unidade uuid; v_cargo uuid; v_setor uuid;
  v_janela jsonb; v_estado text; v_lim jsonb; v_conf jsonb; v_id uuid;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_dias int[]; v_exigidas int; v_direito_mes boolean := false;
BEGIN
  PERFORM private.dp_folga_portal_exigir_liberada();
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

  SELECT c.company_id, c.unidade_id, c.cargo_id, c.setor_id
    INTO v_company, v_unidade, v_cargo, v_setor
    FROM public.dp_colaboradores c WHERE c.id = v_colab;

  IF p_data < CURRENT_DATE THEN
    RAISE EXCEPTION 'PAST_DATE_NOT_EDITABLE: datas passadas não podem ser marcadas.' USING ERRCODE = '22023';
  END IF;

  v_janela := public.dp_folgas_janela_efetiva(v_company, v_unidade, NULL);

  -- Direito do mês corrente: quem ainda não tem a folga de fim de semana do mês
  -- em curso pode marcá-la (datas futuras com vaga), mesmo com a escolha do mês
  -- seguinte aberta ou ainda por abrir.
  IF date_trunc('month', p_data) = date_trunc('month', v_hoje) THEN
    v_dias := public.dp_folga_dias_fds_aplicaveis(v_company, v_unidade);
    v_exigidas := COALESCE((v_janela->>'folgas_exigidas')::int, 1);
    v_direito_mes := v_exigidas > 0
      AND EXTRACT(DOW FROM p_data)::int = ANY (COALESCE(v_dias, ARRAY[0]))
      AND public.dp_folga_marcadas_no_mes(v_company, v_colab, p_data, v_dias) < v_exigidas
      AND public.dp_folga_exige_descanso_fds(v_company, v_colab, v_dias, p_data);
  END IF;

  IF COALESCE((v_janela->>'ativa')::boolean, false) AND NOT v_direito_mes THEN
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

  -- Dia lotado nunca entra direto pelo portal, nem para quem está sem folga:
  -- o caminho é o pedido ao gestor (dp_folga_solicitar_mes_lotado).
  v_lim := public.dp_folga_limite_dia(v_company, v_unidade, v_cargo, p_data, NULL, v_setor);
  IF COALESCE((v_lim->>'excedido')::boolean, false) THEN
    RAISE EXCEPTION 'FOLGA_LIMITE_DIA: este dia já atingiu o limite de pessoas em folga.' USING ERRCODE = 'check_violation';
  END IF;

  v_conf := public.dp_folga_conflito_colaboradores(v_company, v_colab, p_data);
  IF COALESCE((v_conf->>'conflito')::boolean, false) THEN
    RAISE EXCEPTION 'FOLGA_INCOMPATIBILIDADE: % já está de folga neste dia e vocês não podem folgar juntos.',
      COALESCE(v_conf->>'colega_nome', 'Outra pessoa') USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.dp_folgas(company_id, colaborador_id, data, tipo, origem, status, extra, criado_por)
  VALUES (v_company, v_colab, p_data, 'normal', 'solicitacao', 'agendada', false, v_uid)
  RETURNING id INTO v_id;

  -- A folga do mês saiu com vaga: o pedido ao gestor para dia lotado perde efeito.
  IF v_direito_mes THEN
    UPDATE public.dp_solicitacoes s
       SET status = 'cancelada', updated_at = now()
     WHERE s.colaborador_id = v_colab AND s.tipo = 'folga' AND s.status = 'pendente'
       AND s.excede_limite_dia
       AND date_trunc('month', s.data_alvo) = date_trunc('month', p_data);
  END IF;

  RETURN jsonb_build_object('ok', true, 'folga_id', v_id, 'limite', v_lim, 'mes_corrente', v_direito_mes);
END;
$function$;

CREATE OR REPLACE FUNCTION public.dp_folga_solicitar_mes_lotado(p_data date, p_motivo text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_colab uuid; v_company uuid; v_unidade uuid; v_cargo uuid; v_setor uuid;
  v_janela jsonb; v_lim jsonb; v_id uuid; v_pend date;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_dias int[]; v_exigidas int;
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
BEGIN
  PERFORM private.dp_folga_portal_exigir_liberada();
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

  SELECT c.company_id, c.unidade_id, c.cargo_id, c.setor_id
    INTO v_company, v_unidade, v_cargo, v_setor
    FROM public.dp_colaboradores c WHERE c.id = v_colab;

  IF p_data < v_hoje THEN
    RAISE EXCEPTION 'PAST_DATE_NOT_EDITABLE: datas passadas não podem ser solicitadas.' USING ERRCODE = '22023';
  END IF;
  IF date_trunc('month', p_data) <> date_trunc('month', v_hoje) THEN
    RAISE EXCEPTION 'FOLGA_MES_SEM_DIREITO: este pedido vale só para o mês em curso.' USING ERRCODE = 'check_violation';
  END IF;

  v_janela := public.dp_folgas_janela_efetiva(v_company, v_unidade, NULL);
  v_dias := public.dp_folga_dias_fds_aplicaveis(v_company, v_unidade);
  v_exigidas := COALESCE((v_janela->>'folgas_exigidas')::int, 1);
  IF NOT (v_exigidas > 0
      AND EXTRACT(DOW FROM p_data)::int = ANY (COALESCE(v_dias, ARRAY[0]))
      AND public.dp_folga_marcadas_no_mes(v_company, v_colab, p_data, v_dias) < v_exigidas
      AND public.dp_folga_exige_descanso_fds(v_company, v_colab, v_dias, p_data)) THEN
    RAISE EXCEPTION 'FOLGA_MES_SEM_DIREITO: você já tem a folga de fim de semana deste mês ou este dia não conta para ela.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_colab::text || '|solic_folga|' || p_data::text, 0));

  IF EXISTS (SELECT 1 FROM public.dp_folgas f
              WHERE f.colaborador_id = v_colab AND f.data = p_data AND f.status <> 'cancelada') THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST: você já tem folga marcada neste dia.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dp_solicitacoes s
              WHERE s.colaborador_id = v_colab AND s.tipo = 'folga'
                AND s.data_alvo = p_data AND s.status = 'pendente' AND s.removido_em IS NULL) THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST: já existe uma solicitação pendente para este dia.' USING ERRCODE = '22023';
  END IF;
  SELECT s.data_alvo INTO v_pend FROM public.dp_solicitacoes s
   WHERE s.colaborador_id = v_colab AND s.tipo = 'folga' AND s.status = 'pendente'
     AND s.removido_em IS NULL AND s.excede_limite_dia
     AND date_trunc('month', s.data_alvo) = date_trunc('month', p_data)
   LIMIT 1;
  IF v_pend IS NOT NULL THEN
    RAISE EXCEPTION 'FOLGA_MES_PEDIDO_PENDENTE: %', to_char(v_pend, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;

  -- Só faz sentido para dia lotado: com vaga, a folga é marcada direto.
  v_lim := public.dp_folga_limite_dia(v_company, v_unidade, v_cargo, p_data, NULL, v_setor);
  IF NOT COALESCE((v_lim->>'excedido')::boolean, false) THEN
    RAISE EXCEPTION 'FOLGA_COM_VAGA: este dia tem vaga, marque a folga direto.' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.dp_solicitacoes(
    company_id, colaborador_id, criado_por, tipo, data_alvo, motivo, status, fora_da_janela, excede_limite_dia)
  VALUES (v_company, v_colab, v_uid, 'folga', p_data,
          COALESCE(v_motivo, 'Folga de fim de semana do mês em curso (dia lotado)'),
          'pendente', false, true)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'solicitacao_id', v_id, 'limite', v_lim);
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_folga_solicitar_mes_lotado(date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_folga_solicitar_mes_lotado(date, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_validar_solicitacao_folga()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_unidade_id uuid;
  v_limite int;
  v_qtd int;
  v_bloqueada boolean;
  v_bloq_individual boolean;
  v_liberada boolean;
BEGIN
  IF NEW.tipo IS DISTINCT FROM 'folga' THEN RETURN NEW; END IF;
  IF NEW.status = 'cancelada' OR NEW.status = 'recusada' THEN RETURN NEW; END IF;
  IF NEW.data_alvo IS NULL THEN RETURN NEW; END IF;
  -- Pedido de exceção (folga extra, compensação, troca) ou da folga do mês em
  -- dia lotado fica pendente até o gestor decidir.
  IF (COALESCE(NEW.fora_da_janela, false) OR COALESCE(NEW.excede_limite_dia, false))
     AND NEW.status = 'pendente' THEN RETURN NEW; END IF;

  SELECT unidade_id INTO v_unidade_id
    FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;

  SELECT EXISTS (
    SELECT 1 FROM public.dp_datas_bloqueadas b
    WHERE b.company_id = NEW.company_id
      AND b.data = NEW.data_alvo
      AND (b.unidade_id IS NULL OR b.unidade_id = v_unidade_id)
      AND b.liberada_por_solicitacao IS NULL
      AND COALESCE(b.liberada, false) = false
  ) INTO v_bloqueada;
  IF v_bloqueada THEN
    RAISE EXCEPTION 'Data % está bloqueada para folgas nesta empresa/unidade', NEW.data_alvo
      USING ERRCODE = 'check_violation';
  END IF;

  IF public.dp_regra_bloqueia_data(NEW.company_id, v_unidade_id, NEW.data_alvo) THEN
    SELECT (liberada_por_solicitacao IS NOT NULL OR COALESCE(liberada, false) = true)
      INTO v_liberada
      FROM public.dp_datas_bloqueadas
     WHERE company_id = NEW.company_id
       AND data = NEW.data_alvo
       AND (unidade_id IS NULL OR unidade_id = v_unidade_id)
     ORDER BY unidade_id NULLS LAST
     LIMIT 1;
    IF NOT COALESCE(v_liberada, false) THEN
      RAISE EXCEPTION 'Data % está bloqueada por regra da empresa', NEW.data_alvo
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.dp_bloqueios bl
    WHERE bl.company_id = NEW.company_id
      AND bl.colaborador_id = NEW.colaborador_id
      AND bl.ativo = true
      AND bl.tipo IN ('folga','todos')
      AND bl.inicio <= NEW.data_alvo
      AND (bl.fim IS NULL OR bl.fim >= NEW.data_alvo)
  ) INTO v_bloq_individual;
  IF v_bloq_individual THEN
    RAISE EXCEPTION 'Você está bloqueado para marcar folga em %', NEW.data_alvo
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT limite_folgas INTO v_limite
    FROM public.dp_dia_config
   WHERE company_id = NEW.company_id
     AND data = NEW.data_alvo
     AND (unidade_id = v_unidade_id OR unidade_id IS NULL)
   ORDER BY (unidade_id IS NOT NULL) DESC
   LIMIT 1;

  IF v_limite IS NOT NULL AND v_limite > 0 THEN
    SELECT
      (
        SELECT COUNT(*) FROM public.dp_folgas f
         WHERE f.company_id = NEW.company_id
           AND f.data = NEW.data_alvo
           AND f.status <> 'cancelada'
           AND f.extra = false
           AND f.tipo NOT IN ('ferias','licenca')
           AND (v_unidade_id IS NULL OR EXISTS (
               SELECT 1 FROM public.dp_colaboradores c2
                WHERE c2.id = f.colaborador_id AND c2.unidade_id = v_unidade_id
             ))
      ) + (
        SELECT COUNT(*) FROM public.dp_solicitacoes s
         WHERE s.company_id = NEW.company_id
           AND s.data_alvo = NEW.data_alvo
           AND s.status = 'pendente'
           AND s.tipo = 'folga'
           AND s.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
           AND (v_unidade_id IS NULL OR EXISTS (
               SELECT 1 FROM public.dp_colaboradores c3
                WHERE c3.id = s.colaborador_id AND c3.unidade_id = v_unidade_id
             ))
      )
      INTO v_qtd;
    IF v_qtd >= v_limite THEN
      RAISE EXCEPTION 'Limite diário de folgas atingido para %', NEW.data_alvo
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.dp_solicitacao_responder(p_id uuid, p_status dp_solicitacao_status, p_resposta text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    IF COALESCE((v_lim->>'excedido')::boolean, false) AND NOT COALESCE(v_row.fora_da_janela, false)
       AND NOT COALESCE(v_row.excede_limite_dia, false) THEN
      RAISE EXCEPTION 'FOLGA_LIMITE_DIA: este dia já atingiu o limite de pessoas em folga.'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Pedido da folga do mês em dia lotado: se a folga do mês já saiu por outro
    -- caminho (vaga liberada, distribuição automática), não cria uma segunda.
    IF COALESCE(v_row.excede_limite_dia, false)
       AND public.dp_folga_marcadas_no_mes(v_row.company_id, v_row.colaborador_id, v_row.data_alvo,
             public.dp_folga_dias_fds_aplicaveis(v_row.company_id, v_unidade)) > 0 THEN
      RAISE EXCEPTION 'FOLGA_MES_JA_RESOLVIDA: o colaborador já tem a folga de fim de semana deste mês.'
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
        company_id, colaborador_id, data, tipo, origem, status, extra, criado_por, observacao)
      VALUES (v_row.company_id, v_row.colaborador_id, v_row.data_alvo,
              'normal'::public.dp_folga_tipo, 'troca'::public.dp_folga_origem,
              'agendada'::public.dp_folga_status, COALESCE(v_row.fora_da_janela, false), v_uid,
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

      -- Folga do mês pedida para dia lotado: o gestor decide passar do limite.
      IF COALESCE(v_row.excede_limite_dia, false) THEN
        PERFORM set_config('dp.folga_excedente_autorizado', 'on', true);
      END IF;

      INSERT INTO public.dp_folgas(
        company_id, colaborador_id, data, tipo, origem, status, extra, criado_por, observacao)
      VALUES (v_row.company_id, v_row.colaborador_id, v_row.data_alvo,
              'normal'::public.dp_folga_tipo, 'solicitacao'::public.dp_folga_origem,
              'agendada'::public.dp_folga_status, (NOT v_mudanca AND COALESCE(v_row.fora_da_janela, false)), v_uid,
              CASE WHEN COALESCE(v_row.excede_limite_dia, false)
                THEN 'Folga de fim de semana do mês aprovada pelo gestor acima do limite do dia'
                WHEN v_mudanca
                THEN 'Mudança da folga de ' || to_char(v_row.data_fim, 'DD/MM/YYYY') || ' aprovada pelo DP'
                WHEN COALESCE(v_row.fora_da_janela, false)
                THEN CASE WHEN COALESCE(v_row.motivo, '') ILIKE '%compensa%'
                       THEN 'Folga compensatória (exceção) aprovada pelo gestor'
                       ELSE 'Folga extra (exceção) aprovada pelo gestor' END
                ELSE 'Solicitação de folga aprovada pelo DP' END)
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_folga_id;

      IF COALESCE(v_row.excede_limite_dia, false) THEN
        PERFORM set_config('dp.folga_excedente_autorizado', 'off', true);
      END IF;
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
$function$;