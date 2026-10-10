CREATE OR REPLACE FUNCTION public.dp_folga_admin_trocar_fixa(p_colaborador uuid, p_data_fixa date, p_data_nova date, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_company uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE='28000'; END IF;
  IF p_colaborador IS NULL OR p_data_fixa IS NULL OR p_data_nova IS NULL OR p_data_fixa = p_data_nova THEN
    RAISE EXCEPTION 'INVALID_INPUT: escolha um dia diferente.' USING ERRCODE='22023'; END IF;
  SELECT company_id INTO v_company FROM public.dp_colaboradores WHERE id = p_colaborador;
  IF v_company IS NULL THEN RAISE EXCEPTION 'NAO_ENCONTRADO: colaborador não encontrado.' USING ERRCODE='22023'; END IF;
  IF NOT private.is_company_admin_or_owner(v_uid, v_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso restrito a administradores da empresa.' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_colaborador::text || p_data_nova::text, 0));
  IF EXISTS (SELECT 1 FROM public.dp_folgas WHERE colaborador_id=p_colaborador AND data=p_data_nova AND status<>'cancelada') THEN
    RAISE EXCEPTION 'JA_TEM_FOLGA: o colaborador já tem folga neste dia.' USING ERRCODE='check_violation'; END IF;
  INSERT INTO public.dp_dia_trabalho_excepcional(company_id, colaborador_id, data, origem, criado_por)
  VALUES (v_company, p_colaborador, p_data_fixa, 'troca_gestor', v_uid)
  ON CONFLICT (colaborador_id, data) DO NOTHING;
  INSERT INTO public.dp_folgas(company_id, colaborador_id, data, origem, status, observacao, criado_por, direito_origem)
  VALUES (v_company, p_colaborador, p_data_nova, 'troca', 'agendada',
          coalesce(nullif(trim(p_motivo),''), 'Troca da folga fixa de ' || to_char(p_data_fixa,'DD/MM') || ' pelo gestor'), v_uid, 'folga_fixa_deslocada');
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.dp_folga_admin_trocar_fixa(uuid,date,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_folga_admin_trocar_fixa(uuid,date,date,text) TO authenticated, service_role;