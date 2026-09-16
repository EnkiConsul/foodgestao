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
  v_estado text;
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
    v_estado := v_janela->>'estado';
    -- O período é apenas o marco INICIAL da escolha: antes de abrir só cabe
    -- pedido de exceção; com o período encerrado o colaborador segue livre para
    -- marcar/mudar folgas em datas futuras (troca e exceção também continuam).
    IF v_estado = 'antes' THEN
      RAISE EXCEPTION 'FOLGA_FORA_DA_JANELA: o período de escolha das folgas ainda não abriu.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_estado = 'aberta'
       AND date_trunc('month', p_data) <> date_trunc('month', (v_janela->>'competencia')::date) THEN
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