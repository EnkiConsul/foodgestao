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
  v_alvo int;
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

  -- Padrão: início do período aquisitivo que se encerrou no ano civil anterior.
  v_alvo := EXTRACT(YEAR FROM CURRENT_DATE)::int - 1;
  v_inicio := v_col.data_admissao;
  LOOP
    v_fim := (v_inicio + INTERVAL '1 year - 1 day')::date;
    EXIT WHEN EXTRACT(YEAR FROM v_fim)::int >= v_alvo;
    v_inicio := (v_inicio + INTERVAL '1 year')::date;
  END LOOP;

  RETURN GREATEST(v_inicio, v_col.data_admissao);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_corte_efetivo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_corte_efetivo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_ferias_corte_efetivo(uuid) TO service_role;

-- Reprocessamento único dos cadastros existentes com a nova regra padrão
DO $reproc$
DECLARE
  r record;
  v_corte date;
  v_inicio date;
  v_fim date;
  v_limite date;
  p record;
BEGIN
  FOR r IN
    SELECT id, company_id, data_admissao, data_desligamento
    FROM public.dp_colaboradores
    WHERE data_admissao IS NOT NULL
      AND data_desligamento IS NULL
  LOOP
    v_corte := COALESCE(public.dp_ferias_corte_efetivo(r.id), r.data_admissao);

    v_inicio := r.data_admissao;
    WHILE v_inicio <= CURRENT_DATE LOOP
      v_fim := (v_inicio + INTERVAL '1 year - 1 day')::date;
      v_limite := (v_fim + INTERVAL '1 year')::date;

      IF v_fim >= v_corte THEN
        INSERT INTO public.dp_ferias_periodos (
          company_id, colaborador_id, inicio_aquisitivo, fim_aquisitivo, limite_concessivo
        ) VALUES (
          r.company_id, r.id, v_inicio, v_fim, v_limite
        )
        ON CONFLICT (colaborador_id, inicio_aquisitivo) DO NOTHING;
      END IF;

      v_inicio := (v_inicio + INTERVAL '1 year')::date;
    END LOOP;

    UPDATE public.dp_ferias_periodos
       SET controle_externo = (fim_aquisitivo < v_corte),
           updated_at = now()
     WHERE colaborador_id = r.id
       AND controle_externo <> (fim_aquisitivo < v_corte);

    FOR p IN
      SELECT id FROM public.dp_ferias_periodos WHERE colaborador_id = r.id
    LOOP
      PERFORM public.dp_ferias_recalc_periodo(p.id);
    END LOOP;
  END LOOP;
END
$reproc$;