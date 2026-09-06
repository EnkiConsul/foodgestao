-- ============================================================
-- Setor efetivo por dia: escala da data + jornada do dia da semana
-- ============================================================

ALTER TABLE public.dp_escala_itens
  ADD COLUMN IF NOT EXISTS setor_id uuid REFERENCES public.dp_setores(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS setor_motivo text;

ALTER TABLE public.dp_colaborador_config_dias
  ADD COLUMN IF NOT EXISTS setor_id uuid REFERENCES public.dp_setores(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS dp_escala_itens_setor_idx
  ON public.dp_escala_itens (setor_id);
CREATE INDEX IF NOT EXISTS dp_colaborador_config_dias_setor_idx
  ON public.dp_colaborador_config_dias (setor_id);
CREATE INDEX IF NOT EXISTS dp_folga_limite_regra_setores_regra_setor_idx
  ON public.dp_folga_limite_regra_setores (regra_id, setor_id);

-- ------------------------------------------------------------
-- Integridade (fail closed): setor da mesma empresa e da unidade efetiva
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_escala_item_validar_setor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setor_company uuid;
  v_setor_unidade uuid;
  v_unidade uuid;
BEGIN
  IF NEW.setor_id IS NULL THEN
    NEW.setor_motivo := NULLIF(btrim(coalesce(NEW.setor_motivo, '')), '');
    RETURN NEW;
  END IF;

  SELECT s.company_id, s.unidade_id INTO v_setor_company, v_setor_unidade
    FROM public.dp_setores s WHERE s.id = NEW.setor_id;

  IF v_setor_company IS NULL THEN
    RAISE EXCEPTION 'SETOR_INEXISTENTE: setor não encontrado.' USING ERRCODE = 'check_violation';
  END IF;

  IF v_setor_company <> NEW.company_id THEN
    RAISE EXCEPTION 'SETOR_EMPRESA_INVALIDA: o setor pertence a outra empresa.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(e.unidade_id, c.unidade_id) INTO v_unidade
    FROM public.dp_escalas e
    LEFT JOIN public.dp_colaboradores c ON c.id = NEW.colaborador_id
   WHERE e.id = NEW.escala_id;

  IF v_unidade IS NULL OR v_setor_unidade <> v_unidade THEN
    RAISE EXCEPTION 'SETOR_UNIDADE_INVALIDA: o setor pertence a outra unidade.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dp_escala_item_validar_setor_trg ON public.dp_escala_itens;
CREATE TRIGGER dp_escala_item_validar_setor_trg
  BEFORE INSERT OR UPDATE OF setor_id, setor_motivo, escala_id, colaborador_id, company_id
  ON public.dp_escala_itens
  FOR EACH ROW EXECUTE FUNCTION public.dp_escala_item_validar_setor();

CREATE OR REPLACE FUNCTION public.dp_config_dia_validar_setor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setor_company uuid;
  v_setor_unidade uuid;
  v_unidade uuid;
BEGIN
  IF NEW.setor_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.company_id, s.unidade_id INTO v_setor_company, v_setor_unidade
    FROM public.dp_setores s WHERE s.id = NEW.setor_id;

  IF v_setor_company IS NULL THEN
    RAISE EXCEPTION 'SETOR_INEXISTENTE: setor não encontrado.' USING ERRCODE = 'check_violation';
  END IF;

  IF v_setor_company <> NEW.company_id THEN
    RAISE EXCEPTION 'SETOR_EMPRESA_INVALIDA: o setor pertence a outra empresa.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(ct.unidade_id, c.unidade_id) INTO v_unidade
    FROM public.dp_colaborador_config_trabalho ct
    LEFT JOIN public.dp_colaboradores c ON c.id = ct.colaborador_id
   WHERE ct.id = NEW.config_id;

  IF v_unidade IS NULL OR v_setor_unidade <> v_unidade THEN
    RAISE EXCEPTION 'SETOR_UNIDADE_INVALIDA: o setor pertence a outra unidade.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dp_config_dia_validar_setor_trg ON public.dp_colaborador_config_dias;
CREATE TRIGGER dp_config_dia_validar_setor_trg
  BEFORE INSERT OR UPDATE OF setor_id, config_id, company_id
  ON public.dp_colaborador_config_dias
  FOR EACH ROW EXECUTE FUNCTION public.dp_config_dia_validar_setor();

-- ------------------------------------------------------------
-- Setor previsto de uma pessoa numa data
-- Precedência: escala publicada -> jornada do dia -> cadastro
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_setor_previsto(
  p_colaborador_id uuid,
  p_data date
)
RETURNS TABLE (
  setor_id uuid,
  setor_nome text,
  origem text,
  unidade_id uuid,
  referencia_id uuid,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_unidade_cad uuid;
  v_setor_cad uuid;
  v_unidade uuid;
  v_setor uuid;
  v_origem text := 'nenhum';
  v_ref uuid;
  v_wd int;
BEGIN
  IF p_colaborador_id IS NULL OR p_data IS NULL THEN
    RETURN;
  END IF;

  SELECT c.company_id, c.unidade_id, c.setor_id
    INTO v_company, v_unidade_cad, v_setor_cad
    FROM public.dp_colaboradores c WHERE c.id = p_colaborador_id;

  IF v_company IS NULL THEN
    RETURN;
  END IF;

  v_unidade := v_unidade_cad;
  v_wd := EXTRACT(DOW FROM p_data)::int;

  -- 1) escala publicada da data
  SELECT i.setor_id, i.id, coalesce(e.unidade_id, v_unidade_cad)
    INTO v_setor, v_ref, v_unidade
    FROM public.dp_escala_itens i
    JOIN public.dp_escalas e ON e.id = i.escala_id
   WHERE i.colaborador_id = p_colaborador_id
     AND i.data = p_data
     AND e.status = 'publicada'
   ORDER BY i.updated_at DESC
   LIMIT 1;

  IF v_setor IS NOT NULL THEN
    RETURN QUERY
      SELECT v_setor, s.nome, 'escala'::text, v_unidade, v_ref, 'ok'::text
        FROM public.dp_setores s WHERE s.id = v_setor;
    RETURN;
  END IF;

  v_unidade := coalesce(v_unidade, v_unidade_cad);

  -- 2) jornada do dia da semana (configuração vigente)
  SELECT cd.setor_id, cd.id, coalesce(ct.unidade_id, v_unidade)
    INTO v_setor, v_ref, v_unidade
    FROM public.dp_colaborador_config_trabalho ct
    JOIN public.dp_colaborador_config_dias cd
      ON cd.config_id = ct.id AND cd.dow = v_wd
   WHERE ct.colaborador_id = p_colaborador_id
     AND ct.vigencia_inicio <= p_data
     AND (ct.vigencia_fim IS NULL OR ct.vigencia_fim >= p_data)
   ORDER BY ct.vigencia_inicio DESC
   LIMIT 1;

  IF v_setor IS NOT NULL THEN
    RETURN QUERY
      SELECT v_setor, s.nome, 'config_dia'::text, v_unidade, v_ref, 'ok'::text
        FROM public.dp_setores s WHERE s.id = v_setor;
    RETURN;
  END IF;

  v_unidade := coalesce(v_unidade, v_unidade_cad);

  -- 3) setor habitual do cadastro
  IF v_setor_cad IS NOT NULL THEN
    RETURN QUERY
      SELECT v_setor_cad, s.nome, 'cadastro'::text, v_unidade, p_colaborador_id, 'ok'::text
        FROM public.dp_setores s WHERE s.id = v_setor_cad;
    RETURN;
  END IF;

  RETURN QUERY SELECT NULL::uuid, NULL::text, 'nenhum'::text, v_unidade, NULL::uuid, 'nao_definido'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_setor_previsto(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_setor_previsto(uuid, date) TO authenticated, service_role;

-- Atalho escalar para uso interno em consultas
CREATE OR REPLACE FUNCTION public.dp_setor_previsto_id(
  p_colaborador_id uuid,
  p_data date
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sp.setor_id FROM public.dp_setor_previsto(p_colaborador_id, p_data) sp LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.dp_setor_previsto_id(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_setor_previsto_id(uuid, date) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Resolução em lote (evita N+1 no panorama)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_setor_previsto_periodo(
  p_unidade_id uuid,
  p_inicio date,
  p_fim date
)
RETURNS TABLE (
  colaborador_id uuid,
  data date,
  setor_id uuid,
  setor_nome text,
  origem text,
  unidade_id uuid,
  referencia_id uuid,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
BEGIN
  IF p_unidade_id IS NULL OR p_inicio IS NULL OR p_fim IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe unidade e período.' USING ERRCODE = '22023';
  END IF;
  IF p_fim < p_inicio OR p_fim - p_inicio > 400 THEN
    RAISE EXCEPTION 'INVALID_INPUT: período inválido.' USING ERRCODE = '22023';
  END IF;

  SELECT u.company_id INTO v_company FROM public.dp_unidades u WHERE u.id = p_unidade_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: unidade inexistente.' USING ERRCODE = '23503';
  END IF;
  IF v_uid IS NULL OR NOT private.is_company_member(v_uid, v_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: unidade fora do seu escopo.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT c.id, d::date, sp.setor_id, sp.setor_nome, sp.origem,
           coalesce(sp.unidade_id, c.unidade_id), sp.referencia_id, sp.status
      FROM public.dp_colaboradores c
      JOIN LATERAL generate_series(p_inicio, p_fim, interval '1 day') d ON true
      LEFT JOIN LATERAL public.dp_setor_previsto(c.id, d::date) sp ON true
     WHERE c.company_id = v_company
       AND c.deleted_at IS NULL
       AND c.unidade_id = p_unidade_id;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_setor_previsto_periodo(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_setor_previsto_periodo(uuid, date, date) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Alterar o setor apenas de uma data
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_escala_definir_setor_dia(
  p_colaborador_id uuid,
  p_data date,
  p_acao text,
  p_setor_id uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_unidade_cad uuid;
  v_cargo uuid;
  v_acao text := upper(coalesce(p_acao, ''));
  v_motivo text := NULLIF(btrim(coalesce(p_motivo, '')), '');
  v_ant record;
  v_escala_id uuid;
  v_unidade uuid;
  v_item_id uuid;
  v_competencia date := date_trunc('month', p_data)::date;
  v_setor_company uuid;
  v_setor_unidade uuid;
  v_setor_ativo boolean;
  v_cfg record;
  v_novo record;
  v_limite_antes jsonb;
  v_limite_depois jsonb;
  v_tem_folga boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_colaborador_id IS NULL OR p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe colaborador e data.' USING ERRCODE = '22023';
  END IF;
  IF v_acao NOT IN ('USAR_PADRAO', 'DEFINIR_SETOR') THEN
    RAISE EXCEPTION 'INVALID_INPUT: ação inválida.' USING ERRCODE = '22023';
  END IF;
  IF v_acao = 'DEFINIR_SETOR' AND p_setor_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe o setor.' USING ERRCODE = '22023';
  END IF;

  SELECT c.company_id, c.unidade_id, c.cargo_id
    INTO v_company, v_unidade_cad, v_cargo
    FROM public.dp_colaboradores c
   WHERE c.id = p_colaborador_id AND c.deleted_at IS NULL;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: colaborador inexistente.' USING ERRCODE = '23503';
  END IF;

  IF NOT private.is_company_admin_or_owner(v_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: apenas responsáveis da empresa podem alterar o setor do dia.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_colaborador_id::text || '|setor_dia|' || p_data::text, 0));

  SELECT * INTO v_ant FROM public.dp_setor_previsto(p_colaborador_id, p_data);

  -- Escala/item da data (qualquer status; a data é o que importa aqui)
  SELECT i.id, i.escala_id, coalesce(e.unidade_id, v_unidade_cad)
    INTO v_item_id, v_escala_id, v_unidade
    FROM public.dp_escala_itens i
    JOIN public.dp_escalas e ON e.id = i.escala_id
   WHERE i.colaborador_id = p_colaborador_id AND i.data = p_data
   ORDER BY (e.status = 'publicada') DESC, i.updated_at DESC
   LIMIT 1;

  v_unidade := coalesce(v_unidade, v_unidade_cad);

  IF v_acao = 'DEFINIR_SETOR' THEN
    SELECT s.company_id, s.unidade_id, s.ativo
      INTO v_setor_company, v_setor_unidade, v_setor_ativo
      FROM public.dp_setores s WHERE s.id = p_setor_id;

    IF v_setor_company IS NULL THEN
      RAISE EXCEPTION 'SETOR_INEXISTENTE: setor não encontrado.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_setor_company <> v_company THEN
      RAISE EXCEPTION 'SETOR_EMPRESA_INVALIDA: o setor pertence a outra empresa.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_unidade IS NULL OR v_setor_unidade <> v_unidade THEN
      RAISE EXCEPTION 'SETOR_UNIDADE_INVALIDA: o setor não pertence à unidade em que este colaborador trabalha nesta data.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_setor_ativo IS NOT TRUE THEN
      RAISE EXCEPTION 'SETOR_INATIVO: este setor está inativo e não pode ser usado em novos ajustes.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_limite_antes := public.dp_folga_limite_dia(
    v_company, v_unidade, v_cargo, p_data, NULL, v_ant.setor_id);

  IF v_item_id IS NULL THEN
    IF v_acao = 'USAR_PADRAO' THEN
      -- nada explícito na data: já está no padrão
      RETURN jsonb_build_object(
        'ok', true, 'acao', v_acao, 'item_id', NULL,
        'setor_anterior', v_ant.setor_id, 'origem_anterior', v_ant.origem,
        'setor', NULL, 'origem', v_ant.origem, 'impactos', '[]'::jsonb);
    END IF;

    -- materializa apenas o item necessário, preservando a jornada efetiva
    SELECT cd.entrada, cd.saida, cd.intervalo_minutos, cd.turno_id, cd.trabalha
      INTO v_cfg
      FROM public.dp_colaborador_config_trabalho ct
      JOIN public.dp_colaborador_config_dias cd
        ON cd.config_id = ct.id AND cd.dow = EXTRACT(DOW FROM p_data)::int
     WHERE ct.colaborador_id = p_colaborador_id
       AND ct.vigencia_inicio <= p_data
       AND (ct.vigencia_fim IS NULL OR ct.vigencia_fim >= p_data)
     ORDER BY ct.vigencia_inicio DESC
     LIMIT 1;

    SELECT e.id INTO v_escala_id
      FROM public.dp_escalas e
     WHERE e.company_id = v_company
       AND e.competencia = v_competencia
       AND coalesce(e.unidade_id, '00000000-0000-0000-0000-000000000000'::uuid)
           = coalesce(v_unidade, '00000000-0000-0000-0000-000000000000'::uuid)
     LIMIT 1;

    IF v_escala_id IS NULL THEN
      INSERT INTO public.dp_escalas(company_id, unidade_id, competencia, status, created_by)
      VALUES (v_company, v_unidade, v_competencia, 'publicada', v_uid)
      RETURNING id INTO v_escala_id;
    END IF;

    INSERT INTO public.dp_escala_itens(
      company_id, escala_id, colaborador_id, data, tipo, origem,
      entrada, saida, intervalo_minutos, turno_id, carga_prevista_horas,
      setor_id, setor_motivo)
    VALUES (
      v_company, v_escala_id, p_colaborador_id, p_data,
      CASE WHEN coalesce(v_cfg.trabalha, true) THEN 'trabalho' ELSE 'folga' END::public.dp_escala_item_tipo,
      'manual',
      v_cfg.entrada, v_cfg.saida, coalesce(v_cfg.intervalo_minutos, 0), v_cfg.turno_id,
      coalesce(public.dp_calc_carga_dia(v_cfg.entrada, v_cfg.saida,
        coalesce(v_cfg.intervalo_minutos, 0), false), 0),
      p_setor_id, v_motivo)
    RETURNING id INTO v_item_id;
  ELSE
    UPDATE public.dp_escala_itens i
       SET setor_id = CASE WHEN v_acao = 'USAR_PADRAO' THEN NULL ELSE p_setor_id END,
           setor_motivo = CASE WHEN v_acao = 'USAR_PADRAO' THEN NULL ELSE v_motivo END,
           updated_at = now()
     WHERE i.id = v_item_id;
  END IF;

  SELECT * INTO v_novo FROM public.dp_setor_previsto(p_colaborador_id, p_data);

  v_limite_depois := public.dp_folga_limite_dia(
    v_company, v_unidade, v_cargo, p_data, NULL, v_novo.setor_id);

  SELECT EXISTS (
    SELECT 1 FROM public.dp_folgas f
     WHERE f.colaborador_id = p_colaborador_id AND f.data = p_data
       AND f.status <> 'cancelada' AND f.extra = false
       AND f.tipo NOT IN ('ferias', 'licenca')
  ) INTO v_tem_folga;

  PERFORM public.insert_audit_log(
    'dp_setor_dia_alterado', 'dp_escala_itens', coalesce(v_item_id::text, p_colaborador_id::text),
    jsonb_build_object(
      'company_id', v_company, 'colaborador_id', p_colaborador_id, 'data', p_data,
      'unidade_id', v_unidade, 'acao', v_acao, 'motivo', v_motivo,
      'setor_anterior', v_ant.setor_id, 'origem_anterior', v_ant.origem,
      'setor_novo', v_novo.setor_id, 'origem_nova', v_novo.origem,
      'em_folga', v_tem_folga,
      'limite_antes', v_limite_antes, 'limite_depois', v_limite_depois));

  RETURN jsonb_build_object(
    'ok', true,
    'acao', v_acao,
    'item_id', v_item_id,
    'unidade_id', v_unidade,
    'setor_anterior', v_ant.setor_id,
    'setor_anterior_nome', v_ant.setor_nome,
    'origem_anterior', v_ant.origem,
    'setor', v_novo.setor_id,
    'setor_nome', v_novo.setor_nome,
    'origem', v_novo.origem,
    'status', v_novo.status,
    'em_folga', v_tem_folga,
    'limite_antes', v_limite_antes,
    'limite_depois', v_limite_depois);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_escala_definir_setor_dia(uuid, date, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_escala_definir_setor_dia(uuid, date, text, uuid, text)
  TO authenticated, service_role;

-- ------------------------------------------------------------
-- Limite de folga: setor EFETIVO da data + todas as regras aplicáveis
-- ------------------------------------------------------------
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

  -- Exceção manual da data prevalece
  SELECT dc.limite_folgas INTO v_limite
    FROM public.dp_dia_config dc
   WHERE dc.company_id = p_company
     AND dc.data = p_data
     AND (dc.unidade_id IS NULL OR dc.unidade_id = p_unidade)
   ORDER BY (dc.unidade_id IS NOT NULL) DESC
   LIMIT 1;

  IF v_limite IS NOT NULL THEN
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

    RETURN jsonb_build_object(
      'limite', v_limite, 'origem', 'excecao_data', 'regra_id', NULL, 'tipo', NULL,
      'por_cargo', false, 'por_setor', false, 'setor_nao_definido', false,
      'em_folga', coalesce(v_em_folga, 0),
      'disponivel', GREATEST(v_limite - coalesce(v_em_folga, 0), 0),
      'excedido', coalesce(v_em_folga, 0) >= v_limite,
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
        CONTINUE;  -- regra de setor não pode ser presumida
      END IF;
      IF NOT (p_setor = ANY(v_setores)) THEN
        CONTINUE;  -- regra não alcança este colaborador
      END IF;
    END IF;

    -- Ocupação da regra: cota compartilhada pelo grupo de setores
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

    v_regras := v_regras || jsonb_build_object(
      'regra_id', r.id,
      'nome', r.nome,
      'tipo', r.tipo,
      'limite', r.maximo,
      'setores', to_jsonb(v_setores),
      'em_folga', coalesce(v_em_folga, 0),
      'disponivel', GREATEST(r.maximo - coalesce(v_em_folga, 0), 0),
      'excedido', coalesce(v_em_folga, 0) >= r.maximo);
  END LOOP;

  -- Regra mais restritiva: prioriza saturadas, depois menor disponibilidade
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
      'em_folga', 0, 'disponivel', NULL, 'excedido', false, 'regras', v_regras);
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
    'disponivel', (v_pior->>'disponivel')::int,
    'excedido', (v_pior->>'excedido')::boolean,
    'regras', v_regras);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_folga_limite_dia(uuid, uuid, uuid, date, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folga_limite_dia(uuid, uuid, uuid, date, uuid, uuid)
  TO authenticated, service_role;

-- ------------------------------------------------------------
-- Chamadores usam o setor EFETIVO da data
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
  v_setor uuid;
  v_res jsonb;
BEGIN
  IF NEW.status = 'cancelada' OR NEW.extra = true
     OR NEW.tipo IN ('ferias', 'licenca')
     OR NEW.origem <> 'solicitacao'::public.dp_folga_origem THEN
    RETURN NEW;
  END IF;

  SELECT unidade_id, cargo_id INTO v_unidade, v_cargo
    FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;

  v_setor := public.dp_setor_previsto_id(NEW.colaborador_id, NEW.data);

  v_res := public.dp_folga_limite_dia(
    NEW.company_id, v_unidade, v_cargo, NEW.data, NEW.colaborador_id, v_setor);

  IF COALESCE((v_res->>'excedido')::boolean, false) THEN
    RAISE EXCEPTION 'FOLGA_LIMITE_DIA: este dia já atingiu o limite de % pessoa(s) em folga.',
      (v_res->>'limite')::int
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
