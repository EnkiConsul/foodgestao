CREATE INDEX IF NOT EXISTS idx_dp_indisponibilidades_reserva
  ON public.dp_indisponibilidades (company_id, data)
  WHERE cancelada_em IS NULL;

CREATE OR REPLACE FUNCTION public.dp_folga_reserva_indisponibilidade(
  p_company uuid,
  p_unidade uuid,
  p_cargo uuid DEFAULT NULL,
  p_data date DEFAULT NULL,
  p_setor uuid DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cfg record;
BEGIN
  IF p_company IS NULL OR p_data IS NULL THEN
    RETURN 0;
  END IF;

  IF v_uid IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.company_members m
                       WHERE m.company_id = p_company AND m.user_id = v_uid)
     AND NOT EXISTS (SELECT 1 FROM public.companies c
                       WHERE c.id = p_company AND c.owner_id = v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN: empresa fora do seu escopo.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_cfg FROM public.dp_convocacao_config_resolvida(p_company, p_unidade);
  IF NOT COALESCE(v_cfg.disponibilidade_reserva_folga, false) THEN
    RETURN 0;
  END IF;

  RETURN (
    SELECT count(*)::int
      FROM public.dp_indisponibilidades i
      JOIN public.dp_colaboradores c ON c.id = i.colaborador_id
     WHERE i.company_id = p_company
       AND i.data = p_data
       AND i.cancelada_em IS NULL
       AND c.deleted_at IS NULL
       AND c.ativo IS NOT false
       AND COALESCE(public.dp_regime_convocavel(c.regime), false)
       AND (p_unidade IS NULL OR c.unidade_id = p_unidade)
       AND (p_cargo IS NULL OR c.cargo_id = p_cargo)
       AND (p_setor IS NULL OR public.dp_setor_previsto_id(c.id, p_data) = p_setor)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dp_folga_reserva_indisponibilidade(uuid, uuid, uuid, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folga_reserva_indisponibilidade(uuid, uuid, uuid, date, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_folga_limite_dia(
  p_company uuid,
  p_unidade uuid,
  p_cargo uuid,
  p_data date,
  p_ignorar_colaborador uuid DEFAULT NULL,
  p_setor uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_wd int;
  v_limite int;
  v_origem text := 'sem_limite';
  v_regras jsonb := '[]'::jsonb;
  v_pior jsonb;
  v_setor_nao_definido boolean := false;
  v_tem_regra_setor boolean := false;
  r record;
  v_setores uuid[];
  v_em_folga int;
  v_cfg record;
  v_reserva int;
  v_reserva_ativa boolean := false;
BEGIN
  IF p_company IS NULL OR p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: empresa e data são obrigatórias.' USING ERRCODE = '22023';
  END IF;

  IF v_uid IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.company_members m
                       WHERE m.company_id = p_company AND m.user_id = v_uid)
     AND NOT EXISTS (SELECT 1 FROM public.companies c
                       WHERE c.id = p_company AND c.owner_id = v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN: empresa fora do seu escopo.' USING ERRCODE = '42501';
  END IF;

  v_wd := EXTRACT(DOW FROM p_data)::int;

  SELECT * INTO v_cfg FROM public.dp_convocacao_config_resolvida(p_company, p_unidade);
  v_reserva_ativa := COALESCE(v_cfg.disponibilidade_reserva_folga, false);

  -- Exceção manual da data prevalece
  SELECT dc.limite_folgas INTO v_limite
    FROM public.dp_dia_config dc
   WHERE dc.company_id = p_company
     AND dc.data = p_data
     AND (dc.unidade_id IS NULL OR dc.unidade_id = p_unidade)
   ORDER BY (dc.unidade_id IS NOT NULL) DESC
   LIMIT 1;

  IF v_limite IS NOT NULL THEN
    v_reserva := CASE WHEN v_reserva_ativa
      THEN public.dp_folga_reserva_indisponibilidade(p_company, p_unidade, NULL, p_data, NULL)
      ELSE 0 END;

    SELECT count(*) INTO v_em_folga
      FROM public.dp_colaboradores c
     WHERE c.company_id = p_company
       AND c.deleted_at IS NULL
       AND (p_unidade IS NULL OR c.unidade_id = p_unidade)
       AND (p_ignorar_colaborador IS NULL OR c.id <> p_ignorar_colaborador)
       AND (
         EXISTS (SELECT 1 FROM public.dp_folgas f
                  WHERE f.colaborador_id = c.id AND f.data = p_data
                    AND f.status <> 'cancelada' AND f.extra = false
                    AND f.tipo NOT IN ('ferias', 'licenca'))
         OR EXISTS (SELECT 1 FROM public.dp_solicitacoes s
                     WHERE s.colaborador_id = c.id AND s.tipo = 'folga'
                       AND s.data_alvo = p_data AND s.status = 'aprovada')
       );

    v_em_folga := COALESCE(v_em_folga, 0) + v_reserva;

    RETURN jsonb_build_object(
      'limite', v_limite, 'origem', 'excecao_data', 'regra_id', NULL, 'tipo', NULL,
      'por_cargo', false, 'por_setor', false, 'setor_nao_definido', false,
      'em_folga', v_em_folga,
      'reserva', v_reserva,
      'reserva_ativa', v_reserva_ativa,
      'disponivel', GREATEST(v_limite - v_em_folga, 0),
      'excedido', v_em_folga >= v_limite,
      'regras', '[]'::jsonb);
  END IF;

  FOR r IN
    SELECT r.id, r.maximo, r.tipo, r.nome
      FROM public.dp_folga_limite_regras r
     WHERE r.company_id = p_company
       AND r.ativo = true
       AND r.tipo IN ('quantidade', 'cargo', 'setor')
       AND (r.unidade_id IS NULL OR r.unidade_id = p_unidade)
       AND (r.dia_semana IS NULL OR r.dia_semana = v_wd)
       AND (r.vigencia_inicio IS NULL OR r.vigencia_inicio <= p_data)
       AND (r.vigencia_fim IS NULL OR r.vigencia_fim >= p_data)
       AND (
         r.tipo <> 'cargo'
         OR NOT EXISTS (SELECT 1 FROM public.dp_folga_limite_regra_cargos rc WHERE rc.regra_id = r.id)
         OR (p_cargo IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.dp_folga_limite_regra_cargos rc
               WHERE rc.regra_id = r.id AND rc.cargo_id = p_cargo))
       )
     ORDER BY (r.unidade_id IS NOT NULL) DESC,
              (r.tipo IN ('cargo', 'setor')) DESC,
              (r.dia_semana IS NOT NULL) DESC,
              r.vigencia_inicio DESC NULLS LAST
  LOOP
    v_setores := ARRAY[]::uuid[];

    IF r.tipo = 'setor' THEN
      v_tem_regra_setor := true;
      SELECT coalesce(array_agg(rs.setor_id), ARRAY[]::uuid[]) INTO v_setores
        FROM public.dp_folga_limite_regra_setores rs WHERE rs.regra_id = r.id;

      IF p_setor IS NULL THEN
        v_setor_nao_definido := true;
        CONTINUE;
      END IF;
      IF NOT (p_setor = ANY(v_setores)) THEN
        CONTINUE;
      END IF;
    END IF;

    SELECT count(*) INTO v_em_folga
      FROM public.dp_colaboradores c
     WHERE c.company_id = p_company
       AND c.deleted_at IS NULL
       AND (p_unidade IS NULL OR c.unidade_id = p_unidade)
       AND (
         r.tipo <> 'cargo'
         OR NOT EXISTS (SELECT 1 FROM public.dp_folga_limite_regra_cargos rc WHERE rc.regra_id = r.id)
         OR (p_cargo IS NOT NULL AND c.cargo_id = p_cargo)
       )
       AND (r.tipo <> 'setor' OR public.dp_setor_previsto_id(c.id, p_data) = ANY(v_setores))
       AND (p_ignorar_colaborador IS NULL OR c.id <> p_ignorar_colaborador)
       AND (
         EXISTS (SELECT 1 FROM public.dp_folgas f
                  WHERE f.colaborador_id = c.id AND f.data = p_data
                    AND f.status <> 'cancelada' AND f.extra = false
                    AND f.tipo NOT IN ('ferias', 'licenca'))
         OR EXISTS (SELECT 1 FROM public.dp_solicitacoes s
                     WHERE s.colaborador_id = c.id AND s.tipo = 'folga'
                       AND s.data_alvo = p_data AND s.status = 'aprovada')
       );

    v_reserva := CASE WHEN v_reserva_ativa THEN
      CASE r.tipo
        WHEN 'setor' THEN public.dp_folga_reserva_indisponibilidade(p_company, p_unidade, p_cargo, p_data, p_setor)
        WHEN 'cargo' THEN public.dp_folga_reserva_indisponibilidade(p_company, p_unidade, p_cargo, p_data, NULL)
        ELSE public.dp_folga_reserva_indisponibilidade(p_company, p_unidade, NULL, p_data, NULL)
      END
    ELSE 0 END;

    v_em_folga := COALESCE(v_em_folga, 0) + v_reserva;

    v_regras := v_regras || jsonb_build_object(
      'regra_id', r.id,
      'nome', r.nome,
      'tipo', r.tipo,
      'limite', r.maximo,
      'setores', to_jsonb(v_setores),
      'em_folga', v_em_folga,
      'reserva', v_reserva,
      'disponivel', GREATEST(r.maximo - v_em_folga, 0),
      'excedido', v_em_folga >= r.maximo);
  END LOOP;

  SELECT x.regra INTO v_pior
    FROM jsonb_array_elements(v_regras) AS x(regra)
   ORDER BY ((x.regra->>'excedido')::boolean) DESC,
            (x.regra->>'disponivel')::int ASC
   LIMIT 1;

  IF v_pior IS NULL THEN
    RETURN jsonb_build_object(
      'limite', NULL, 'origem', 'sem_limite', 'regra_id', NULL, 'tipo', NULL,
      'por_cargo', false, 'por_setor', false,
      'setor_nao_definido', v_setor_nao_definido AND v_tem_regra_setor,
      'em_folga', 0,
      'reserva', 0,
      'reserva_ativa', v_reserva_ativa,
      'disponivel', NULL, 'excedido', false, 'regras', v_regras);
  END IF;

  RETURN jsonb_build_object(
    'limite', (v_pior->>'limite')::int,
    'origem', 'regra_recorrente',
    'regra_id', v_pior->>'regra_id',
    'tipo', v_pior->>'tipo',
    'por_cargo', (v_pior->>'tipo') = 'cargo',
    'por_setor', (v_pior->>'tipo') = 'setor',
    'setor_nao_definido', v_setor_nao_definido,
    'em_folga', (v_pior->>'em_folga')::int,
    'reserva', (v_pior->>'reserva')::int,
    'reserva_ativa', v_reserva_ativa,
    'disponivel', (v_pior->>'disponivel')::int,
    'excedido', (v_pior->>'excedido')::boolean,
    'regras', v_regras);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_folga_limite_dia(uuid, uuid, uuid, date, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folga_limite_dia(uuid, uuid, uuid, date, uuid, uuid) TO authenticated, service_role;