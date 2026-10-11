CREATE OR REPLACE FUNCTION public.dp_indisponibilidade_registrar_gestor(
  p_colaborador uuid, p_inicio date, p_fim date DEFAULT NULL, p_motivo text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid; v_regime text; v_forma text; v_ativo boolean;
  v_fim date := COALESCE(p_fim, p_inicio);
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo,'')),'');
  d date; v_criadas int := 0; v_existentes int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
  IF p_colaborador IS NULL OR p_inicio IS NULL OR v_fim < p_inicio THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe colaborador e período válido.' USING ERRCODE='22023'; END IF;
  IF v_fim - p_inicio > 61 THEN
    RAISE EXCEPTION 'INVALID_INPUT: período máximo de 62 dias.' USING ERRCODE='22023'; END IF;
  IF v_motivo IS NOT NULL AND length(v_motivo) > 500 THEN
    RAISE EXCEPTION 'INVALID_INPUT: observação muito longa.' USING ERRCODE='22023'; END IF;

  SELECT c.company_id, c.regime::text, c.forma_pagamento::text, COALESCE(c.ativo, true)
    INTO v_company, v_regime, v_forma, v_ativo
    FROM public.dp_colaboradores c WHERE c.id = p_colaborador;
  IF v_company IS NULL THEN RAISE EXCEPTION 'COLABORADOR_INEXISTENTE' USING ERRCODE='22023'; END IF;

  IF NOT (private.is_company_admin_or_owner(v_uid, v_company)
          OR COALESCE(public.tem_permissao(v_company, 'dp.folgas', 'inclusao'), false)) THEN
    RAISE EXCEPTION 'FORBIDDEN: sem permissão.' USING ERRCODE='42501'; END IF;

  -- Só vínculos sob demanda: intermitente ou freelancer não mensalista.
  IF NOT (v_regime = 'intermitente'
          OR (v_regime = 'freelancer' AND v_forma IS NOT NULL AND v_forma <> 'mensalista')) THEN
    RAISE EXCEPTION 'REGIME_NAO_CONVOCAVEL: este vínculo segue a rotina de folgas.' USING ERRCODE='42501'; END IF;

  IF EXISTS (SELECT 1 FROM public.dp_convocacoes cv
              WHERE cv.colaborador_id = p_colaborador AND cv.status = 'aceita'
                AND cv.data BETWEEN p_inicio AND v_fim) THEN
    RAISE EXCEPTION 'CONVOCACAO_ACEITA: já existe convocação aceita no período; registre como falta.' USING ERRCODE='22023'; END IF;

  d := p_inicio;
  WHILE d <= v_fim LOOP
    IF EXISTS (SELECT 1 FROM public.dp_indisponibilidades i
                WHERE i.colaborador_id = p_colaborador AND i.data = d AND i.cancelada_em IS NULL) THEN
      v_existentes := v_existentes + 1;
    ELSE
      INSERT INTO public.dp_indisponibilidades (company_id, colaborador_id, data, motivo, origem, criado_por, informada_em)
      VALUES (v_company, p_colaborador, d, v_motivo, 'gestor', v_uid, now());
      v_criadas := v_criadas + 1;
    END IF;
    d := d + 1;
  END LOOP;

  RETURN jsonb_build_object('criadas', v_criadas, 'existentes', v_existentes);
END $$;

REVOKE ALL ON FUNCTION public.dp_indisponibilidade_registrar_gestor(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_indisponibilidade_registrar_gestor(uuid, date, date, text) TO authenticated, service_role;