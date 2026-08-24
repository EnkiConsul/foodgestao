CREATE OR REPLACE FUNCTION public.dp_convocacao_config_resolvida(_company_id uuid, _unidade_id uuid DEFAULT NULL)
RETURNS public.dp_convocacao_config
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_cfg public.dp_convocacao_config;
BEGIN
  IF _unidade_id IS NOT NULL THEN
    SELECT * INTO v_cfg FROM public.dp_convocacao_config
      WHERE company_id = _company_id AND unidade_id = _unidade_id;
    IF FOUND THEN RETURN v_cfg; END IF;
  END IF;

  SELECT * INTO v_cfg FROM public.dp_convocacao_config
    WHERE company_id = _company_id AND unidade_id IS NULL;
  IF FOUND THEN RETURN v_cfg; END IF;

  v_cfg.id := NULL;
  v_cfg.company_id := _company_id;
  v_cfg.unidade_id := _unidade_id;
  v_cfg.antecedencia_minima_dias := 3;
  v_cfg.prazo_resposta_dias_uteis := 1;
  v_cfg.aprovacao_modo := 'somente_excecoes';
  v_cfg.sub_intermitente_por_intermitente := true;
  v_cfg.sub_intermitente_por_freelancer := true;
  v_cfg.sub_freelancer_por_intermitente := true;
  v_cfg.sub_freelancer_por_freelancer := true;
  v_cfg.sub_fixo_em_folga_dominical := false;
  v_cfg.reabre_vaga_em_desistencia := true;
  v_cfg.autonomia_colaborador_desistir := true;
  v_cfg.permite_oferta_aberta := true;
  v_cfg.exige_justificativa_excecao := true;
  RETURN v_cfg;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_convocacao_config_resolvida(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_config_resolvida(uuid, uuid) TO authenticated;