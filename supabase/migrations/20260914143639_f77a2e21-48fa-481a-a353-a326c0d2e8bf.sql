-- ---------------------------------------------------------------------------
-- Fase 4 — Folgas e solicitações autoritativas no servidor
-- ---------------------------------------------------------------------------

-- 1) Assinatura antiga vira wrapper da versão segura (janela sempre valendo)
CREATE OR REPLACE FUNCTION public.dp_folga_solicitar(p_data date, p_motivo text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.dp_folga_solicitar(p_data, p_motivo, false);
$function$;

-- 2) Marcar folga própria (substitui INSERT direto do portal)
CREATE OR REPLACE FUNCTION public.dp_folga_marcar(p_data date)
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
  v_janela jsonb;
  v_lim jsonb;
  v_conf jsonb;
  v_id uuid;
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

  SELECT c.company_id, c.unidade_id, c.cargo_id, c.setor_id
    INTO v_company, v_unidade, v_cargo, v_setor
    FROM public.dp_colaboradores c WHERE c.id = v_colab;

  IF p_data < CURRENT_DATE THEN
    RAISE EXCEPTION 'PAST_DATE_NOT_EDITABLE: datas passadas não podem ser marcadas.'
      USING ERRCODE = '22023';
  END IF;

  v_janela := public.dp_folgas_janela_efetiva(v_company, v_unidade, NULL);
  IF COALESCE((v_janela->>'ativa')::boolean, false) THEN
    IF (v_janela->>'estado') <> 'aberta'
       OR date_trunc('month', p_data) <> date_trunc('month', (v_janela->>'competencia')::date) THEN
      RAISE EXCEPTION 'FOLGA_FORA_DA_JANELA: fora do período de escolha das folgas.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- concorrência: dia da unidade (capacidade) e pessoa+dia (duplicidade)
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_company::text || '|folga_dia|' || COALESCE(v_unidade::text, 'sem') || '|' || p_data::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_colab::text || '|folga_self|' || p_data::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.dp_folgas f
     WHERE f.colaborador_id = v_colab AND f.data = p_data AND f.status <> 'cancelada'
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST: você já tem folga marcada neste dia.'
      USING ERRCODE = '22023';
  END IF;

  v_lim := public.dp_folga_limite_dia(v_company, v_unidade, v_cargo, p_data, NULL, v_setor);
  IF COALESCE((v_lim->>'excedido')::boolean, false) THEN
    RAISE EXCEPTION 'FOLGA_LIMITE_DIA: este dia já atingiu o limite de pessoas em folga.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_conf := public.dp_folga_conflito_colaboradores(v_company, v_colab, p_data);
  IF COALESCE((v_conf->>'conflito')::boolean, false) THEN
    RAISE EXCEPTION 'FOLGA_INCOMPATIBILIDADE: % já está de folga neste dia e vocês não podem folgar juntos.',
      COALESCE(v_conf->>'colega_nome', 'Outra pessoa') USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.dp_folgas(
    company_id, colaborador_id, data, tipo, origem, status, extra, criado_por)
  VALUES (v_company, v_colab, p_data, 'normal', 'solicitacao', 'agendada', false, v_uid)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'folga_id', v_id, 'limite', v_lim);
END;
$function$;

-- 3) Remover a própria folga
CREATE OR REPLACE FUNCTION public.dp_folga_remover(p_data date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_colab uuid;
  v_folga record;
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

  IF p_data < CURRENT_DATE THEN
    RAISE EXCEPTION 'PAST_DATE_NOT_EDITABLE: não é possível remover folga passada.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_colab::text || '|folga_self|' || p_data::text, 0));

  SELECT * INTO v_folga
    FROM public.dp_folgas f
   WHERE f.colaborador_id = v_colab
     AND f.data = p_data
     AND f.status = 'agendada'
   ORDER BY f.created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF v_folga.id IS NULL THEN
    RAISE EXCEPTION 'FOLGA_NAO_ENCONTRADA: folga não encontrada.' USING ERRCODE = '22023';
  END IF;
  IF v_folga.origem = 'automatica_clt'::public.dp_folga_origem THEN
    RAISE EXCEPTION 'FOLGA_OBRIGATORIA: esta folga dominical é definida pela CLT e não pode ser removida.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_folga.origem <> 'solicitacao'::public.dp_folga_origem OR v_folga.criado_por IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'FOLGA_NAO_REMOVIVEL: apenas folgas marcadas por você podem ser removidas.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.dp_folgas WHERE id = v_folga.id;
  RETURN jsonb_build_object('ok', true, 'folga_id', v_folga.id);
END;
$function$;

-- 4) Criar solicitação (colaborador, pela própria sessão)
CREATE OR REPLACE FUNCTION public.dp_solicitacao_criar(
  p_tipo public.dp_solicitacao_tipo,
  p_data_alvo date,
  p_data_fim date DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_arquivo_path text DEFAULT NULL)
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
  v_janela jsonb;
  v_lim jsonb;
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_tipo IS NULL OR p_data_alvo IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe tipo e data.' USING ERRCODE = '22023';
  END IF;
  IF p_data_fim IS NOT NULL AND p_data_fim < p_data_alvo THEN
    RAISE EXCEPTION 'INVALID_INPUT: a data fim não pode ser anterior à data inicial.' USING ERRCODE = '22023';
  END IF;
  IF p_tipo <> 'folga'::public.dp_solicitacao_tipo AND v_motivo IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: motivo obrigatório para este tipo de solicitação.' USING ERRCODE = '22023';
  END IF;

  v_colab := public.dp_colaborador_ativo_of(v_uid);
  IF v_colab IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: cadastro de colaborador não encontrado.' USING ERRCODE = '42501';
  END IF;

  SELECT c.company_id, c.unidade_id, c.cargo_id, c.setor_id
    INTO v_company, v_unidade, v_cargo, v_setor
    FROM public.dp_colaboradores c WHERE c.id = v_colab;

  IF p_tipo = 'folga'::public.dp_solicitacao_tipo THEN
    IF p_data_alvo < CURRENT_DATE THEN
      RAISE EXCEPTION 'PAST_DATE_NOT_EDITABLE: datas passadas não podem ser solicitadas.'
        USING ERRCODE = '22023';
    END IF;

    v_janela := public.dp_folgas_janela_efetiva(v_company, v_unidade, NULL);
    IF COALESCE((v_janela->>'ativa')::boolean, false)
       AND ((v_janela->>'estado') <> 'aberta'
            OR date_trunc('month', p_data_alvo) <> date_trunc('month', (v_janela->>'competencia')::date)) THEN
      RAISE EXCEPTION 'FOLGA_FORA_DA_JANELA: fora do período de escolha das folgas.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_company::text || '|folga_dia|' || COALESCE(v_unidade::text, 'sem') || '|' || p_data_alvo::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_colab::text || '|solic_' || p_tipo::text || '|' || p_data_alvo::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.dp_solicitacoes s
     WHERE s.colaborador_id = v_colab AND s.tipo = p_tipo
       AND s.data_alvo = p_data_alvo AND s.status = 'pendente'
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST: já existe uma solicitação pendente para este dia.'
      USING ERRCODE = '22023';
  END IF;

  IF p_tipo = 'folga'::public.dp_solicitacao_tipo THEN
    v_lim := public.dp_folga_limite_dia(v_company, v_unidade, v_cargo, p_data_alvo, NULL, v_setor);
    IF COALESCE((v_lim->>'excedido')::boolean, false) THEN
      RAISE EXCEPTION 'FOLGA_LIMITE_DIA: este dia já atingiu o limite de pessoas em folga.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO public.dp_solicitacoes(
    company_id, colaborador_id, criado_por, tipo, data_alvo, data_fim, motivo, status, arquivo_path)
  VALUES (v_company, v_colab, v_uid, p_tipo, p_data_alvo, p_data_fim, v_motivo, 'pendente',
          NULLIF(btrim(COALESCE(p_arquivo_path, '')), ''))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'solicitacao_id', v_id, 'limite', v_lim);
END;
$function$;

-- 5) Cancelar a própria solicitação
CREATE OR REPLACE FUNCTION public.dp_solicitacao_cancelar(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_colab uuid;
  v_row record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a solicitação.' USING ERRCODE = '22023';
  END IF;

  v_colab := public.dp_colaborador_of(v_uid);
  IF v_colab IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: cadastro de colaborador não encontrado.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.dp_solicitacoes WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL OR v_row.colaborador_id <> v_colab THEN
    RAISE EXCEPTION 'FORBIDDEN: solicitação não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF v_row.status <> 'pendente'::public.dp_solicitacao_status THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: apenas solicitações pendentes podem ser canceladas.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.dp_solicitacoes
     SET status = 'cancelada', updated_at = now()
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'solicitacao_id', p_id);
END;
$function$;

-- 6) Responder solicitação (gestor)
CREATE OR REPLACE FUNCTION public.dp_solicitacao_responder(
  p_id uuid,
  p_status public.dp_solicitacao_status,
  p_resposta text DEFAULT NULL)
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

    v_lim := public.dp_folga_limite_dia(
      v_row.company_id, v_unidade, v_cargo, v_row.data_alvo, v_row.colaborador_id, v_setor);
    IF COALESCE((v_lim->>'excedido')::boolean, false) THEN
      RAISE EXCEPTION 'FOLGA_LIMITE_DIA: este dia já atingiu o limite de pessoas em folga.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  UPDATE public.dp_solicitacoes
     SET status = p_status,
         respondido_por = v_uid,
         respondido_em = now(),
         resposta_admin = NULLIF(btrim(COALESCE(p_resposta, '')), ''),
         updated_at = now()
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'solicitacao_id', p_id, 'status', p_status, 'limite', v_lim);
END;
$function$;

-- 7) Criação administrativa de solicitação / ausência
CREATE OR REPLACE FUNCTION public.dp_solicitacao_criar_admin(
  p_colaborador uuid,
  p_tipo public.dp_solicitacao_tipo,
  p_data_alvo date,
  p_data_fim date DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_arquivo_path text DEFAULT NULL,
  p_aprovada boolean DEFAULT false)
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
  v_setor uuid;
  v_lim jsonb;
  v_status public.dp_solicitacao_status;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_colaborador IS NULL OR p_tipo IS NULL OR p_data_alvo IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe colaborador, tipo e data.' USING ERRCODE = '22023';
  END IF;
  IF p_data_fim IS NOT NULL AND p_data_fim < p_data_alvo THEN
    RAISE EXCEPTION 'INVALID_INPUT: a data fim não pode ser anterior à data inicial.' USING ERRCODE = '22023';
  END IF;

  SELECT c.company_id, c.unidade_id, c.cargo_id, c.setor_id
    INTO v_company, v_unidade, v_cargo, v_setor
    FROM public.dp_colaboradores c
   WHERE c.id = p_colaborador AND c.deleted_at IS NULL;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NAO_ENCONTRADO: colaborador não encontrado.' USING ERRCODE = '22023';
  END IF;
  IF NOT private.is_company_admin_or_owner(v_uid, v_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso restrito a administradores da empresa.' USING ERRCODE = '42501';
  END IF;

  v_status := CASE WHEN COALESCE(p_aprovada, false)
                   THEN 'aprovada'::public.dp_solicitacao_status
                   ELSE 'pendente'::public.dp_solicitacao_status END;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_company::text || '|folga_dia|' || COALESCE(v_unidade::text, 'sem') || '|' || p_data_alvo::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_colaborador::text || '|solic_' || p_tipo::text || '|' || p_data_alvo::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.dp_solicitacoes s
     WHERE s.colaborador_id = p_colaborador AND s.tipo = p_tipo
       AND s.data_alvo = p_data_alvo
       AND s.status IN ('pendente'::public.dp_solicitacao_status, 'aprovada'::public.dp_solicitacao_status)
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST: já existe uma solicitação para este colaborador neste dia.'
      USING ERRCODE = '22023';
  END IF;

  IF p_tipo = 'folga'::public.dp_solicitacao_tipo THEN
    v_lim := public.dp_folga_limite_dia(v_company, v_unidade, v_cargo, p_data_alvo, p_colaborador, v_setor);
    IF COALESCE((v_lim->>'excedido')::boolean, false) THEN
      RAISE EXCEPTION 'FOLGA_LIMITE_DIA: este dia já atingiu o limite de pessoas em folga.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO public.dp_solicitacoes(
    company_id, colaborador_id, criado_por, tipo, data_alvo, data_fim, motivo, status,
    arquivo_path, respondido_por, respondido_em)
  VALUES (v_company, p_colaborador, v_uid, p_tipo, p_data_alvo, p_data_fim,
          NULLIF(btrim(COALESCE(p_motivo, '')), ''), v_status,
          NULLIF(btrim(COALESCE(p_arquivo_path, '')), ''),
          CASE WHEN v_status = 'aprovada' THEN v_uid END,
          CASE WHEN v_status = 'aprovada' THEN now() END)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'solicitacao_id', v_id, 'status', v_status, 'limite', v_lim);
END;
$function$;

-- 8) Atribuição rápida do gestor
CREATE OR REPLACE FUNCTION public.dp_folga_atribuir_admin(
  p_colaborador uuid,
  p_data date,
  p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.dp_solicitacao_criar_admin(
    p_colaborador, 'folga'::public.dp_solicitacao_tipo, p_data, NULL, p_motivo, NULL, true);
$function$;

-- 9) Permissões mínimas
REVOKE ALL ON FUNCTION public.dp_folga_marcar(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_folga_remover(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_solicitacao_criar(public.dp_solicitacao_tipo, date, date, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_solicitacao_cancelar(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_solicitacao_responder(uuid, public.dp_solicitacao_status, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_solicitacao_criar_admin(uuid, public.dp_solicitacao_tipo, date, date, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_folga_atribuir_admin(uuid, date, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.dp_folga_marcar(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_folga_remover(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_solicitacao_criar(public.dp_solicitacao_tipo, date, date, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_solicitacao_cancelar(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_solicitacao_responder(uuid, public.dp_solicitacao_status, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_solicitacao_criar_admin(uuid, public.dp_solicitacao_tipo, date, date, text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_folga_atribuir_admin(uuid, date, text) TO authenticated, service_role;

-- 10) Visitante (anon) perde acesso às rotinas de folga
REVOKE EXECUTE ON FUNCTION public.dp_folga_solicitar(date, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_folga_solicitar(date, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_folga_limite_dia(uuid, uuid, uuid, date, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_folgas_janela_efetiva(uuid, uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_folga_conflito_colaboradores(uuid, uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_folga_autoatribuicao_plano(uuid, uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_folga_autoatribuicao_previa(uuid, uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_folga_autoatribuir_aplicar(uuid, uuid, date, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_folga_autoatribuir_competencia(uuid, uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_folga_autoatribuir_manual(uuid, uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_folga_autoatribuir_todas() FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_folga_marcadas_no_mes(uuid, uuid, date, integer[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_folga_ocupado_no_dia(uuid, uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_folga_dias_fds_aplicaveis(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.dp_folga_solicitar(date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_folga_solicitar(date, text, boolean) TO authenticated, service_role;