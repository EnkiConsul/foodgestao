ALTER TABLE public.dp_config_dp ADD COLUMN IF NOT EXISTS ferias_controle_inicio date;
ALTER TABLE public.dp_colaboradores ADD COLUMN IF NOT EXISTS ferias_controle_inicio date;
ALTER TABLE public.dp_ferias_periodos
  ADD COLUMN IF NOT EXISTS controle_externo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS saldo_inicial_dias smallint,
  ADD COLUMN IF NOT EXISTS saldo_inicial_obs text,
  ADD COLUMN IF NOT EXISTS saldo_inicial_por uuid,
  ADD COLUMN IF NOT EXISTS saldo_inicial_em timestamptz;

-- Corte efetivo: colaborador > empresa > padrão (início do último período aquisitivo completo)
CREATE OR REPLACE FUNCTION public.dp_ferias_corte_efetivo(_colaborador_id uuid)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col record;
  v_cfg date;
  v_inicio date;
  v_fim date;
  v_ultimo_completo date;
BEGIN
  SELECT id, company_id, data_admissao, data_desligamento, ferias_controle_inicio
    INTO v_col
  FROM public.dp_colaboradores
  WHERE id = _colaborador_id;

  IF v_col.id IS NULL OR v_col.data_admissao IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_col.ferias_controle_inicio IS NOT NULL THEN
    RETURN GREATEST(v_col.ferias_controle_inicio, v_col.data_admissao);
  END IF;

  SELECT ferias_controle_inicio INTO v_cfg
  FROM public.dp_config_dp
  WHERE company_id = v_col.company_id
  LIMIT 1;

  IF v_cfg IS NOT NULL THEN
    RETURN GREATEST(v_cfg, v_col.data_admissao);
  END IF;

  -- Padrão: início do último período aquisitivo já completo em relação a hoje
  v_inicio := v_col.data_admissao;
  v_ultimo_completo := v_col.data_admissao;
  LOOP
    v_fim := (v_inicio + INTERVAL '1 year - 1 day')::date;
    EXIT WHEN v_fim >= COALESCE(v_col.data_desligamento, CURRENT_DATE);
    v_ultimo_completo := v_inicio;
    v_inicio := (v_inicio + INTERVAL '1 year')::date;
  END LOOP;

  RETURN v_ultimo_completo;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_corte_efetivo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_corte_efetivo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_ferias_corte_efetivo(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.dp_ferias_gerar_periodos(_colaborador_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col record;
  v_inicio date;
  v_fim date;
  v_limite date;
  v_corte date;
  v_criados int := 0;
BEGIN
  SELECT id, company_id, data_admissao, data_desligamento
    INTO v_col
  FROM public.dp_colaboradores
  WHERE id = _colaborador_id;

  IF v_col.id IS NULL THEN
    RAISE EXCEPTION 'FERIAS_COLABORADOR_NAO_ENCONTRADO';
  END IF;

  IF NOT private.is_company_admin_or_owner(auth.uid(), v_col.company_id) THEN
    RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO';
  END IF;

  IF v_col.data_admissao IS NULL THEN
    RAISE EXCEPTION 'FERIAS_SEM_ADMISSAO';
  END IF;

  v_corte := COALESCE(public.dp_ferias_corte_efetivo(_colaborador_id), v_col.data_admissao);

  v_inicio := v_col.data_admissao;

  WHILE v_inicio <= COALESCE(v_col.data_desligamento, CURRENT_DATE) LOOP
    v_fim := (v_inicio + INTERVAL '1 year - 1 day')::date;
    v_limite := (v_fim + INTERVAL '1 year')::date;

    IF v_fim >= v_corte THEN
      INSERT INTO public.dp_ferias_periodos (
        company_id, colaborador_id, inicio_aquisitivo, fim_aquisitivo, limite_concessivo, criado_por
      ) VALUES (
        v_col.company_id, v_col.id, v_inicio, v_fim, v_limite, auth.uid()
      )
      ON CONFLICT (colaborador_id, inicio_aquisitivo) DO NOTHING;

      IF FOUND THEN v_criados := v_criados + 1; END IF;
    END IF;

    v_inicio := (v_inicio + INTERVAL '1 year')::date;
  END LOOP;

  -- Períodos anteriores ao corte passam a ser tratados como controle externo
  UPDATE public.dp_ferias_periodos
     SET controle_externo = (fim_aquisitivo < v_corte),
         updated_at = now()
   WHERE colaborador_id = _colaborador_id
     AND controle_externo <> (fim_aquisitivo < v_corte);

  PERFORM public.dp_ferias_recalc_periodo(p.id)
  FROM public.dp_ferias_periodos p
  WHERE p.colaborador_id = _colaborador_id;

  RETURN v_criados;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_gerar_periodos(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_gerar_periodos(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_ferias_gerar_periodos(uuid) TO service_role;

-- Saldo trazido do controle anterior define o direito daquele período
CREATE OR REPLACE FUNCTION public.dp_ferias_definir_saldo_inicial(
  _periodo_id uuid,
  _dias integer,
  _obs text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_per record;
  v_usados int;
BEGIN
  SELECT * INTO v_per FROM public.dp_ferias_periodos WHERE id = _periodo_id;
  IF v_per.id IS NULL THEN
    RAISE EXCEPTION 'FERIAS_PERIODO_NAO_ENCONTRADO';
  END IF;

  IF NOT private.is_company_admin_or_owner(auth.uid(), v_per.company_id) THEN
    RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_periodo_id::text, 0));

  IF _dias IS NOT NULL AND (_dias < 0 OR _dias > 30) THEN
    RAISE EXCEPTION 'FERIAS_SALDO_INICIAL_INVALIDO';
  END IF;

  IF _dias IS NOT NULL THEN
    SELECT COALESCE(SUM(dias + dias_abono), 0) INTO v_usados
    FROM public.dp_ferias_gozos
    WHERE periodo_id = _periodo_id AND status <> 'cancelado';

    IF v_usados > _dias THEN
      RAISE EXCEPTION 'FERIAS_SALDO_INICIAL_CONFLITO';
    END IF;
  END IF;

  UPDATE public.dp_ferias_periodos
     SET saldo_inicial_dias = _dias,
         saldo_inicial_obs = NULLIF(btrim(COALESCE(_obs, '')), ''),
         saldo_inicial_por = auth.uid(),
         saldo_inicial_em = now(),
         dias_direito = COALESCE(_dias, 30),
         updated_at = now()
   WHERE id = _periodo_id;

  PERFORM public.dp_ferias_recalc_periodo(_periodo_id);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_definir_saldo_inicial(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_ferias_definir_saldo_inicial(uuid, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.dp_ferias_definir_saldo_inicial(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_ferias_definir_saldo_inicial(uuid, integer, text) TO service_role;