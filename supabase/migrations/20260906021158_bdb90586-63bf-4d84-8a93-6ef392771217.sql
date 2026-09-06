ALTER TABLE public.dp_folga_autoatribuicao_execucoes
  ADD COLUMN IF NOT EXISTS manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS executada_por uuid;

-- Resumo prévio: pessoas elegíveis sem folga suficiente na competência
CREATE OR REPLACE FUNCTION public.dp_folga_autoatribuicao_previa(
  _company uuid,
  _unidade uuid,
  _competencia date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comp date;
  v_fim date;
  v_dias int[];
  v_exigidas int;
  v_sem_folga int := 0;
  v_a_criar int := 0;
  v_elegiveis int := 0;
  v_colab record;
  v_ja int;
  v_faltam int;
BEGIN
  IF _company IS NULL OR _competencia IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: empresa e competência obrigatórias.' USING ERRCODE = '22023';
  END IF;
  IF NOT private.is_company_admin_or_owner(auth.uid(), _company) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso restrito a administradores da empresa.' USING ERRCODE = '42501';
  END IF;

  v_comp := date_trunc('month', _competencia)::date;
  v_fim := (date_trunc('month', _competencia) + interval '1 month - 1 day')::date;

  v_dias := public.dp_folga_dias_fds_aplicaveis(_company, _unidade);
  SELECT COALESCE((public.dp_folgas_janela_efetiva(_company, _unidade, NULL)->>'folgas_exigidas')::int, 1)
    INTO v_exigidas;

  IF v_exigidas IS NULL OR v_exigidas <= 0 OR v_dias IS NULL OR array_length(v_dias, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'competencia', v_comp, 'elegiveis', 0, 'sem_folga', 0,
      'a_criar', 0, 'folgas_exigidas', COALESCE(v_exigidas, 0), 'dias', COALESCE(v_dias, '{}'::int[]));
  END IF;

  FOR v_colab IN
    SELECT c.id
      FROM public.dp_colaboradores c
     WHERE c.company_id = _company
       AND c.deleted_at IS NULL
       AND c.ativo IS NOT false
       AND (_unidade IS NULL OR c.unidade_id = _unidade)
       AND lower(COALESCE(c.vinculo_label, '')) NOT IN ('socio', 'sócio')
  LOOP
    v_elegiveis := v_elegiveis + 1;

    SELECT count(*) INTO v_ja
      FROM public.dp_folgas f
     WHERE f.colaborador_id = v_colab.id
       AND f.data BETWEEN v_comp AND v_fim
       AND f.status <> 'cancelada'
       AND f.extra = false
       AND f.tipo NOT IN ('ferias', 'licenca')
       AND EXTRACT(DOW FROM f.data)::int = ANY (v_dias);

    v_faltam := v_exigidas - COALESCE(v_ja, 0);
    IF v_faltam > 0 THEN
      v_sem_folga := v_sem_folga + 1;
      v_a_criar := v_a_criar + v_faltam;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'competencia', v_comp,
    'elegiveis', v_elegiveis,
    'sem_folga', v_sem_folga,
    'a_criar', v_a_criar,
    'folgas_exigidas', v_exigidas,
    'dias', v_dias);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_folga_autoatribuicao_previa(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folga_autoatribuicao_previa(uuid, uuid, date) TO authenticated, service_role;

-- Execução manual pelo administrador, para qualquer competência
CREATE OR REPLACE FUNCTION public.dp_folga_autoatribuir_manual(
  _company uuid,
  _unidade uuid,
  _competencia date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comp date;
  v_res jsonb;
  v_exec_id uuid;
BEGIN
  IF _company IS NULL OR _competencia IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: empresa e competência obrigatórias.' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF NOT private.is_company_admin_or_owner(auth.uid(), _company) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso restrito a administradores da empresa.' USING ERRCODE = '42501';
  END IF;

  v_comp := date_trunc('month', _competencia)::date;

  -- Execução manual reprocessa a competência: quem já tem folga não é tocado
  UPDATE public.dp_folga_autoatribuicao_execucoes
     SET status = 'pendente', erro = NULL, manual = true, executada_por = auth.uid()
   WHERE company_id = _company
     AND COALESCE(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = COALESCE(_unidade, '00000000-0000-0000-0000-000000000000'::uuid)
     AND competencia = v_comp;

  v_res := public.dp_folga_autoatribuir_competencia(_company, _unidade, v_comp);

  v_exec_id := NULLIF(v_res->>'execucao_id', '')::uuid;
  IF v_exec_id IS NOT NULL THEN
    UPDATE public.dp_folga_autoatribuicao_execucoes
       SET manual = true, executada_por = auth.uid()
     WHERE id = v_exec_id;
  END IF;

  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_folga_autoatribuir_manual(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folga_autoatribuir_manual(uuid, uuid, date) TO authenticated, service_role;