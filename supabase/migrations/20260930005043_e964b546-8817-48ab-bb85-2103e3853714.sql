DROP FUNCTION IF EXISTS public.dp_portal_equipe_unidade();
CREATE FUNCTION public.dp_portal_equipe_unidade()
 RETURNS TABLE(id uuid, nome text, nome_social text, cargo text, folga_fixa_semana integer, ativo boolean, unidade_id uuid, folgas_fixas_dow smallint[])
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_colab uuid; v_company uuid; v_unidade uuid;
BEGIN
  v_colab := public.dp_colaborador_ativo_of(auth.uid());
  IF v_colab IS NULL THEN RETURN; END IF;
  SELECT c.company_id, c.unidade_id INTO v_company, v_unidade FROM public.dp_colaboradores c WHERE c.id = v_colab;
  IF v_company IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT c.id, c.nome, c.nome_social, c.cargo, c.folga_fixa_semana, c.ativo, c.unidade_id,
         public.dp_dias_fixos_folga(c.id, CURRENT_DATE)
  FROM public.dp_colaboradores c
  WHERE c.company_id = v_company AND c.ativo IS NOT FALSE
    AND (v_unidade IS NULL OR c.unidade_id = v_unidade)
  ORDER BY c.nome;
END;
$function$;
REVOKE ALL ON FUNCTION public.dp_portal_equipe_unidade() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_portal_equipe_unidade() TO authenticated, service_role;

-- Folga válida para troca: registro ativo em dp_folgas OU dia de folga fixa sem exceção de trabalho.
CREATE OR REPLACE FUNCTION private.dp_troca_folga_fixa_livre(_colab uuid, _data date)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT extract(dow from _data)::smallint = ANY (public.dp_dias_fixos_folga(_colab, _data))
     AND NOT EXISTS (SELECT 1 FROM public.dp_dia_trabalho_excepcional e WHERE e.colaborador_id = _colab AND e.data = _data);
$$;
REVOKE ALL ON FUNCTION private.dp_troca_folga_fixa_livre(uuid, date) FROM PUBLIC, anon, authenticated;

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

CREATE OR REPLACE FUNCTION private.dp_troca_efetivar(_troca_id uuid, _ator uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
REVOKE ALL ON FUNCTION private.dp_troca_efetivar(uuid, uuid) FROM PUBLIC, anon, authenticated;