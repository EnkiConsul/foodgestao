-- ============================================================
-- Limites de quantidade de folgas por dia e cargo
-- ============================================================

CREATE TABLE public.dp_folga_limite_regras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE CASCADE,
  dia_semana smallint,
  maximo integer NOT NULL DEFAULT 1,
  vigencia_inicio date,
  vigencia_fim date,
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_folga_limite_dow CHECK (dia_semana IS NULL OR dia_semana BETWEEN 0 AND 6),
  CONSTRAINT dp_folga_limite_maximo CHECK (maximo >= 0)
);

CREATE INDEX idx_dp_folga_limite_company
  ON public.dp_folga_limite_regras (company_id, unidade_id, dia_semana);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_folga_limite_regras TO authenticated;
GRANT ALL ON public.dp_folga_limite_regras TO service_role;
ALTER TABLE public.dp_folga_limite_regras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_folga_limite_admin_write" ON public.dp_folga_limite_regras
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY "dp_folga_limite_read_member" ON public.dp_folga_limite_regras
  FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));

CREATE TRIGGER dp_folga_limite_upd BEFORE UPDATE ON public.dp_folga_limite_regras
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();

CREATE TABLE public.dp_folga_limite_regra_cargos (
  regra_id uuid NOT NULL REFERENCES public.dp_folga_limite_regras(id) ON DELETE CASCADE,
  cargo_id uuid NOT NULL REFERENCES public.dp_cargos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (regra_id, cargo_id)
);

CREATE INDEX idx_dp_folga_limite_cargo ON public.dp_folga_limite_regra_cargos (cargo_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_folga_limite_regra_cargos TO authenticated;
GRANT ALL ON public.dp_folga_limite_regra_cargos TO service_role;
ALTER TABLE public.dp_folga_limite_regra_cargos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_folga_limite_cargo_admin_write" ON public.dp_folga_limite_regra_cargos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.dp_folga_limite_regras r
                  WHERE r.id = regra_id
                    AND private.is_company_admin_or_owner(auth.uid(), r.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.dp_folga_limite_regras r
                       WHERE r.id = regra_id
                         AND private.is_company_admin_or_owner(auth.uid(), r.company_id)));

CREATE POLICY "dp_folga_limite_cargo_read_member" ON public.dp_folga_limite_regra_cargos
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.dp_folga_limite_regras r
                  WHERE r.id = regra_id
                    AND private.is_company_member(auth.uid(), r.company_id)));

-- ------------------------------------------------------------
-- Limite efetivo de pessoas em folga no dia
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_folga_limite_dia(
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
  v_wd int;
  v_limite int;
  v_origem text := 'sem_limite';
  v_regra_id uuid;
  v_por_cargo boolean := false;
  v_em_folga int := 0;
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

  -- 1) Exceção pontual por data (dp_dia_config): unidade específica vence a geral
  SELECT dc.limite_folgas INTO v_limite
    FROM public.dp_dia_config dc
   WHERE dc.company_id = p_company
     AND dc.data = p_data
     AND (dc.unidade_id IS NULL OR dc.unidade_id = p_unidade)
   ORDER BY (dc.unidade_id IS NOT NULL) DESC
   LIMIT 1;

  IF v_limite IS NOT NULL THEN
    v_origem := 'excecao_data';
  ELSE
    -- 2) Regra recorrente mais específica
    SELECT r.maximo, r.id,
           EXISTS (SELECT 1 FROM public.dp_folga_limite_regra_cargos rc WHERE rc.regra_id = r.id)
      INTO v_limite, v_regra_id, v_por_cargo
      FROM public.dp_folga_limite_regras r
     WHERE r.company_id = p_company
       AND r.ativo = true
       AND (r.unidade_id IS NULL OR r.unidade_id = p_unidade)
       AND (r.dia_semana IS NULL OR r.dia_semana = v_wd)
       AND (r.vigencia_inicio IS NULL OR r.vigencia_inicio <= p_data)
       AND (r.vigencia_fim IS NULL OR r.vigencia_fim >= p_data)
       AND (
         NOT EXISTS (SELECT 1 FROM public.dp_folga_limite_regra_cargos rc WHERE rc.regra_id = r.id)
         OR (p_cargo IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.dp_folga_limite_regra_cargos rc
               WHERE rc.regra_id = r.id AND rc.cargo_id = p_cargo))
       )
     ORDER BY (r.unidade_id IS NOT NULL) DESC,
              (EXISTS (SELECT 1 FROM public.dp_folga_limite_regra_cargos rc WHERE rc.regra_id = r.id)) DESC,
              (r.dia_semana IS NOT NULL) DESC,
              r.vigencia_inicio DESC NULLS LAST
     LIMIT 1;

    IF v_limite IS NOT NULL THEN
      v_origem := 'regra_recorrente';
    END IF;
  END IF;

  -- Contagem de pessoas já em folga no dia, no mesmo escopo
  SELECT count(*) INTO v_em_folga
    FROM public.dp_colaboradores c
   WHERE c.company_id = p_company
     AND c.deleted_at IS NULL
     AND (p_unidade IS NULL OR c.unidade_id = p_unidade)
     AND (NOT v_por_cargo OR p_cargo IS NULL OR c.cargo_id = p_cargo)
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
    'limite', v_limite,
    'origem', v_origem,
    'regra_id', v_regra_id,
    'por_cargo', v_por_cargo,
    'em_folga', COALESCE(v_em_folga, 0),
    'disponivel', CASE WHEN v_limite IS NULL THEN NULL
                       ELSE GREATEST(v_limite - COALESCE(v_em_folga, 0), 0) END,
    'excedido', CASE WHEN v_limite IS NULL THEN false
                     ELSE COALESCE(v_em_folga, 0) >= v_limite END);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_folga_limite_dia(uuid, uuid, uuid, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folga_limite_dia(uuid, uuid, uuid, date, uuid)
  TO authenticated, service_role;

-- ------------------------------------------------------------
-- Trigger de autoatendimento: valida limite, não cobertura mínima
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

  v_res := public.dp_folga_limite_dia(
    NEW.company_id, v_unidade, v_cargo, NEW.data, NEW.colaborador_id);

  IF COALESCE((v_res->>'excedido')::boolean, false) THEN
    RAISE EXCEPTION 'FOLGA_LIMITE_DIA: este dia já atingiu o limite de % pessoa(s) em folga.',
      (v_res->>'limite')::int
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- RPC administrativa passa a validar apenas o limite de folgas
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_folga_criar_admin(
  p_colaborador_id uuid,
  p_data date,
  p_tipo text DEFAULT 'normal',
  p_extra boolean DEFAULT false,
  p_observacao text DEFAULT NULL,
  p_confirmar_deficit boolean DEFAULT false,
  p_substituir_ids uuid[] DEFAULT NULL
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
  v_canceladas int := 0;
  r record;
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

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_colaborador_id::text || '|folga|' || p_data::text, 0));

  v_res := public.dp_folga_limite_dia(
    v_company, v_unidade, v_cargo, p_data, p_colaborador_id);

  IF COALESCE((v_res->>'excedido')::boolean, false)
     AND COALESCE(p_extra, false) = false
     AND p_tipo NOT IN ('ferias', 'licenca') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'limite_atingido', true,
      'limite', v_res,
      'mensagem', format(
        'Este dia já atingiu o limite de %s pessoa(s) em folga.', (v_res->>'limite')::int));
  END IF;

  -- substituição atômica: cancela (sem apagar) somente na mesma transação da criação
  IF p_substituir_ids IS NOT NULL AND array_length(p_substituir_ids, 1) > 0 THEN
    FOR r IN
      UPDATE public.dp_folgas f
         SET status = 'cancelada',
             observacao = btrim(concat_ws(' | ', NULLIF(f.observacao, ''),
               'Substituída por folga de ' || to_char(p_data, 'DD/MM/YYYY'))),
             updated_at = now()
       WHERE f.id = ANY(p_substituir_ids)
         AND f.company_id = v_company
         AND f.colaborador_id = p_colaborador_id
         AND f.status <> 'cancelada'
      RETURNING f.id, f.data
    LOOP
      v_canceladas := v_canceladas + 1;
      PERFORM public.insert_audit_log(
        'folga_cancelada_substituicao', 'dp_folgas', r.id::text,
        jsonb_build_object('company_id', v_company, 'colaborador_id', p_colaborador_id,
                           'data_cancelada', r.data, 'data_nova', p_data));
    END LOOP;
  END IF;

  INSERT INTO public.dp_folgas(
    company_id, colaborador_id, data, tipo, origem, status, extra, observacao, criado_por)
  VALUES (v_company, p_colaborador_id, p_data, p_tipo::public.dp_folga_tipo,
          'admin_manual', 'agendada', COALESCE(p_extra, false),
          NULLIF(btrim(COALESCE(p_observacao, '')), ''), v_uid)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true, 'folga_id', v_id, 'canceladas', v_canceladas, 'limite', v_res);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_folga_criar_admin(uuid, date, text, boolean, text, boolean, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folga_criar_admin(uuid, date, text, boolean, text, boolean, uuid[])
  TO authenticated, service_role;

-- ------------------------------------------------------------
-- Solicitação pelo portal valida apenas o limite de folgas
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_folga_solicitar(
  p_data date,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_colab uuid;
  v_company uuid;
  v_unidade uuid;
  v_cargo uuid;
  v_res jsonb;
  v_id uuid;
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
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

  SELECT c.company_id, c.unidade_id, c.cargo_id
    INTO v_company, v_unidade, v_cargo
    FROM public.dp_colaboradores c WHERE c.id = v_colab;

  IF p_data < CURRENT_DATE THEN
    RAISE EXCEPTION 'PAST_DATE_NOT_EDITABLE: datas passadas não podem ser solicitadas.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_colab::text || '|solic_folga|' || p_data::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.dp_solicitacoes s
     WHERE s.colaborador_id = v_colab AND s.tipo = 'folga'
       AND s.data_alvo = p_data AND s.status = 'pendente'
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST: já existe uma solicitação pendente para este dia.'
      USING ERRCODE = '22023';
  END IF;

  v_res := public.dp_folga_limite_dia(v_company, v_unidade, v_cargo, p_data, v_colab);

  IF COALESCE((v_res->>'excedido')::boolean, false) THEN
    RAISE EXCEPTION 'FOLGA_LIMITE_DIA: este dia já atingiu o limite de pessoas em folga.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.dp_solicitacoes(
    company_id, colaborador_id, criado_por, tipo, data_alvo, motivo, status)
  VALUES (v_company, v_colab, v_uid, 'folga', p_data, v_motivo, 'pendente')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'solicitacao_id', v_id, 'limite', v_res);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_folga_solicitar(date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folga_solicitar(date, text)
  TO authenticated, service_role;