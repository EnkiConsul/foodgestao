
-- 1) Nova flag de liberação manual pelo admin
ALTER TABLE public.dp_datas_bloqueadas
  ADD COLUMN IF NOT EXISTS liberada boolean NOT NULL DEFAULT false;

-- 2) dp_regra_bloqueia_data: retorna false se houver override manual/solicitação
CREATE OR REPLACE FUNCTION public.dp_regra_bloqueia_data(_company_id uuid, _unidade_id uuid, _data date)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_ano int := EXTRACT(YEAR FROM _data)::int;
  v_mes int := EXTRACT(MONTH FROM _data)::int;
  v_dia int := EXTRACT(DAY FROM _data)::int;
  v_dow int := EXTRACT(DOW FROM _data)::int;
  v_aplicacao text;
  v_ano_ref int;
  v_meses jsonb;
  v_dias jsonb;
  v_ordinal int;
  v_diasem int;
  v_pos_dia int;
  v_tipo_orig text;
  v_first_dow int;
  v_dia_alvo int;
  v_sab date;
  v_dom date;
  v_has_unidades boolean;
  v_override boolean;
BEGIN
  -- Override: liberação manual do admin ou por solicitação aprovada
  SELECT EXISTS (
    SELECT 1 FROM public.dp_datas_bloqueadas
     WHERE company_id = _company_id
       AND data = _data
       AND (unidade_id IS NULL OR unidade_id = _unidade_id)
       AND (liberada = true OR liberada_por_solicitacao IS NOT NULL)
  ) INTO v_override;
  IF v_override THEN RETURN false; END IF;

  FOR r IN
    SELECT id, tipo, mes, dia, regra_json
      FROM public.dp_bloqueio_regras
     WHERE company_id = _company_id
       AND ativo = true
  LOOP
    SELECT EXISTS (SELECT 1 FROM public.dp_bloqueio_regra_unidades WHERE regra_id = r.id)
      INTO v_has_unidades;
    IF v_has_unidades THEN
      IF _unidade_id IS NULL THEN CONTINUE; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.dp_bloqueio_regra_unidades
         WHERE regra_id = r.id AND unidade_id = _unidade_id
      ) THEN CONTINUE; END IF;
    END IF;

    v_aplicacao := COALESCE(r.regra_json->>'aplicacao', 'anual');
    v_ano_ref := NULLIF(r.regra_json->>'ano_referencia', '')::int;
    IF v_aplicacao = 'unica' AND v_ano_ref IS NOT NULL AND v_ano_ref <> v_ano THEN
      CONTINUE;
    END IF;

    v_meses := COALESCE(r.regra_json->'meses', '[]'::jsonb);
    IF jsonb_array_length(v_meses) > 0 THEN
      IF NOT (v_meses @> to_jsonb(v_mes)) THEN CONTINUE; END IF;
    ELSIF r.mes IS NOT NULL AND r.mes <> v_mes THEN
      CONTINUE;
    END IF;

    v_tipo_orig := r.regra_json->>'tipo_original';

    IF r.tipo = 'fixa_anual' THEN
      v_dias := COALESCE(r.regra_json->'dias', '[]'::jsonb);
      IF jsonb_array_length(v_dias) > 0 THEN
        IF v_dias @> to_jsonb(v_dia) THEN RETURN true; END IF;
      ELSIF r.dia IS NOT NULL AND r.dia = v_dia THEN
        RETURN true;
      END IF;

    ELSIF r.tipo = 'dinamica' AND v_tipo_orig = 'pos_pagamento' THEN
      v_pos_dia := COALESCE(NULLIF(r.regra_json->>'pos_pagamento_dia', '')::int, 5);
      v_sab := make_date(v_ano, v_mes, v_pos_dia) + 1;
      WHILE EXTRACT(MONTH FROM v_sab)::int = v_mes AND EXTRACT(DOW FROM v_sab)::int <> 6 LOOP
        v_sab := v_sab + 1;
      END LOOP;
      IF EXTRACT(MONTH FROM v_sab)::int = v_mes THEN
        v_dom := v_sab + 1;
        IF _data = v_sab THEN RETURN true; END IF;
        IF EXTRACT(MONTH FROM v_dom)::int = v_mes AND _data = v_dom THEN RETURN true; END IF;
      END IF;

    ELSIF r.tipo = 'dinamica' THEN
      v_ordinal := COALESCE(NULLIF(r.regra_json->>'ordinal', '')::int, 1);
      v_diasem := COALESCE(NULLIF(r.regra_json->>'dia_semana', '')::int, 0);
      v_first_dow := EXTRACT(DOW FROM make_date(v_ano, v_mes, 1))::int;
      v_dia_alvo := 1 + ((v_diasem - v_first_dow + 7) % 7) + (v_ordinal - 1) * 7;
      IF v_dia_alvo BETWEEN 1 AND 31
         AND EXTRACT(MONTH FROM make_date(v_ano, v_mes, v_dia_alvo))::int = v_mes
         AND v_dia_alvo = v_dia THEN
        RETURN true;
      END IF;
    END IF;
  END LOOP;

  RETURN false;
END;
$function$;

-- 3) dp_folgas_validar_self: honra `liberada = true` em manual e regra
CREATE OR REPLACE FUNCTION public.dp_folgas_validar_self()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_wd int;
  v_unidade uuid;
  v_mensais int;
  v_bloq record;
  v_liberada boolean;
BEGIN
  IF v_uid IS NOT NULL AND private.is_company_admin_or_owner(v_uid, NEW.company_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.data < current_date THEN
    RAISE EXCEPTION 'Não é possível marcar folga em data passada.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_wd := EXTRACT(DOW FROM NEW.data)::int;
  IF v_wd NOT IN (0, 6) THEN
    RAISE EXCEPTION 'Apenas fins de semana podem ser marcados diretamente. Use "Solicitar exceção".'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT unidade_id INTO v_unidade
    FROM public.dp_colaboradores
   WHERE id = NEW.colaborador_id;

  IF EXISTS (
    SELECT 1 FROM public.dp_folgas
     WHERE colaborador_id = NEW.colaborador_id
       AND data = NEW.data
       AND status <> 'cancelada'
  ) THEN
    RAISE EXCEPTION 'Você já tem folga marcada neste dia.'
      USING ERRCODE = 'unique_violation';
  END IF;

  SELECT count(*) INTO v_mensais
    FROM public.dp_folgas
   WHERE colaborador_id = NEW.colaborador_id
     AND extra = false
     AND status <> 'cancelada'
     AND EXTRACT(DOW FROM data) IN (0, 6)
     AND date_trunc('month', data) = date_trunc('month', NEW.data);
  IF v_mensais >= 1 THEN
    RAISE EXCEPTION 'Você já possui uma folga de fim de semana neste mês.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 5a) bloqueio manual pontual em dp_datas_bloqueadas
  SELECT motivo, liberada_por_solicitacao, liberada
    INTO v_bloq
    FROM public.dp_datas_bloqueadas
   WHERE company_id = NEW.company_id
     AND data = NEW.data
     AND (unidade_id IS NULL OR unidade_id = v_unidade)
   ORDER BY unidade_id NULLS LAST
   LIMIT 1;
  IF FOUND
     AND v_bloq.liberada_por_solicitacao IS NULL
     AND COALESCE(v_bloq.liberada, false) = false THEN
    RAISE EXCEPTION 'Esta data está bloqueada administrativamente.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 5b) regras dinâmicas em dp_bloqueio_regras (runtime)
  IF public.dp_regra_bloqueia_data(NEW.company_id, v_unidade, NEW.data) THEN
    SELECT (liberada_por_solicitacao IS NOT NULL OR COALESCE(liberada, false) = true)
      INTO v_liberada
      FROM public.dp_datas_bloqueadas
     WHERE company_id = NEW.company_id
       AND data = NEW.data
       AND (unidade_id IS NULL OR unidade_id = v_unidade)
     ORDER BY unidade_id NULLS LAST
     LIMIT 1;
    IF NOT COALESCE(v_liberada, false) THEN
      RAISE EXCEPTION 'Esta data está bloqueada por regra da empresa.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 4) dp_validar_solicitacao_folga: honra `liberada = true` também
CREATE OR REPLACE FUNCTION public.dp_validar_solicitacao_folga()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_unidade_id uuid;
  v_limite int;
  v_qtd int;
  v_bloqueada boolean;
  v_bloq_individual boolean;
  v_liberada boolean;
BEGIN
  IF NEW.tipo IS DISTINCT FROM 'folga' THEN RETURN NEW; END IF;
  IF NEW.status = 'cancelada' OR NEW.status = 'recusada' THEN RETURN NEW; END IF;
  IF NEW.data_alvo IS NULL THEN RETURN NEW; END IF;

  SELECT unidade_id INTO v_unidade_id
    FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;

  SELECT EXISTS (
    SELECT 1 FROM public.dp_datas_bloqueadas b
    WHERE b.company_id = NEW.company_id
      AND b.data = NEW.data_alvo
      AND (b.unidade_id IS NULL OR b.unidade_id = v_unidade_id)
      AND b.liberada_por_solicitacao IS NULL
      AND COALESCE(b.liberada, false) = false
  ) INTO v_bloqueada;
  IF v_bloqueada THEN
    RAISE EXCEPTION 'Data % está bloqueada para folgas nesta empresa/unidade', NEW.data_alvo
      USING ERRCODE = 'check_violation';
  END IF;

  IF public.dp_regra_bloqueia_data(NEW.company_id, v_unidade_id, NEW.data_alvo) THEN
    SELECT (liberada_por_solicitacao IS NOT NULL OR COALESCE(liberada, false) = true)
      INTO v_liberada
      FROM public.dp_datas_bloqueadas
     WHERE company_id = NEW.company_id
       AND data = NEW.data_alvo
       AND (unidade_id IS NULL OR unidade_id = v_unidade_id)
     ORDER BY unidade_id NULLS LAST
     LIMIT 1;
    IF NOT COALESCE(v_liberada, false) THEN
      RAISE EXCEPTION 'Data % está bloqueada por regra da empresa', NEW.data_alvo
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.dp_bloqueios bl
    WHERE bl.company_id = NEW.company_id
      AND bl.colaborador_id = NEW.colaborador_id
      AND bl.ativo = true
      AND bl.tipo IN ('folga','todos')
      AND bl.inicio <= NEW.data_alvo
      AND (bl.fim IS NULL OR bl.fim >= NEW.data_alvo)
  ) INTO v_bloq_individual;
  IF v_bloq_individual THEN
    RAISE EXCEPTION 'Você está bloqueado para marcar folga em %', NEW.data_alvo
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT limite_folgas INTO v_limite
    FROM public.dp_dia_config
   WHERE company_id = NEW.company_id
     AND data = NEW.data_alvo
     AND (unidade_id = v_unidade_id OR unidade_id IS NULL)
   ORDER BY (unidade_id IS NOT NULL) DESC
   LIMIT 1;

  IF v_limite IS NOT NULL AND v_limite > 0 THEN
    SELECT
      (
        SELECT COUNT(*) FROM public.dp_folgas f
         WHERE f.company_id = NEW.company_id
           AND f.data = NEW.data_alvo
           AND f.status <> 'cancelada'
           AND f.extra = false
           AND f.tipo NOT IN ('ferias','licenca')
           AND (v_unidade_id IS NULL OR EXISTS (
               SELECT 1 FROM public.dp_colaboradores c2
                WHERE c2.id = f.colaborador_id AND c2.unidade_id = v_unidade_id
             ))
      ) + (
        SELECT COUNT(*) FROM public.dp_solicitacoes s
         WHERE s.company_id = NEW.company_id
           AND s.data_alvo = NEW.data_alvo
           AND s.status = 'pendente'
           AND s.tipo = 'folga'
           AND s.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
           AND (v_unidade_id IS NULL OR EXISTS (
               SELECT 1 FROM public.dp_colaboradores c3
                WHERE c3.id = s.colaborador_id AND c3.unidade_id = v_unidade_id
             ))
      )
      INTO v_qtd;
    IF v_qtd >= v_limite THEN
      RAISE EXCEPTION 'Limite diário de folgas atingido para %', NEW.data_alvo
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
