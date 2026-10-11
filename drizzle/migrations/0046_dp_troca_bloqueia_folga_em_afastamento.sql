-- Folgas cobertas por atestado, licença, suspensão ou férias não podem ser trocadas.
-- Rollback: CREATE OR REPLACE das funções dp_troca_propor / private.dp_troca_efetivar
-- sem os blocos TROCA_FOLGA_EM_AFASTAMENTO e DROP FUNCTION private.dp_colab_afastado_em(uuid,date)
-- e public.dp_trocas_afastamentos(date,date).

-- 1) Detector único de afastamento (atestado/licenças/férias aprovadas, gozo de férias, suspensão)
CREATE OR REPLACE FUNCTION private.dp_colab_afastado_em(_colaborador uuid, _data date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.dp_solicitacoes s
    WHERE s.colaborador_id = _colaborador
      AND s.removido_em IS NULL
      AND s.status = 'aprovada'
      AND s.tipo IN ('atestado','licenca_maternidade','licenca_paternidade','ferias')
      AND s.data_alvo <= _data
      AND COALESCE(s.data_fim, s.data_alvo) >= _data
  ) OR EXISTS (
    SELECT 1 FROM public.dp_ferias_gozos g
    WHERE g.colaborador_id = _colaborador
      AND g.status IN ('aprovado','em_gozo')
      AND g.data_inicio <= _data
      AND g.data_fim >= _data
  ) OR EXISTS (
    SELECT 1 FROM public.dp_registros_disciplinares r
    WHERE r.colaborador_id = _colaborador
      AND r.tipo = 'suspensao'
      AND r.removido_em IS NULL
      AND r.data <= _data
      AND r.data + GREATEST(COALESCE(r.suspensao_dias, 1), 1) - 1 >= _data
  );
$fn$;

-- 2) Períodos de afastamento visíveis ao portal (sem expor o motivo), para a tela
--    já esconder as folgas indisponíveis para troca.
CREATE OR REPLACE FUNCTION public.dp_trocas_afastamentos(_de date, _ate date)
RETURNS TABLE(colaborador_id uuid, inicio date, fim date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  WITH me AS (SELECT public.dp_colaborador_ativo_of(auth.uid()) AS id),
       ctx AS (SELECT c.company_id FROM public.dp_colaboradores c JOIN me ON c.id = me.id)
  SELECT s.colaborador_id, s.data_alvo, COALESCE(s.data_fim, s.data_alvo)
    FROM public.dp_solicitacoes s, ctx
   WHERE s.company_id = ctx.company_id
     AND s.removido_em IS NULL
     AND s.status = 'aprovada'
     AND s.tipo IN ('atestado','licenca_maternidade','licenca_paternidade','ferias')
     AND s.data_alvo <= _ate
     AND COALESCE(s.data_fim, s.data_alvo) >= _de
  UNION ALL
  SELECT g.colaborador_id, g.data_inicio, g.data_fim
    FROM public.dp_ferias_gozos g, ctx
   WHERE g.company_id = ctx.company_id
     AND g.status IN ('aprovado','em_gozo')
     AND g.data_inicio <= _ate
     AND g.data_fim >= _de
  UNION ALL
  SELECT r.colaborador_id, r.data, r.data + GREATEST(COALESCE(r.suspensao_dias, 1), 1) - 1
    FROM public.dp_registros_disciplinares r, ctx
   WHERE r.company_id = ctx.company_id
     AND r.tipo = 'suspensao'
     AND r.removido_em IS NULL
     AND r.data <= _ate
     AND r.data + GREATEST(COALESCE(r.suspensao_dias, 1), 1) - 1 >= _de;
$fn$;

GRANT EXECUTE ON FUNCTION public.dp_trocas_afastamentos(date, date) TO authenticated;

-- 3) Trava na criação da proposta (nem o dono do afastamento nem o colega podem oferecer/pedir)
CREATE OR REPLACE FUNCTION public.dp_troca_propor(p_destino uuid, p_data_original date, p_data_proposta date, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  SELECT company_id INTO v_dest_company FROM public.dp_colaboradores
   WHERE id = p_destino AND deleted_at IS NULL AND ativo IS NOT false;
  IF v_dest_company IS NULL OR v_dest_company <> v_company THEN
    RAISE EXCEPTION 'FORBIDDEN: colega fora da sua empresa.' USING ERRCODE = '42501'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_company::text || '|troca_dia|' || p_data_original::text || '|' || p_data_proposta::text, 0));

  IF NOT EXISTS (SELECT 1 FROM public.dp_folgas f WHERE f.colaborador_id = v_colab AND f.data = p_data_original AND f.status <> 'cancelada')
     AND NOT private.dp_troca_folga_fixa_livre(v_colab, p_data_original) THEN
    RAISE EXCEPTION 'TROCA_SEM_FOLGA_PROPRIA: você não tem folga na data que ofereceu.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dp_folgas f WHERE f.colaborador_id = p_destino AND f.data = p_data_proposta AND f.status <> 'cancelada')
     AND NOT private.dp_troca_folga_fixa_livre(p_destino, p_data_proposta) THEN
    RAISE EXCEPTION 'TROCA_SEM_FOLGA_COLEGA: o colega não tem folga na data pedida.' USING ERRCODE = 'check_violation';
  END IF;
  -- Quem recebe o dia não pode já estar de folga nele.
  IF EXISTS (SELECT 1 FROM public.dp_folgas f WHERE f.colaborador_id = v_colab AND f.data = p_data_proposta AND f.status <> 'cancelada')
     OR private.dp_troca_folga_fixa_livre(v_colab, p_data_proposta) THEN
    RAISE EXCEPTION 'TROCA_JA_TEM_FOLGA: você já está de folga no dia pedido.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dp_folgas f WHERE f.colaborador_id = p_destino AND f.data = p_data_original AND f.status <> 'cancelada')
     OR private.dp_troca_folga_fixa_livre(p_destino, p_data_original) THEN
    RAISE EXCEPTION 'TROCA_COLEGA_JA_TEM_FOLGA: o colega já está de folga no dia que você ofereceu.' USING ERRCODE = 'check_violation';
  END IF;

  -- Folga coberta por atestado, licença, suspensão ou férias não é negociável:
  -- nem quem está afastado oferece, nem o colega pede a folga desse período.
  IF private.dp_colab_afastado_em(v_colab, p_data_original) THEN
    RAISE EXCEPTION 'TROCA_FOLGA_EM_AFASTAMENTO: sua folga de % cai em um período de atestado, licença, suspensão ou férias e não pode ser trocada.', to_char(p_data_original, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;
  IF private.dp_colab_afastado_em(p_destino, p_data_proposta) THEN
    RAISE EXCEPTION 'TROCA_FOLGA_EM_AFASTAMENTO_COLEGA: a folga do colega em % cai em um período de atestado, licença, suspensão ou férias e não pode ser trocada.', to_char(p_data_proposta, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM public.dp_trocas t
     WHERE t.solicitante_id = v_colab AND t.destino_id = p_destino
       AND t.data_original = p_data_original AND t.data_proposta = p_data_proposta
       AND t.status IN ('pendente_colega', 'pendente_gestor')) THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST: já existe uma troca pendente igual a esta.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.dp_trocas(company_id, solicitante_id, destino_id, data_original, data_proposta, motivo, status, created_by)
  VALUES (v_company, v_colab, p_destino, p_data_original, p_data_proposta, v_motivo, 'pendente_colega', v_uid)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'troca_id', v_id, 'status', 'pendente_colega');
END;
$function$;

-- 4) Revalidação na efetivação: se o afastamento foi registrado depois da proposta,
--    a troca é barrada antes de mexer nas folgas (vale para troca direta e com gestor).
CREATE OR REPLACE FUNCTION private.dp_troca_efetivar(_troca_id uuid, _ator uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t public.dp_trocas%ROWTYPE;
  v_folga_sol public.dp_folgas%ROWTYPE;
  v_folga_dest public.dp_folgas%ROWTYPE;
  v_fixa_sol boolean := false;
  v_fixa_dest boolean := false;
  v_nova_sol uuid; v_nova_dest uuid; v_motivo text;
BEGIN
  SELECT * INTO t FROM public.dp_trocas WHERE id = _troca_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN: troca não encontrada.' USING ERRCODE = '42501'; END IF;
  v_motivo := 'Troca aprovada (id=' || t.id || ')';

  SELECT * INTO v_folga_sol FROM public.dp_folgas
   WHERE company_id = t.company_id AND colaborador_id = t.solicitante_id AND data = t.data_original AND status <> 'cancelada'
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    v_fixa_sol := private.dp_troca_folga_fixa_livre(t.solicitante_id, t.data_original);
    IF NOT v_fixa_sol THEN
      RAISE EXCEPTION 'TROCA_SEM_FOLGA_PROPRIA: a folga oferecida não está mais ativa.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SELECT * INTO v_folga_dest FROM public.dp_folgas
   WHERE company_id = t.company_id AND colaborador_id = t.destino_id AND data = t.data_proposta AND status <> 'cancelada'
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    v_fixa_dest := private.dp_troca_folga_fixa_livre(t.destino_id, t.data_proposta);
    IF NOT v_fixa_dest THEN
      RAISE EXCEPTION 'TROCA_SEM_FOLGA_COLEGA: o colega não tem mais folga na data pedida.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Afastamento registrado após a proposta bloqueia a efetivação.
  IF private.dp_colab_afastado_em(t.solicitante_id, t.data_original) THEN
    RAISE EXCEPTION 'TROCA_FOLGA_EM_AFASTAMENTO: a folga oferecida (% ) cai em um período de atestado, licença, suspensão ou férias registrado após a proposta.', to_char(t.data_original, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;
  IF private.dp_colab_afastado_em(t.destino_id, t.data_proposta) THEN
    RAISE EXCEPTION 'TROCA_FOLGA_EM_AFASTAMENTO_COLEGA: a folga do colega (%) cai em um período de atestado, licença, suspensão ou férias registrado após a proposta.', to_char(t.data_proposta, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;

  IF v_fixa_sol THEN
    INSERT INTO public.dp_dia_trabalho_excepcional(company_id, colaborador_id, data, origem, criado_por)
    VALUES (t.company_id, t.solicitante_id, t.data_original, 'troca', _ator);
  ELSE
    UPDATE public.dp_folgas SET status = 'cancelada', updated_at = now() WHERE id = v_folga_sol.id;
    INSERT INTO public.dp_folgas_canceladas(company_id, colaborador_id, folga_id, data, motivo, origem_cancelamento, cancelado_por)
    VALUES (t.company_id, t.solicitante_id, v_folga_sol.id, t.data_original, v_motivo, 'troca', _ator);
  END IF;

  IF v_fixa_dest THEN
    INSERT INTO public.dp_dia_trabalho_excepcional(company_id, colaborador_id, data, origem, criado_por)
    VALUES (t.company_id, t.destino_id, t.data_proposta, 'troca', _ator);
  ELSE
    UPDATE public.dp_folgas SET status = 'cancelada', updated_at = now() WHERE id = v_folga_dest.id;
    INSERT INTO public.dp_folgas_canceladas(company_id, colaborador_id, folga_id, data, motivo, origem_cancelamento, cancelado_por)
    VALUES (t.company_id, t.destino_id, v_folga_dest.id, t.data_proposta, v_motivo, 'troca', _ator);
  END IF;

  INSERT INTO public.dp_folgas(company_id, colaborador_id, data, tipo, origem, status, extra, observacao, criado_por)
  VALUES (t.company_id, t.solicitante_id, t.data_proposta, 'normal', 'troca', 'agendada', false, v_motivo, _ator)
  RETURNING id INTO v_nova_sol;
  INSERT INTO public.dp_folgas(company_id, colaborador_id, data, tipo, origem, status, extra, observacao, criado_por)
  VALUES (t.company_id, t.destino_id, t.data_original, 'normal', 'troca', 'agendada', false, v_motivo, _ator)
  RETURNING id INTO v_nova_dest;

  RETURN jsonb_build_object(
    'troca_id', t.id,
    'folga_nova_solicitante', v_nova_sol, 'folga_nova_destino', v_nova_dest,
    'folga_cancelada_solicitante', v_folga_sol.id, 'folga_cancelada_destino', v_folga_dest.id,
    'folga_fixa_solicitante', v_fixa_sol, 'folga_fixa_destino', v_fixa_dest);
END
$function$;