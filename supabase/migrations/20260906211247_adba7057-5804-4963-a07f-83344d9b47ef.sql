CREATE TABLE public.dp_unidade_feriados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unidade_id uuid NOT NULL REFERENCES public.dp_unidades(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('especifica','anual','relativa')),
  data date,
  dia smallint CHECK (dia BETWEEN 1 AND 31),
  mes smallint CHECK (mes BETWEEN 1 AND 12),
  ordinal smallint CHECK (ordinal IN (-1,1,2,3,4,5)),
  dia_semana smallint CHECK (dia_semana BETWEEN 0 AND 6),
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_unidade_feriados TO authenticated;
GRANT ALL ON public.dp_unidade_feriados TO service_role;

ALTER TABLE public.dp_unidade_feriados ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_unidade_feriados_select ON public.dp_unidade_feriados
FOR SELECT TO authenticated
USING (private.is_company_member(auth.uid(), company_id) OR private.is_company_owner(auth.uid(), company_id));

CREATE POLICY dp_unidade_feriados_insert ON public.dp_unidade_feriados
FOR INSERT TO authenticated
WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY dp_unidade_feriados_update ON public.dp_unidade_feriados
FOR UPDATE TO authenticated
USING (private.is_company_admin_or_owner(auth.uid(), company_id))
WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY dp_unidade_feriados_delete ON public.dp_unidade_feriados
FOR DELETE TO authenticated
USING (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE INDEX dp_unidade_feriados_unidade_idx ON public.dp_unidade_feriados (unidade_id, ativo);
CREATE INDEX dp_unidade_feriados_company_idx ON public.dp_unidade_feriados (company_id);

CREATE TRIGGER dp_unidade_feriados_updated_at
BEFORE UPDATE ON public.dp_unidade_feriados
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Coerência dos campos por tipo + unidade pertencente à empresa (fail closed)
CREATE OR REPLACE FUNCTION public.dp_feriado_validar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_company uuid;
BEGIN
  IF NEW.tipo = 'especifica' THEN
    IF NEW.data IS NULL THEN RAISE EXCEPTION 'FERIADO_CAMPOS_INVALIDOS'; END IF;
    NEW.dia := NULL; NEW.mes := NULL; NEW.ordinal := NULL; NEW.dia_semana := NULL;
  ELSIF NEW.tipo = 'anual' THEN
    IF NEW.dia IS NULL OR NEW.mes IS NULL THEN RAISE EXCEPTION 'FERIADO_CAMPOS_INVALIDOS'; END IF;
    NEW.data := NULL; NEW.ordinal := NULL; NEW.dia_semana := NULL;
  ELSE
    IF NEW.ordinal IS NULL OR NEW.dia_semana IS NULL OR NEW.mes IS NULL THEN
      RAISE EXCEPTION 'FERIADO_CAMPOS_INVALIDOS';
    END IF;
    NEW.data := NULL; NEW.dia := NULL;
  END IF;

  IF COALESCE(btrim(NEW.nome), '') = '' THEN RAISE EXCEPTION 'FERIADO_CAMPOS_INVALIDOS'; END IF;

  SELECT company_id INTO v_company FROM public.dp_unidades WHERE id = NEW.unidade_id;
  IF v_company IS NULL OR v_company <> NEW.company_id THEN
    RAISE EXCEPTION 'FERIADO_UNIDADE_INVALIDA';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER dp_feriado_validar_trg
BEFORE INSERT OR UPDATE ON public.dp_unidade_feriados
FOR EACH ROW EXECUTE FUNCTION public.dp_feriado_validar();

-- Resolve os feriados da unidade em datas reais dentro do intervalo
CREATE OR REPLACE FUNCTION public.dp_feriados_resolver(_unidade_id uuid, _inicio date, _fim date)
RETURNS TABLE(data date, nome text, feriado_id uuid, tipo text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company uuid;
  r record;
  y int;
  d date;
  primeiro date;
  ultimo date;
  delta int;
BEGIN
  IF _unidade_id IS NULL OR _inicio IS NULL OR _fim IS NULL OR _fim < _inicio THEN
    RETURN;
  END IF;

  SELECT u.company_id INTO v_company FROM public.dp_unidades u WHERE u.id = _unidade_id;
  IF v_company IS NULL THEN RETURN; END IF;
  IF NOT (private.is_company_member(auth.uid(), v_company) OR private.is_company_owner(auth.uid(), v_company)) THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT * FROM public.dp_unidade_feriados f
    WHERE f.unidade_id = _unidade_id AND f.ativo
  LOOP
    IF r.tipo = 'especifica' THEN
      IF r.data BETWEEN _inicio AND _fim THEN
        RETURN QUERY SELECT r.data, r.nome, r.id, r.tipo;
      END IF;
    ELSE
      FOR y IN EXTRACT(YEAR FROM _inicio)::int .. EXTRACT(YEAR FROM _fim)::int LOOP
        IF r.tipo = 'anual' THEN
          BEGIN
            d := make_date(y, r.mes, r.dia);
          EXCEPTION WHEN others THEN
            d := NULL;
          END;
        ELSE
          primeiro := make_date(y, r.mes, 1);
          IF r.ordinal = -1 THEN
            ultimo := (primeiro + INTERVAL '1 month - 1 day')::date;
            delta := (EXTRACT(DOW FROM ultimo)::int - r.dia_semana + 7) % 7;
            d := ultimo - delta;
          ELSE
            delta := (r.dia_semana - EXTRACT(DOW FROM primeiro)::int + 7) % 7;
            d := primeiro + delta + (r.ordinal - 1) * 7;
            IF EXTRACT(MONTH FROM d)::int <> r.mes THEN d := NULL; END IF;
          END IF;
        END IF;

        IF d IS NOT NULL AND d BETWEEN _inicio AND _fim THEN
          RETURN QUERY SELECT d, r.nome, r.id, r.tipo;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_feriados_resolver(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_feriados_resolver(uuid, date, date) TO authenticated, service_role;

-- Véspera de feriado / descanso semanal na validação da programação
CREATE OR REPLACE FUNCTION public.dp_ferias_validar_programacao(_colaborador_id uuid, _periodo_id uuid, _data_inicio date, _data_fim date, _dias_abono integer, _justificativa text, _ignorar_gozo_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_col record;
  v_periodo record;
  v_usados int;
  v_novos int;
  v_antecedencia smallint;
  v_d date;
  v_dow int;
  v_trabalha boolean;
BEGIN
  IF _data_inicio IS NULL OR _data_fim IS NULL OR _data_fim < _data_inicio THEN
    RAISE EXCEPTION 'FERIAS_DATAS_INVALIDAS';
  END IF;

  SELECT id, company_id, unidade_id INTO v_col
  FROM public.dp_colaboradores WHERE id = _colaborador_id;
  IF v_col.id IS NULL THEN
    RAISE EXCEPTION 'FERIAS_COLABORADOR_NAO_ENCONTRADO';
  END IF;

  SELECT * INTO v_periodo FROM public.dp_ferias_periodos WHERE id = _periodo_id FOR UPDATE;
  IF v_periodo.id IS NULL OR v_periodo.colaborador_id <> _colaborador_id THEN
    RAISE EXCEPTION 'FERIAS_PERIODO_NAO_ENCONTRADO';
  END IF;
  IF v_periodo.requer_revisao THEN
    RAISE EXCEPTION 'FERIAS_PERIODO_EM_REVISAO';
  END IF;

  SELECT COALESCE(SUM(g.dias + g.dias_abono), 0) INTO v_usados
  FROM public.dp_ferias_gozos g
  WHERE g.periodo_id = _periodo_id
    AND g.status <> 'cancelado'
    AND (_ignorar_gozo_id IS NULL OR g.id <> _ignorar_gozo_id);

  v_novos := (_data_fim - _data_inicio + 1) + COALESCE(_dias_abono, 0);
  IF v_usados + v_novos > v_periodo.dias_direito THEN
    RAISE EXCEPTION 'FERIAS_SALDO_INSUFICIENTE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.dp_ferias_gozos g
    WHERE g.colaborador_id = _colaborador_id
      AND g.status <> 'cancelado'
      AND (_ignorar_gozo_id IS NULL OR g.id <> _ignorar_gozo_id)
      AND daterange(g.data_inicio, g.data_fim, '[]') && daterange(_data_inicio, _data_fim, '[]')
  ) THEN
    RAISE EXCEPTION 'FERIAS_SOBREPOSICAO';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.dp_convocacoes cv
    JOIN public.dp_convocacao_ocorrencias oc ON oc.id = cv.ocorrencia_id
    WHERE cv.colaborador_id = _colaborador_id
      AND cv.status = 'aceita'
      AND oc.data BETWEEN _data_inicio AND _data_fim
  ) THEN
    RAISE EXCEPTION 'FERIAS_CONVOCACAO_ACEITA';
  END IF;

  -- Início não pode cair nos dois dias que antecedem feriado ou descanso semanal
  FOR v_d IN SELECT generate_series(_data_inicio + 1, _data_inicio + 2, INTERVAL '1 day')::date LOOP
    IF v_col.unidade_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.dp_feriados_resolver(v_col.unidade_id, v_d, v_d)
    ) THEN
      RAISE EXCEPTION 'FERIAS_INICIO_VESPERA';
    END IF;

    v_dow := EXTRACT(DOW FROM v_d)::int;
    SELECT cd.trabalha INTO v_trabalha
    FROM public.dp_colaborador_config_trabalho ct
    JOIN public.dp_colaborador_config_dias cd ON cd.config_id = ct.id
    WHERE ct.colaborador_id = _colaborador_id
      AND ct.vigencia_fim IS NULL
      AND cd.dow = v_dow
    LIMIT 1;

    IF v_trabalha IS FALSE OR (v_trabalha IS NULL AND v_dow = 0) THEN
      RAISE EXCEPTION 'FERIAS_INICIO_VESPERA';
    END IF;
  END LOOP;

  SELECT c.aviso_antecedencia_dias INTO v_antecedencia
  FROM public.dp_ferias_config(v_col.company_id, v_col.unidade_id) c;

  IF (_data_inicio - CURRENT_DATE) < COALESCE(v_antecedencia, 60)
     AND COALESCE(btrim(_justificativa), '') = '' THEN
    RAISE EXCEPTION 'FERIAS_AVISO_ANTECEDENCIA';
  END IF;
END;
$function$;

-- Informar à contabilidade
CREATE OR REPLACE FUNCTION public.dp_ferias_marcar_informado(_gozo_id uuid, _status text DEFAULT 'informada'::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_gozo record;
BEGIN
  IF _status NOT IN ('aprovada','a_informar','informada') THEN
    RAISE EXCEPTION 'FERIAS_CONTABILIDADE_STATUS_INVALIDO';
  END IF;

  SELECT * INTO v_gozo FROM public.dp_ferias_gozos WHERE id = _gozo_id FOR UPDATE;
  IF v_gozo.id IS NULL THEN RAISE EXCEPTION 'FERIAS_NAO_ENCONTRADA'; END IF;
  IF NOT private.is_company_admin_or_owner(auth.uid(), v_gozo.company_id) THEN
    RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO';
  END IF;

  UPDATE public.dp_ferias_gozos
  SET contabilidade_status = _status,
      informado_em = CASE WHEN _status = 'informada' THEN now() ELSE NULL END,
      informado_por = CASE WHEN _status = 'informada' THEN auth.uid() ELSE NULL END
  WHERE id = _gozo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_marcar_informado(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_marcar_informado(uuid, text) TO authenticated, service_role;