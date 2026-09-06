-- ============================================================
-- Setores / áreas da unidade
-- ============================================================

-- Normalizador imutável (minúsculas, sem acentos, sem espaços nas pontas)
CREATE OR REPLACE FUNCTION public.dp_nome_normalizado(p_nome text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT translate(
           lower(btrim(coalesce(p_nome, ''))),
           'áàâãäéèêëíìîïóòôõöúùûüçñ',
           'aaaaaeeeeiiiiooooouuuucn')
$$;

CREATE TABLE public.dp_setores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unidade_id uuid NOT NULL REFERENCES public.dp_unidades(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  CONSTRAINT dp_setores_nome_nao_vazio CHECK (btrim(nome) <> '')
);

CREATE UNIQUE INDEX dp_setores_unidade_nome_uniq
  ON public.dp_setores (unidade_id, public.dp_nome_normalizado(nome));
CREATE INDEX dp_setores_company_idx ON public.dp_setores (company_id, ativo);
CREATE INDEX dp_setores_unidade_idx ON public.dp_setores (unidade_id, ativo);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_setores TO authenticated;
GRANT ALL ON public.dp_setores TO service_role;
ALTER TABLE public.dp_setores ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_setores_read_member ON public.dp_setores
  FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));

CREATE POLICY dp_setores_admin_write ON public.dp_setores
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE TRIGGER dp_setores_upd BEFORE UPDATE ON public.dp_setores
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();

-- A unidade tem de ser da mesma empresa do setor
CREATE OR REPLACE FUNCTION public.dp_setores_validar_unidade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.dp_unidades u
     WHERE u.id = NEW.unidade_id AND u.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'SETOR_UNIDADE_INVALIDA: a unidade informada não pertence a esta empresa.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER dp_setores_validar_unidade_trg
  BEFORE INSERT OR UPDATE OF company_id, unidade_id ON public.dp_setores
  FOR EACH ROW EXECUTE FUNCTION public.dp_setores_validar_unidade();

-- ------------------------------------------------------------
-- Setor no colaborador (opcional)
-- ------------------------------------------------------------
ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS setor_id uuid REFERENCES public.dp_setores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS dp_colaboradores_setor_idx
  ON public.dp_colaboradores (setor_id);

CREATE OR REPLACE FUNCTION public.dp_colaborador_validar_setor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_unidade uuid;
BEGIN
  IF NEW.setor_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.company_id, s.unidade_id INTO v_company, v_unidade
    FROM public.dp_setores s WHERE s.id = NEW.setor_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'SETOR_INEXISTENTE: setor não encontrado.' USING ERRCODE = 'check_violation';
  END IF;

  IF v_company <> NEW.company_id THEN
    RAISE EXCEPTION 'SETOR_EMPRESA_INVALIDA: o setor pertence a outra empresa.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.unidade_id IS NULL OR v_unidade <> NEW.unidade_id THEN
    RAISE EXCEPTION 'SETOR_UNIDADE_INVALIDA: o setor pertence a outra unidade.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER dp_colaborador_validar_setor_trg
  BEFORE INSERT OR UPDATE OF setor_id, unidade_id, company_id ON public.dp_colaboradores
  FOR EACH ROW EXECUTE FUNCTION public.dp_colaborador_validar_setor();

-- ------------------------------------------------------------
-- Regras de folga por setor
-- ------------------------------------------------------------
ALTER TABLE public.dp_folga_limite_regras
  DROP CONSTRAINT IF EXISTS dp_folga_limite_regras_tipo_chk;
ALTER TABLE public.dp_folga_limite_regras
  ADD CONSTRAINT dp_folga_limite_regras_tipo_chk
  CHECK (tipo IN ('quantidade', 'cargo', 'colaboradores', 'setor'));

CREATE TABLE public.dp_folga_limite_regra_setores (
  regra_id uuid NOT NULL REFERENCES public.dp_folga_limite_regras(id) ON DELETE CASCADE,
  setor_id uuid NOT NULL REFERENCES public.dp_setores(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (regra_id, setor_id)
);

CREATE INDEX dp_folga_limite_regra_setor_setor_idx
  ON public.dp_folga_limite_regra_setores (setor_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_folga_limite_regra_setores TO authenticated;
GRANT ALL ON public.dp_folga_limite_regra_setores TO service_role;
ALTER TABLE public.dp_folga_limite_regra_setores ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_folga_limite_setor_read ON public.dp_folga_limite_regra_setores
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.dp_folga_limite_regras r
     WHERE r.id = regra_id AND private.is_company_member(auth.uid(), r.company_id)));

CREATE POLICY dp_folga_limite_setor_write ON public.dp_folga_limite_regra_setores
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.dp_folga_limite_regras r
     WHERE r.id = regra_id AND private.is_company_admin_or_owner(auth.uid(), r.company_id)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.dp_folga_limite_regras r
     WHERE r.id = regra_id AND private.is_company_admin_or_owner(auth.uid(), r.company_id)));

-- Setor da regra tem de ser da mesma empresa/unidade da regra e não pode
-- participar de duas regras específicas do mesmo dia/unidade
CREATE OR REPLACE FUNCTION public.dp_folga_limite_setor_validar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_unidade uuid;
  v_dia smallint;
  v_setor_company uuid;
  v_setor_unidade uuid;
  v_setor_nome text;
BEGIN
  SELECT r.company_id, r.unidade_id, r.dia_semana
    INTO v_company, v_unidade, v_dia
    FROM public.dp_folga_limite_regras r WHERE r.id = NEW.regra_id;

  SELECT s.company_id, s.unidade_id, s.nome
    INTO v_setor_company, v_setor_unidade, v_setor_nome
    FROM public.dp_setores s WHERE s.id = NEW.setor_id;

  IF v_setor_company IS NULL OR v_setor_company <> v_company THEN
    RAISE EXCEPTION 'SETOR_EMPRESA_INVALIDA: o setor pertence a outra empresa.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_unidade IS NOT NULL AND v_setor_unidade <> v_unidade THEN
    RAISE EXCEPTION 'SETOR_UNIDADE_INVALIDA: o setor pertence a outra unidade.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.dp_folga_limite_regra_setores rs
      JOIN public.dp_folga_limite_regras r ON r.id = rs.regra_id
     WHERE rs.setor_id = NEW.setor_id
       AND rs.regra_id <> NEW.regra_id
       AND r.ativo = true
       AND r.company_id = v_company
       AND r.tipo = 'setor'
       AND coalesce(r.unidade_id::text, '') = coalesce(v_unidade::text, '')
       AND coalesce(r.dia_semana, -1) = coalesce(v_dia, -1)
  ) THEN
    RAISE EXCEPTION 'SETOR_LIMITE_DUPLICADO: o setor % já participa de outro limite específico para este dia.', v_setor_nome
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER dp_folga_limite_setor_validar_trg
  BEFORE INSERT OR UPDATE ON public.dp_folga_limite_regra_setores
  FOR EACH ROW EXECUTE FUNCTION public.dp_folga_limite_setor_validar();

-- ------------------------------------------------------------
-- Limite do dia considera setor
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
  v_regra_id uuid;
  v_tipo text;
  v_por_cargo boolean := false;
  v_por_setor boolean := false;
  v_setores uuid[] := ARRAY[]::uuid[];
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
    SELECT r.maximo, r.id, r.tipo
      INTO v_limite, v_regra_id, v_tipo
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
       AND (
         r.tipo <> 'setor'
         OR (p_setor IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.dp_folga_limite_regra_setores rs
               WHERE rs.regra_id = r.id AND rs.setor_id = p_setor))
       )
     ORDER BY (r.unidade_id IS NOT NULL) DESC,
              (r.tipo IN ('cargo', 'setor')) DESC,
              (r.dia_semana IS NOT NULL) DESC,
              r.vigencia_inicio DESC NULLS LAST
     LIMIT 1;

    IF v_limite IS NOT NULL THEN
      v_origem := 'regra_recorrente';
      v_por_cargo := v_tipo = 'cargo'
        AND EXISTS (SELECT 1 FROM public.dp_folga_limite_regra_cargos rc WHERE rc.regra_id = v_regra_id);
      v_por_setor := v_tipo = 'setor';
      IF v_por_setor THEN
        SELECT coalesce(array_agg(rs.setor_id), ARRAY[]::uuid[]) INTO v_setores
          FROM public.dp_folga_limite_regra_setores rs WHERE rs.regra_id = v_regra_id;
      END IF;
    END IF;
  END IF;

  SELECT count(*) INTO v_em_folga
    FROM public.dp_colaboradores c
   WHERE c.company_id = p_company
     AND c.deleted_at IS NULL
     AND (p_unidade IS NULL OR c.unidade_id = p_unidade)
     AND (NOT v_por_cargo OR p_cargo IS NULL OR c.cargo_id = p_cargo)
     AND (NOT v_por_setor OR c.setor_id = ANY(v_setores))
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
    'tipo', v_tipo,
    'por_cargo', v_por_cargo,
    'por_setor', v_por_setor,
    'em_folga', COALESCE(v_em_folga, 0),
    'disponivel', CASE WHEN v_limite IS NULL THEN NULL
                       ELSE GREATEST(v_limite - COALESCE(v_em_folga, 0), 0) END,
    'excedido', CASE WHEN v_limite IS NULL THEN false
                     ELSE COALESCE(v_em_folga, 0) >= v_limite END);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_folga_limite_dia(uuid, uuid, uuid, date, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folga_limite_dia(uuid, uuid, uuid, date, uuid, uuid)
  TO authenticated, service_role;

-- ------------------------------------------------------------
-- Chamadores passam a informar o setor do colaborador
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

  SELECT unidade_id, cargo_id, setor_id INTO v_unidade, v_cargo, v_setor
    FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;

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
  v_setor uuid;
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

  SELECT company_id, unidade_id, cargo_id, setor_id
    INTO v_company, v_unidade, v_cargo, v_setor
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
    v_company, v_unidade, v_cargo, p_data, p_colaborador_id, v_setor);

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

  PERFORM public.insert_audit_log(
    'folga_criada_admin', 'dp_folgas', v_id::text,
    jsonb_build_object('company_id', v_company, 'unidade_id', v_unidade,
                       'cargo_id', v_cargo, 'setor_id', v_setor,
                       'data', p_data, 'limite', v_res));

  RETURN jsonb_build_object(
    'ok', true, 'folga_id', v_id, 'canceladas', v_canceladas, 'limite', v_res);
END;
$$;

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
  v_setor uuid;
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

  SELECT c.company_id, c.unidade_id, c.cargo_id, c.setor_id
    INTO v_company, v_unidade, v_cargo, v_setor
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

  v_res := public.dp_folga_limite_dia(v_company, v_unidade, v_cargo, p_data, v_colab, v_setor);

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