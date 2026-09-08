CREATE OR REPLACE FUNCTION public.dp_ferias_manter_periodos(_company_id uuid)
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
  IF NOT (
    private.is_company_member(auth.uid(), _company_id)
    OR private.is_company_owner(auth.uid(), _company_id)
  ) THEN
    RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO';
  END IF;

  FOR v_col IN
    SELECT c.id, c.company_id, c.data_admissao, c.data_desligamento
    FROM public.dp_colaboradores c
    WHERE c.company_id = _company_id
      AND c.data_admissao IS NOT NULL
      AND c.regime IN ('clt', 'estagio', 'temporario', 'intermitente')
      AND COALESCE(c.vinculo_label, '') NOT ILIKE 'sócio%'
      AND COALESCE(c.vinculo_label, '') NOT ILIKE 'socio%'
  LOOP
    v_corte := COALESCE(public.dp_ferias_corte_efetivo(v_col.id), v_col.data_admissao);
    v_inicio := v_col.data_admissao;

    WHILE v_inicio <= COALESCE(v_col.data_desligamento, CURRENT_DATE) LOOP
      v_fim := (v_inicio + INTERVAL '1 year - 1 day')::date;
      v_limite := (v_fim + INTERVAL '1 year')::date;

      IF v_fim >= v_corte THEN
        INSERT INTO public.dp_ferias_periodos (
          company_id, colaborador_id, inicio_aquisitivo, fim_aquisitivo, limite_concessivo
        ) VALUES (
          v_col.company_id, v_col.id, v_inicio, v_fim, v_limite
        )
        ON CONFLICT (colaborador_id, inicio_aquisitivo) DO NOTHING;

        IF FOUND THEN v_criados := v_criados + 1; END IF;
      END IF;

      v_inicio := (v_inicio + INTERVAL '1 year')::date;
    END LOOP;

    UPDATE public.dp_ferias_periodos
       SET controle_externo = (fim_aquisitivo < v_corte),
           updated_at = now()
     WHERE colaborador_id = v_col.id
       AND controle_externo <> (fim_aquisitivo < v_corte);
  END LOOP;

  PERFORM public.dp_ferias_recalc_periodo(p.id)
  FROM public.dp_ferias_periodos p
  WHERE p.company_id = _company_id;

  RETURN v_criados;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_ferias_manter_periodos(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_manter_periodos(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_ferias_manter_periodos(uuid) TO service_role;