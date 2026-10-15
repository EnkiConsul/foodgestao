CREATE OR REPLACE FUNCTION public.dp_ocorrencia_marcar_lancado(_id uuid, _lancado boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.dp_ocorrencias WHERE id = _id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_NAO_ENCONTRADA'; END IF;
  IF NOT public.tem_permissao(v_company, 'dp.ocorrencias', 'alteracao') THEN
    RAISE EXCEPTION 'SEM_PERMISSAO';
  END IF;
  UPDATE public.dp_ocorrencias
     SET lancado_ponto_em = CASE WHEN _lancado THEN now() END,
         lancado_ponto_por = CASE WHEN _lancado THEN auth.uid() END
   WHERE id = _id;
END $$;