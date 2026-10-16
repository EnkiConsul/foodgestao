ALTER TABLE public.dp_config_dp ADD COLUMN IF NOT EXISTS ocorrencias_corte_dia smallint
  CHECK (ocorrencias_corte_dia IS NULL OR ocorrencias_corte_dia BETWEEN 0 AND 28);
COMMENT ON COLUMN public.dp_config_dp.ocorrencias_corte_dia IS 'Dia de corte da folha usado em Ocorrencias (0 = mes civil). Vale so na linha padrao da empresa.';

CREATE OR REPLACE FUNCTION public.dp_ocorrencias_corte_definir(p_company_id uuid, p_dia smallint)
RETURNS smallint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501'; END IF;
  IF p_company_id IS NULL OR NOT public.tem_permissao(p_company_id, 'dp.ocorrencias', 'alteracao') THEN
    RAISE EXCEPTION 'SEM_PERMISSAO' USING ERRCODE = '42501';
  END IF;
  IF p_dia IS NULL OR p_dia < 0 OR p_dia > 28 THEN
    RAISE EXCEPTION 'DIA_INVALIDO' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.dp_config_dp (company_id, unidade_id, ocorrencias_corte_dia)
  VALUES (p_company_id, NULL, p_dia)
  ON CONFLICT (company_id) WHERE unidade_id IS NULL
  DO UPDATE SET ocorrencias_corte_dia = EXCLUDED.ocorrencias_corte_dia;
  RETURN p_dia;
END;
$$;

CREATE OR REPLACE FUNCTION public.dp_ocorrencias_corte_obter(p_company_id uuid)
RETURNS smallint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.ocorrencias_corte_dia FROM public.dp_config_dp c
  WHERE c.company_id = p_company_id AND c.unidade_id IS NULL
    AND private.is_company_member(auth.uid(), p_company_id)
$$;

REVOKE ALL ON FUNCTION public.dp_ocorrencias_corte_definir(uuid, smallint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_ocorrencias_corte_obter(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_ocorrencias_corte_definir(uuid, smallint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_ocorrencias_corte_obter(uuid) TO authenticated, service_role;