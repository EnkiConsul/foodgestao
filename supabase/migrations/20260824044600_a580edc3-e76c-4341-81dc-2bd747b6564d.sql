-- =====================================================================
-- M14 (Convocações — Bloco 1)
-- Motivo: habilitar modalidade Individual (colaborador-alvo por ocorrência)
--         e fonte autoritativa de diária para Freelancer diarista.
-- Aditiva. Não altera M1–M13.
-- Rollback documentado no fim do arquivo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Coluna colaborador_alvo_id + integridade multiempresa + índice
-- ---------------------------------------------------------------------
ALTER TABLE public.dp_convocacao_ocorrencias
  ADD COLUMN IF NOT EXISTS colaborador_alvo_id uuid;

ALTER TABLE public.dp_convocacao_ocorrencias
  DROP CONSTRAINT IF EXISTS fk_dp_conv_ocor_alvo_company;

ALTER TABLE public.dp_convocacao_ocorrencias
  ADD CONSTRAINT fk_dp_conv_ocor_alvo_company
  FOREIGN KEY (colaborador_alvo_id, company_id)
  REFERENCES public.dp_colaboradores(id, company_id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_dp_conv_ocor_alvo_data
  ON public.dp_convocacao_ocorrencias (company_id, colaborador_alvo_id, data)
  WHERE colaborador_alvo_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2) Integridade Individual/Aberta (não pode ser CHECK: modalidade é do grupo)
--    Validada nos dois lados: na ocorrência e na troca de modalidade do grupo.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_conv_ocor_valida_alvo(
  _modalidade text, _colaborador_alvo_id uuid, _vagas integer
) RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
BEGIN
  IF _modalidade = 'individual' THEN
    IF _colaborador_alvo_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_STATE: convocação individual exige um trabalhador definido para cada data.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(_vagas, 1) <> 1 THEN
      RAISE EXCEPTION 'INVALID_STATE: convocação individual admite exatamente 1 vaga por data.' USING ERRCODE = '22023';
    END IF;
  ELSIF _modalidade = 'aberta' THEN
    IF _colaborador_alvo_id IS NOT NULL THEN
      RAISE EXCEPTION 'INVALID_STATE: convocação aberta não pode ter trabalhador definido previamente.' USING ERRCODE = '22023';
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_conv_ocor_valida_alvo(text, uuid, integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.dp_conv_ocor_alvo_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_modalidade text;
BEGIN
  SELECT modalidade INTO v_modalidade
    FROM public.dp_convocacao_grupos
   WHERE id = NEW.grupo_id AND company_id = NEW.company_id;

  IF v_modalidade IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: grupo da necessidade inexistente no contexto da empresa.' USING ERRCODE = '23503';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status <> 'rascunho'
     AND NEW.colaborador_alvo_id IS DISTINCT FROM OLD.colaborador_alvo_id THEN
    RAISE EXCEPTION 'INVALID_STATE: o trabalhador não pode ser alterado depois da publicação.' USING ERRCODE = '22023';
  END IF;

  PERFORM public.dp_conv_ocor_valida_alvo(v_modalidade, NEW.colaborador_alvo_id, NEW.vagas);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_conv_ocor_alvo_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_dp_conv_ocor_alvo_guard ON public.dp_convocacao_ocorrencias;
CREATE TRIGGER trg_dp_conv_ocor_alvo_guard
BEFORE INSERT OR UPDATE OF grupo_id, company_id, colaborador_alvo_id, vagas, status
ON public.dp_convocacao_ocorrencias
FOR EACH ROW EXECUTE FUNCTION public.dp_conv_ocor_alvo_guard();

CREATE OR REPLACE FUNCTION public.dp_conv_grupo_modalidade_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
BEGIN
  IF NEW.modalidade IS NOT DISTINCT FROM OLD.modalidade THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT colaborador_alvo_id, vagas
      FROM public.dp_convocacao_ocorrencias
     WHERE grupo_id = NEW.id AND company_id = NEW.company_id
  LOOP
    PERFORM public.dp_conv_ocor_valida_alvo(NEW.modalidade, r.colaborador_alvo_id, r.vagas);
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_conv_grupo_modalidade_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_dp_conv_grupo_modalidade_guard ON public.dp_convocacao_grupos;
CREATE TRIGGER trg_dp_conv_grupo_modalidade_guard
BEFORE UPDATE OF modalidade ON public.dp_convocacao_grupos
FOR EACH ROW EXECUTE FUNCTION public.dp_conv_grupo_modalidade_guard();

-- ---------------------------------------------------------------------
-- 3) valor_diaria no colaborador (aditivo, sem backfill, sem conversão)
-- ---------------------------------------------------------------------
ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS valor_diaria numeric;

ALTER TABLE public.dp_colaboradores
  DROP CONSTRAINT IF EXISTS dp_colaboradores_valor_diaria_check;

ALTER TABLE public.dp_colaboradores
  ADD CONSTRAINT dp_colaboradores_valor_diaria_check
  CHECK (valor_diaria IS NULL OR valor_diaria > 0);

COMMENT ON COLUMN public.dp_colaboradores.valor_diaria IS
  'Valor da diária (Freelancer diarista). Nunca derivado de salario_base.';

-- ---------------------------------------------------------------------
-- 4) RPCs de necessidade passam a aceitar o trabalhador alvo
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.dp_convocacao_criar_ocorrencia(uuid, uuid, uuid, date, time without time zone, time without time zone, boolean, uuid, text, time without time zone, time without time zone, integer, boolean, numeric, integer, jsonb);
DROP FUNCTION IF EXISTS public.dp_convocacao_atualizar_ocorrencia(uuid, timestamp with time zone, uuid, date, time without time zone, time without time zone, boolean, uuid, text, time without time zone, time without time zone, integer, boolean, numeric, integer, jsonb);

CREATE OR REPLACE FUNCTION public.dp_convocacao_criar_ocorrencia(
  p_ocorrencia_id uuid,
  p_grupo_id uuid,
  p_cargo_id uuid,
  p_data date,
  p_necessidade_entrada time without time zone,
  p_necessidade_saida time without time zone,
  p_necessidade_termina_no_dia_seguinte boolean DEFAULT false,
  p_turno_referencia_id uuid DEFAULT NULL,
  p_horario_modo text DEFAULT 'horario_unico',
  p_entrada time without time zone DEFAULT NULL,
  p_saida time without time zone DEFAULT NULL,
  p_intervalo_minutos integer DEFAULT NULL,
  p_termina_no_dia_seguinte boolean DEFAULT NULL,
  p_carga_prevista_horas numeric DEFAULT NULL,
  p_vagas integer DEFAULT 1,
  p_condicoes_comuns jsonb DEFAULT '{}'::jsonb,
  p_colaborador_alvo_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_grupo public.dp_convocacao_grupos;
  v_row public.dp_convocacao_ocorrencias;
  v_atual jsonb;
  v_desejado jsonb;
BEGIN
  IF p_ocorrencia_id IS NULL OR p_grupo_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: identificadores da ocorrência e do grupo são obrigatórios.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_grupo FROM public.dp_convocacao_grupos WHERE id = p_grupo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: grupo inexistente.' USING ERRCODE = '23503';
  END IF;
  v_uid := public.dp_convocacao_exige_admin(v_grupo.company_id);

  v_desejado := jsonb_build_object(
    'company_id', v_grupo.company_id, 'grupo_id', v_grupo.id, 'unidade_id', v_grupo.unidade_id,
    'cargo_id', p_cargo_id, 'data', p_data,
    'necessidade_entrada', p_necessidade_entrada, 'necessidade_saida', p_necessidade_saida,
    'necessidade_termina_no_dia_seguinte', COALESCE(p_necessidade_termina_no_dia_seguinte, false),
    'turno_referencia_id', p_turno_referencia_id, 'horario_modo', p_horario_modo,
    'entrada', p_entrada, 'saida', p_saida, 'intervalo_minutos', p_intervalo_minutos,
    'termina_no_dia_seguinte', p_termina_no_dia_seguinte, 'carga_prevista_horas', p_carga_prevista_horas,
    'vagas', COALESCE(p_vagas, 1), 'condicoes_comuns', COALESCE(p_condicoes_comuns, '{}'::jsonb),
    'colaborador_alvo_id', p_colaborador_alvo_id);

  SELECT * INTO v_row
    FROM public.dp_convocacao_ocorrencias
   WHERE id = p_ocorrencia_id
     AND company_id = v_grupo.company_id
     AND grupo_id = v_grupo.id;

  IF FOUND THEN
    v_atual := jsonb_build_object(
      'company_id', v_row.company_id, 'grupo_id', v_row.grupo_id, 'unidade_id', v_row.unidade_id,
      'cargo_id', v_row.cargo_id, 'data', v_row.data,
      'necessidade_entrada', v_row.necessidade_entrada, 'necessidade_saida', v_row.necessidade_saida,
      'necessidade_termina_no_dia_seguinte', v_row.necessidade_termina_no_dia_seguinte,
      'turno_referencia_id', v_row.turno_referencia_id, 'horario_modo', v_row.horario_modo,
      'entrada', v_row.entrada, 'saida', v_row.saida, 'intervalo_minutos', v_row.intervalo_minutos,
      'termina_no_dia_seguinte', v_row.termina_no_dia_seguinte, 'carga_prevista_horas', v_row.carga_prevista_horas,
      'vagas', v_row.vagas, 'condicoes_comuns', v_row.condicoes_comuns,
      'colaborador_alvo_id', v_row.colaborador_alvo_id);
    IF v_atual = v_desejado THEN
      RETURN jsonb_build_object('ocorrencia_id', v_row.id, 'grupo_id', v_row.grupo_id,
        'company_id', v_row.company_id, 'unidade_id', v_row.unidade_id, 'versao', v_row.versao,
        'status', v_row.status, 'updated_at', v_row.updated_at, 'idempotente', true);
    END IF;
    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: já existe uma necessidade com este identificador e conteúdo diferente.' USING ERRCODE = '23505';
  END IF;

  IF EXISTS (SELECT 1 FROM public.dp_convocacao_ocorrencias WHERE id = p_ocorrencia_id) THEN
    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: já existe uma necessidade com este identificador em outro contexto.' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_grupo
    FROM public.dp_convocacao_grupos
   WHERE id = p_grupo_id AND company_id = v_grupo.company_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: grupo inexistente.' USING ERRCODE = '23503';
  END IF;

  IF v_grupo.status <> 'rascunho' THEN
    RAISE EXCEPTION 'NOT_DRAFT: só é possível adicionar necessidades a um grupo em rascunho.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.dp_convocacao_ocorrencias(
    id, company_id, grupo_id, unidade_id, cargo_id, data,
    necessidade_entrada, necessidade_saida, necessidade_termina_no_dia_seguinte,
    turno_referencia_id, horario_modo, entrada, saida, intervalo_minutos,
    termina_no_dia_seguinte, carga_prevista_horas, vagas, condicoes_comuns,
    colaborador_alvo_id, status, criado_por)
  VALUES (
    p_ocorrencia_id, v_grupo.company_id, v_grupo.id, v_grupo.unidade_id, p_cargo_id, p_data,
    p_necessidade_entrada, p_necessidade_saida, COALESCE(p_necessidade_termina_no_dia_seguinte, false),
    p_turno_referencia_id, p_horario_modo, p_entrada, p_saida, p_intervalo_minutos,
    p_termina_no_dia_seguinte, p_carga_prevista_horas, COALESCE(p_vagas, 1),
    COALESCE(p_condicoes_comuns, '{}'::jsonb), p_colaborador_alvo_id, 'rascunho', v_uid)
  ON CONFLICT (id) DO NOTHING
  RETURNING * INTO v_row;

  IF FOUND AND v_row.id IS NOT NULL THEN
    PERFORM public.dp_convocacao_log_evento(v_row.company_id, v_row.grupo_id, v_row.id, 'ocorrencia_criada',
      jsonb_build_object('data', v_row.data, 'cargo_id', v_row.cargo_id, 'vagas', v_row.vagas,
                         'colaborador_alvo_id', v_row.colaborador_alvo_id));

    RETURN jsonb_build_object('ocorrencia_id', v_row.id, 'grupo_id', v_row.grupo_id,
      'company_id', v_row.company_id, 'unidade_id', v_row.unidade_id, 'versao', v_row.versao,
      'status', v_row.status, 'updated_at', v_row.updated_at, 'idempotente', false);
  END IF;

  SELECT * INTO v_row
    FROM public.dp_convocacao_ocorrencias
   WHERE id = p_ocorrencia_id
     AND company_id = v_grupo.company_id
     AND grupo_id = v_grupo.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: já existe uma necessidade com este identificador em outro contexto.' USING ERRCODE = '23505';
  END IF;

  v_atual := jsonb_build_object(
    'company_id', v_row.company_id, 'grupo_id', v_row.grupo_id, 'unidade_id', v_row.unidade_id,
    'cargo_id', v_row.cargo_id, 'data', v_row.data,
    'necessidade_entrada', v_row.necessidade_entrada, 'necessidade_saida', v_row.necessidade_saida,
    'necessidade_termina_no_dia_seguinte', v_row.necessidade_termina_no_dia_seguinte,
    'turno_referencia_id', v_row.turno_referencia_id, 'horario_modo', v_row.horario_modo,
    'entrada', v_row.entrada, 'saida', v_row.saida, 'intervalo_minutos', v_row.intervalo_minutos,
    'termina_no_dia_seguinte', v_row.termina_no_dia_seguinte, 'carga_prevista_horas', v_row.carga_prevista_horas,
    'vagas', v_row.vagas, 'condicoes_comuns', v_row.condicoes_comuns,
    'colaborador_alvo_id', v_row.colaborador_alvo_id);

  IF v_atual = v_desejado THEN
    RETURN jsonb_build_object('ocorrencia_id', v_row.id, 'grupo_id', v_row.grupo_id,
      'company_id', v_row.company_id, 'unidade_id', v_row.unidade_id, 'versao', v_row.versao,
      'status', v_row.status, 'updated_at', v_row.updated_at, 'idempotente', true);
  END IF;

  RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: já existe uma necessidade com este identificador e conteúdo diferente.' USING ERRCODE = '23505';
END;
$function$;

CREATE OR REPLACE FUNCTION public.dp_convocacao_atualizar_ocorrencia(
  p_ocorrencia_id uuid,
  p_expected_updated_at timestamp with time zone,
  p_cargo_id uuid,
  p_data date,
  p_necessidade_entrada time without time zone,
  p_necessidade_saida time without time zone,
  p_necessidade_termina_no_dia_seguinte boolean DEFAULT false,
  p_turno_referencia_id uuid DEFAULT NULL,
  p_horario_modo text DEFAULT 'horario_unico',
  p_entrada time without time zone DEFAULT NULL,
  p_saida time without time zone DEFAULT NULL,
  p_intervalo_minutos integer DEFAULT NULL,
  p_termina_no_dia_seguinte boolean DEFAULT NULL,
  p_carga_prevista_horas numeric DEFAULT NULL,
  p_vagas integer DEFAULT 1,
  p_condicoes_comuns jsonb DEFAULT '{}'::jsonb,
  p_colaborador_alvo_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_row public.dp_convocacao_ocorrencias;
  v_atual jsonb;
  v_desejado jsonb;
BEGIN
  IF p_ocorrencia_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: identificador da necessidade é obrigatório.' USING ERRCODE = '22023';
  END IF;

  SELECT company_id INTO v_company FROM public.dp_convocacao_ocorrencias WHERE id = p_ocorrencia_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: necessidade inexistente.' USING ERRCODE = '23503';
  END IF;
  PERFORM public.dp_convocacao_exige_admin(v_company);

  SELECT * INTO v_row
    FROM public.dp_convocacao_ocorrencias
   WHERE id = p_ocorrencia_id AND company_id = v_company
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: necessidade inexistente.' USING ERRCODE = '23503';
  END IF;

  IF v_row.status <> 'rascunho' THEN
    RAISE EXCEPTION 'NOT_DRAFT: necessidade publicada deve ser alterada por revisão.' USING ERRCODE = '22023';
  END IF;

  v_atual := jsonb_build_object(
    'cargo_id', v_row.cargo_id, 'data', v_row.data,
    'necessidade_entrada', v_row.necessidade_entrada, 'necessidade_saida', v_row.necessidade_saida,
    'necessidade_termina_no_dia_seguinte', v_row.necessidade_termina_no_dia_seguinte,
    'turno_referencia_id', v_row.turno_referencia_id, 'horario_modo', v_row.horario_modo,
    'entrada', v_row.entrada, 'saida', v_row.saida, 'intervalo_minutos', v_row.intervalo_minutos,
    'termina_no_dia_seguinte', v_row.termina_no_dia_seguinte, 'carga_prevista_horas', v_row.carga_prevista_horas,
    'vagas', v_row.vagas, 'condicoes_comuns', v_row.condicoes_comuns,
    'colaborador_alvo_id', v_row.colaborador_alvo_id);

  v_desejado := jsonb_build_object(
    'cargo_id', p_cargo_id, 'data', p_data,
    'necessidade_entrada', p_necessidade_entrada, 'necessidade_saida', p_necessidade_saida,
    'necessidade_termina_no_dia_seguinte', COALESCE(p_necessidade_termina_no_dia_seguinte, false),
    'turno_referencia_id', p_turno_referencia_id, 'horario_modo', p_horario_modo,
    'entrada', p_entrada, 'saida', p_saida, 'intervalo_minutos', p_intervalo_minutos,
    'termina_no_dia_seguinte', p_termina_no_dia_seguinte, 'carga_prevista_horas', p_carga_prevista_horas,
    'vagas', COALESCE(p_vagas, 1), 'condicoes_comuns', COALESCE(p_condicoes_comuns, '{}'::jsonb),
    'colaborador_alvo_id', p_colaborador_alvo_id);

  IF v_atual = v_desejado THEN
    RETURN jsonb_build_object('ocorrencia_id', v_row.id, 'status', v_row.status,
      'updated_at', v_row.updated_at, 'alterado', false, 'idempotente', true);
  END IF;

  IF p_expected_updated_at IS NULL OR v_row.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'CONCURRENT_MODIFICATION: a necessidade foi alterada por outra pessoa. Recarregue e tente novamente.' USING ERRCODE = '40001';
  END IF;

  UPDATE public.dp_convocacao_ocorrencias
     SET cargo_id = p_cargo_id,
         data = p_data,
         necessidade_entrada = p_necessidade_entrada,
         necessidade_saida = p_necessidade_saida,
         necessidade_termina_no_dia_seguinte = COALESCE(p_necessidade_termina_no_dia_seguinte, false),
         turno_referencia_id = p_turno_referencia_id,
         horario_modo = p_horario_modo,
         entrada = p_entrada,
         saida = p_saida,
         intervalo_minutos = p_intervalo_minutos,
         termina_no_dia_seguinte = p_termina_no_dia_seguinte,
         carga_prevista_horas = p_carga_prevista_horas,
         vagas = COALESCE(p_vagas, 1),
         condicoes_comuns = COALESCE(p_condicoes_comuns, '{}'::jsonb),
         colaborador_alvo_id = p_colaborador_alvo_id,
         updated_at = now()
   WHERE id = p_ocorrencia_id
  RETURNING * INTO v_row;

  PERFORM public.dp_convocacao_log_evento(v_row.company_id, v_row.grupo_id, v_row.id, 'ocorrencia_atualizada',
    jsonb_build_object('de', v_atual, 'para', v_desejado));

  RETURN jsonb_build_object('ocorrencia_id', v_row.id, 'status', v_row.status,
    'updated_at', v_row.updated_at, 'alterado', true, 'idempotente', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_convocacao_criar_ocorrencia(uuid, uuid, uuid, date, time without time zone, time without time zone, boolean, uuid, text, time without time zone, time without time zone, integer, boolean, numeric, integer, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_atualizar_ocorrencia(uuid, timestamp with time zone, uuid, date, time without time zone, time without time zone, boolean, uuid, text, time without time zone, time without time zone, integer, boolean, numeric, integer, jsonb, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.dp_convocacao_criar_ocorrencia(uuid, uuid, uuid, date, time without time zone, time without time zone, boolean, uuid, text, time without time zone, time without time zone, integer, boolean, numeric, integer, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_atualizar_ocorrencia(uuid, timestamp with time zone, uuid, date, time without time zone, time without time zone, boolean, uuid, text, time without time zone, time without time zone, integer, boolean, numeric, integer, jsonb, uuid) TO authenticated, service_role;

-- =====================================================================
-- ROLLBACK (referência manual):
--   DROP TRIGGER trg_dp_conv_grupo_modalidade_guard ON public.dp_convocacao_grupos;
--   DROP TRIGGER trg_dp_conv_ocor_alvo_guard ON public.dp_convocacao_ocorrencias;
--   DROP FUNCTION public.dp_conv_grupo_modalidade_guard();
--   DROP FUNCTION public.dp_conv_ocor_alvo_guard();
--   DROP FUNCTION public.dp_conv_ocor_valida_alvo(text, uuid, integer);
--   ALTER TABLE public.dp_convocacao_ocorrencias DROP CONSTRAINT fk_dp_conv_ocor_alvo_company;
--   DROP INDEX public.idx_dp_conv_ocor_alvo_data;
--   ALTER TABLE public.dp_convocacao_ocorrencias DROP COLUMN colaborador_alvo_id;
--   ALTER TABLE public.dp_colaboradores DROP CONSTRAINT dp_colaboradores_valor_diaria_check;
--   ALTER TABLE public.dp_colaboradores DROP COLUMN valor_diaria;
--   (recriar as duas RPCs sem p_colaborador_alvo_id conforme M13)
-- =====================================================================