-- ============================================================
-- M24 — Capacidade habitual x cobertura mínima nas Folgas
-- Única fonte de mínimo: dp_cobertura_minima
-- ============================================================

CREATE OR REPLACE FUNCTION public.dp_capacidade_habitual_dia_cargo(
  p_company uuid,
  p_unidade uuid,
  p_cargo uuid,
  p_data date,
  p_ignorar_colaborador uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_minimo int;
  v_wd int;
  v_considerar_ind boolean;
  v_base int := 0;
  v_folgas int := 0;
  v_ind int := 0;
  v_cap int := 0;
  v_cap_apos int := 0;
BEGIN
  IF p_company IS NULL OR p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: empresa e data são obrigatórias.' USING ERRCODE = '22023';
  END IF;

  -- fail closed: quando há usuário autenticado ele precisa pertencer à empresa
  IF v_uid IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.company_members m
                      WHERE m.company_id = p_company AND m.user_id = v_uid)
     AND NOT EXISTS (SELECT 1 FROM public.companies c
                      WHERE c.id = p_company AND c.owner_id = v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN: empresa fora do seu escopo.' USING ERRCODE = '42501';
  END IF;

  v_wd := EXTRACT(DOW FROM p_data)::int;

  SELECT cm.minimo INTO v_minimo
    FROM public.dp_cobertura_minima cm
   WHERE cm.company_id = p_company
     AND cm.ativo = true
     AND (cm.unidade_id IS NULL OR cm.unidade_id = p_unidade)
     AND (cm.cargo_id IS NULL OR cm.cargo_id = p_cargo)
     AND (cm.dia_semana IS NULL OR cm.dia_semana = v_wd)
     AND (cm.vigencia_inicio IS NULL OR cm.vigencia_inicio <= p_data)
     AND (cm.vigencia_fim IS NULL OR cm.vigencia_fim >= p_data)
   ORDER BY (cm.unidade_id IS NOT NULL) DESC,
            (cm.cargo_id IS NOT NULL) DESC,
            (cm.dia_semana IS NOT NULL) DESC,
            cm.vigencia_inicio DESC NULLS LAST
   LIMIT 1;

  SELECT COALESCE(considerar_indisponibilidade_cobertura, true)
    INTO v_considerar_ind
    FROM public.dp_config_dp WHERE company_id = p_company;
  v_considerar_ind := COALESCE(v_considerar_ind, true);

  -- equipe habitual da unidade/cargo
  WITH equipe AS (
    SELECT c.id, c.regime
      FROM public.dp_colaboradores c
     WHERE c.company_id = p_company
       AND c.ativo = true
       AND c.deleted_at IS NULL
       AND (p_unidade IS NULL OR c.unidade_id = p_unidade)
       AND (p_cargo IS NULL OR c.cargo_id = p_cargo)
       AND (
         NOT COALESCE(public.dp_regime_convocavel(c.regime), false)
         OR COALESCE((
           SELECT ct.compoe_equipe_habitual
             FROM public.dp_colaborador_config_trabalho ct
            WHERE ct.colaborador_id = c.id
              AND (ct.vigencia_inicio IS NULL OR ct.vigencia_inicio <= p_data)
              AND (ct.vigencia_fim IS NULL OR ct.vigencia_fim >= p_data)
            ORDER BY ct.vigencia_inicio DESC NULLS LAST
            LIMIT 1), true)
       )
  )
  SELECT
    count(*),
    count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.dp_folgas f
       WHERE f.colaborador_id = e.id AND f.data = p_data
         AND f.status <> 'cancelada' AND f.extra = false)),
    count(*) FILTER (WHERE
      v_considerar_ind
      AND COALESCE(public.dp_regime_convocavel(e.regime), false)
      AND EXISTS (
        SELECT 1 FROM public.dp_indisponibilidades i
         WHERE i.colaborador_id = e.id AND i.data = p_data
           AND i.cancelada_em IS NULL))
    INTO v_base, v_folgas, v_ind
    FROM equipe e;

  v_cap := GREATEST(v_base - v_folgas - v_ind, 0);

  v_cap_apos := v_cap;
  IF p_ignorar_colaborador IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.dp_colaboradores c
        WHERE c.id = p_ignorar_colaborador
          AND c.company_id = p_company
          AND c.ativo = true AND c.deleted_at IS NULL
          AND (p_unidade IS NULL OR c.unidade_id = p_unidade)
          AND (p_cargo IS NULL OR c.cargo_id = p_cargo))
     AND NOT EXISTS (
       SELECT 1 FROM public.dp_folgas f
        WHERE f.colaborador_id = p_ignorar_colaborador AND f.data = p_data
          AND f.status <> 'cancelada' AND f.extra = false)
     AND NOT EXISTS (
       SELECT 1 FROM public.dp_indisponibilidades i
        WHERE v_considerar_ind AND i.colaborador_id = p_ignorar_colaborador
          AND i.data = p_data AND i.cancelada_em IS NULL) THEN
    v_cap_apos := GREATEST(v_cap - 1, 0);
  END IF;

  RETURN jsonb_build_object(
    'minimo', v_minimo,
    'capacidade_habitual', v_cap,
    'indisponiveis_habituais', v_ind,
    'folgas', v_folgas,
    'capacidade_apos_acao', v_cap_apos,
    'deficit', CASE WHEN v_minimo IS NULL THEN 0
                    ELSE GREATEST(v_minimo - v_cap_apos, 0) END);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_capacidade_habitual_dia_cargo(uuid, uuid, uuid, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_capacidade_habitual_dia_cargo(uuid, uuid, uuid, date, uuid)
  TO authenticated, service_role;

-- ------------------------------------------------------------
-- Trigger: autoatendimento não pode furar a cobertura mínima
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_folgas_validar_cobertura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unidade uuid;
  v_cargo uuid;
  v_res jsonb;
BEGIN
  IF NEW.status = 'cancelada' OR NEW.extra = true
     OR NEW.tipo IN ('ferias', 'licenca')
     OR NEW.origem <> 'solicitacao'::public.dp_folga_origem THEN
    RETURN NEW;
  END IF;

  SELECT unidade_id, cargo_id INTO v_unidade, v_cargo
    FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;

  v_res := public.dp_capacidade_habitual_dia_cargo(
    NEW.company_id, v_unidade, v_cargo, NEW.data, NEW.colaborador_id);

  IF (v_res->>'minimo') IS NOT NULL AND COALESCE((v_res->>'deficit')::int, 0) > 0 THEN
    RAISE EXCEPTION 'Não é possível liberar esta folga porque a equipe ficaria abaixo da cobertura mínima definida para este dia.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dp_folgas_validar_cobertura ON public.dp_folgas;
CREATE TRIGGER trg_dp_folgas_validar_cobertura
  BEFORE INSERT ON public.dp_folgas
  FOR EACH ROW EXECUTE FUNCTION public.dp_folgas_validar_cobertura();

-- ------------------------------------------------------------
-- RPC administrativa: avalia, exige confirmação e audita override
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_folga_criar_admin(
  p_colaborador_id uuid,
  p_data date,
  p_tipo text DEFAULT 'normal',
  p_extra boolean DEFAULT false,
  p_observacao text DEFAULT NULL,
  p_confirmar_deficit boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_unidade uuid;
  v_cargo uuid;
  v_res jsonb;
  v_id uuid;
  v_deficit int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_colaborador_id IS NULL OR p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe colaborador e data.' USING ERRCODE = '22023';
  END IF;

  SELECT company_id, unidade_id, cargo_id INTO v_company, v_unidade, v_cargo
    FROM public.dp_colaboradores
   WHERE id = p_colaborador_id AND ativo = true AND deleted_at IS NULL;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: colaborador inexistente ou inativo.' USING ERRCODE = '23503';
  END IF;

  IF NOT private.is_company_admin_or_owner(v_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: apenas responsáveis da empresa podem lançar folgas.'
      USING ERRCODE = '42501';
  END IF;

  v_res := public.dp_capacidade_habitual_dia_cargo(
    v_company, v_unidade, v_cargo, p_data, p_colaborador_id);
  v_deficit := COALESCE((v_res->>'deficit')::int, 0);

  IF (v_res->>'minimo') IS NOT NULL AND v_deficit > 0 AND NOT COALESCE(p_confirmar_deficit, false) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'requer_confirmacao', true,
      'cobertura', v_res,
      'mensagem', 'Esta folga deixará a equipe abaixo da cobertura mínima. Deseja continuar mesmo assim?');
  END IF;

  INSERT INTO public.dp_folgas(
    company_id, colaborador_id, data, tipo, origem, status, extra, observacao, criado_por)
  VALUES (v_company, p_colaborador_id, p_data, p_tipo::public.dp_folga_tipo,
          'admin_manual', 'agendada', COALESCE(p_extra, false),
          NULLIF(btrim(COALESCE(p_observacao, '')), ''), v_uid)
  RETURNING id INTO v_id;

  IF (v_res->>'minimo') IS NOT NULL AND v_deficit > 0 THEN
    PERFORM public.insert_audit_log(
      'folga_cobertura_override', 'dp_folgas', v_id::text,
      jsonb_build_object(
        'company_id', v_company, 'unidade_id', v_unidade, 'cargo_id', v_cargo,
        'data', p_data, 'minimo', (v_res->>'minimo')::int,
        'capacidade_prevista', (v_res->>'capacidade_apos_acao')::int,
        'deficit', v_deficit, 'confirmado', true));
  END IF;

  RETURN jsonb_build_object('ok', true, 'folga_id', v_id, 'cobertura', v_res);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_folga_criar_admin(uuid, date, text, boolean, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folga_criar_admin(uuid, date, text, boolean, text, boolean)
  TO authenticated, service_role;