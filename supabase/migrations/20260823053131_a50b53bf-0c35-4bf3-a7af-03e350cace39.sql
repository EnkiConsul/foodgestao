CREATE OR REPLACE FUNCTION public.dp_processar_troca_direta(_troca_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  t public.dp_trocas%ROWTYPE;
  _cfg public.dp_config_dp;
  _unidade uuid;
  _tipo text;
  _colab_uid uuid;
  v_folga_destino public.dp_folgas%ROWTYPE;
  v_nova_folga_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;

  SELECT * INTO t FROM public.dp_trocas WHERE id = _troca_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Troca não encontrada' USING ERRCODE = '22023'; END IF;

  -- Somente o colega de destino (ou um admin) efetiva a troca direta.
  SELECT user_id, unidade_id INTO _colab_uid, _unidade
    FROM public.dp_colaboradores WHERE id = t.destino_id;
  IF _colab_uid IS DISTINCT FROM _uid
     AND NOT public.is_company_admin_or_owner(t.company_id) THEN
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

  SELECT * INTO v_folga_destino
    FROM public.dp_folgas
   WHERE company_id = t.company_id
     AND colaborador_id = t.destino_id
     AND data = t.data_original
     AND status <> 'cancelada'
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    UPDATE public.dp_folgas SET status = 'cancelada', updated_at = now() WHERE id = v_folga_destino.id;
    INSERT INTO public.dp_folgas_canceladas
      (company_id, colaborador_id, folga_id, data, motivo, origem_cancelamento, cancelado_por)
    VALUES
      (t.company_id, t.destino_id, v_folga_destino.id, t.data_original,
       'Troca direta aprovada (id=' || t.id || ')', 'troca', _uid);
  END IF;

  INSERT INTO public.dp_folgas
    (company_id, colaborador_id, data, tipo, origem, status, extra, observacao, criado_por)
  VALUES
    (t.company_id, t.solicitante_id, t.data_original,
     'normal', 'troca', 'agendada', false,
     'Troca direta aprovada (id=' || t.id || ')', _uid)
  RETURNING id INTO v_nova_folga_id;

  UPDATE public.dp_trocas
     SET status = 'aprovada',
         gestor_resposta = 'dispensada (troca direta)',
         gestor_respondido_em = now(),
         updated_at = now()
   WHERE id = t.id;

  RETURN jsonb_build_object('troca_id', t.id, 'status', 'aprovada', 'folga_nova_id', v_nova_folga_id);
END $function$;

REVOKE ALL ON FUNCTION public.dp_processar_troca_direta(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_processar_troca_direta(uuid) TO authenticated;