-- Troca que mistura fim de semana e dia de semana sempre depende do gestor.
CREATE OR REPLACE FUNCTION private.dp_troca_exige_gestor(_data_a date, _data_b date)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT (extract(dow from _data_a)::int IN (0, 6))
      <> (extract(dow from _data_b)::int IN (0, 6));
$$;

REVOKE ALL ON FUNCTION private.dp_troca_exige_gestor(date, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dp_troca_responder_colega(p_id uuid, p_aceito boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_id IS NULL OR p_aceito IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a troca e a resposta.' USING ERRCODE = '22023';
  END IF;

  v_colab := public.dp_colaborador_ativo_of(v_uid);
  IF v_colab IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: cadastro de colaborador não encontrado.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text || '|troca', 0));
  SELECT * INTO t FROM public.dp_trocas WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR t.destino_id <> v_colab THEN
    RAISE EXCEPTION 'FORBIDDEN: troca não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF t.status <> 'pendente_colega' THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: esta troca não está aguardando sua resposta.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT p_aceito THEN
    UPDATE public.dp_trocas
       SET colega_resposta = 'recusada',
           colega_respondido_em = now(),
           status = 'recusada',
           updated_at = now()
     WHERE id = t.id;
    RETURN jsonb_build_object('ok', true, 'troca_id', t.id, 'status', 'recusada',
                              'efetivada', false);
  END IF;

  UPDATE public.dp_trocas
     SET colega_resposta = 'aprovada',
         colega_respondido_em = now(),
         status = 'pendente_gestor',
         updated_at = now()
   WHERE id = t.id;
  v_status := 'pendente_gestor';

  -- Troca de folga de fim de semana por dia de semana (ou o inverso) altera a
  -- escala de descanso: nunca pode ser efetivada direto, só com aval do gestor.
  v_exige_gestor := private.dp_troca_exige_gestor(t.data_original, t.data_proposta);

  IF NOT v_exige_gestor THEN
    SELECT unidade_id INTO v_unidade FROM public.dp_colaboradores WHERE id = t.destino_id;
    v_cfg := public.dp_config_resolvida(t.company_id, v_unidade);
    IF COALESCE(v_cfg.troca_folga_modo, 'aprovacao_admin') = 'direta' THEN
      PERFORM public.dp_processar_troca_direta(t.id);
      v_efetivada := true;
      v_status := 'aprovada';
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'troca_id', t.id, 'status', v_status,
                            'efetivada', v_efetivada,
                            'exige_gestor', v_exige_gestor);
END;
$function$;
