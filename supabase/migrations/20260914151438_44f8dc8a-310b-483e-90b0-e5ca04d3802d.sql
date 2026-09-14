-- Fase 5: efetivação correta e atômica da troca de folga.
-- Semântica única, igual à das telas: data_original é a folga de quem pediu
-- (oferecida) e data_proposta é a folga do colega (desejada). As duas folgas
-- são trocadas na mesma operação, com trava por colaborador/data.

CREATE OR REPLACE FUNCTION private.dp_troca_efetivar(_troca_id uuid, _ator uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  t public.dp_trocas%ROWTYPE;
  v_folga_sol public.dp_folgas%ROWTYPE;
  v_folga_dest public.dp_folgas%ROWTYPE;
  v_nova_sol uuid;
  v_nova_dest uuid;
  v_motivo text;
BEGIN
  SELECT * INTO t FROM public.dp_trocas WHERE id = _troca_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FORBIDDEN: troca não encontrada.' USING ERRCODE = '42501';
  END IF;
  v_motivo := 'Troca aprovada (id=' || t.id || ')';

  -- Trava as folgas em ordem determinística de data para evitar impasse.
  SELECT * INTO v_folga_sol
    FROM public.dp_folgas
   WHERE company_id = t.company_id
     AND colaborador_id = t.solicitante_id
     AND data = t.data_original
     AND status <> 'cancelada'
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TROCA_SEM_FOLGA_PROPRIA: a folga oferecida não está mais ativa.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_folga_dest
    FROM public.dp_folgas
   WHERE company_id = t.company_id
     AND colaborador_id = t.destino_id
     AND data = t.data_proposta
     AND status <> 'cancelada'
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TROCA_SEM_FOLGA_COLEGA: o colega não tem mais folga na data pedida.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.dp_folgas SET status = 'cancelada', updated_at = now()
   WHERE id IN (v_folga_sol.id, v_folga_dest.id);

  INSERT INTO public.dp_folgas_canceladas
    (company_id, colaborador_id, folga_id, data, motivo, origem_cancelamento, cancelado_por)
  VALUES
    (t.company_id, t.solicitante_id, v_folga_sol.id, t.data_original, v_motivo, 'troca', _ator),
    (t.company_id, t.destino_id, v_folga_dest.id, t.data_proposta, v_motivo, 'troca', _ator);

  INSERT INTO public.dp_folgas
    (company_id, colaborador_id, data, tipo, origem, status, extra, observacao, criado_por)
  VALUES
    (t.company_id, t.solicitante_id, t.data_proposta, 'normal', 'troca', 'agendada', false, v_motivo, _ator)
  RETURNING id INTO v_nova_sol;

  INSERT INTO public.dp_folgas
    (company_id, colaborador_id, data, tipo, origem, status, extra, observacao, criado_por)
  VALUES
    (t.company_id, t.destino_id, t.data_original, 'normal', 'troca', 'agendada', false, v_motivo, _ator)
  RETURNING id INTO v_nova_dest;

  RETURN jsonb_build_object(
    'troca_id', t.id,
    'folga_nova_solicitante', v_nova_sol,
    'folga_nova_destino', v_nova_dest,
    'folga_cancelada_solicitante', v_folga_sol.id,
    'folga_cancelada_destino', v_folga_dest.id
  );
END
$function$;

REVOKE ALL ON FUNCTION private.dp_troca_efetivar(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Caminho com aprovação do gestor
CREATE OR REPLACE FUNCTION public.dp_processar_troca(_troca_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  t public.dp_trocas%ROWTYPE;
  v_res jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_troca_id::text || '|troca', 0));
  SELECT * INTO t FROM public.dp_trocas WHERE id = _troca_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Troca não encontrada' USING ERRCODE = '22023'; END IF;

  IF NOT (private.is_company_admin_or_owner(_uid, t.company_id)
          OR public.is_super_admin(_uid)) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF t.status <> 'pendente_gestor' THEN
    RAISE EXCEPTION 'Troca em status % não pode ser processada', t.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(t.colega_resposta, '') <> 'aprovada' THEN
    RAISE EXCEPTION 'Colega ainda não aprovou a troca' USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(t.gestor_resposta, '') <> 'aprovada' THEN
    RAISE EXCEPTION 'Gestor ainda não aprovou a troca' USING ERRCODE = 'check_violation';
  END IF;

  v_res := private.dp_troca_efetivar(t.id, _uid);

  UPDATE public.dp_trocas
     SET status = 'aprovada', updated_at = now()
   WHERE id = t.id;

  RETURN v_res || jsonb_build_object('status', 'aprovada');
END
$function$;

REVOKE ALL ON FUNCTION public.dp_processar_troca(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_processar_troca(uuid) TO service_role;

-- Caminho de troca direta (unidade dispensa aprovação)
CREATE OR REPLACE FUNCTION public.dp_processar_troca_direta(_troca_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  t public.dp_trocas%ROWTYPE;
  _cfg public.dp_config_dp;
  _unidade uuid;
  _tipo text;
  _colab_uid uuid;
  v_res jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_troca_id::text || '|troca', 0));
  SELECT * INTO t FROM public.dp_trocas WHERE id = _troca_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Troca não encontrada' USING ERRCODE = '22023'; END IF;

  SELECT user_id, unidade_id INTO _colab_uid, _unidade
    FROM public.dp_colaboradores WHERE id = t.destino_id;
  IF _colab_uid IS DISTINCT FROM _uid
     AND NOT private.is_company_admin_or_owner(_uid, t.company_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  _cfg := public.dp_config_resolvida(t.company_id, _unidade);
  IF _cfg.troca_folga_modo <> 'direta' THEN
    RAISE EXCEPTION 'Esta unidade exige aprovação do administrador para a troca de folga'
      USING ERRCODE = 'check_violation';
  END IF;

  _tipo := CASE WHEN extract(dow from t.data_original) = 0 THEN 'dominical' ELSE 'semanal' END;
  IF coalesce(_cfg.troca_folga_escopo, 'ambas') <> 'ambas'
     AND _cfg.troca_folga_escopo <> _tipo THEN
    RAISE EXCEPTION 'A regra da unidade não permite troca desta folga (%).', _tipo
      USING ERRCODE = 'check_violation';
  END IF;

  IF COALESCE(t.colega_resposta, '') <> 'aprovada' THEN
    RAISE EXCEPTION 'Colega ainda não aprovou a troca' USING ERRCODE = 'check_violation';
  END IF;
  IF t.status NOT IN ('pendente_gestor', 'pendente_colega') THEN
    RAISE EXCEPTION 'Troca em status % não pode ser processada', t.status USING ERRCODE = 'check_violation';
  END IF;

  v_res := private.dp_troca_efetivar(t.id, _uid);

  UPDATE public.dp_trocas
     SET status = 'aprovada',
         gestor_resposta = 'dispensada (troca direta)',
         gestor_respondido_em = now(),
         updated_at = now()
   WHERE id = t.id;

  RETURN v_res || jsonb_build_object('status', 'aprovada');
END
$function$;

REVOKE ALL ON FUNCTION public.dp_processar_troca_direta(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_processar_troca_direta(uuid) TO service_role;
