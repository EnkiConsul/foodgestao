CREATE OR REPLACE FUNCTION public.dp_ocorrencia_tratar(_ocorrencia_id uuid, _decisao text, _observacao text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o record;
BEGIN
  IF _decisao NOT IN ('confirmada','ajuste_solicitado','nao_se_aplica','compensacao','abono','desconto') THEN
    RAISE EXCEPTION 'OCORRENCIA_TRATATIVA_INVALIDA';
  END IF;
  SELECT * INTO o FROM public.dp_ocorrencias WHERE id = _ocorrencia_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_NAO_ENCONTRADA'; END IF;
  IF NOT private.is_company_admin_or_owner(auth.uid(), o.company_id) THEN RAISE EXCEPTION 'OCORRENCIA_SEM_PERMISSAO'; END IF;

  UPDATE public.dp_ocorrencias SET
    tratativa_ponto = (_decisao <> 'nao_se_aplica'),
    tratativa_status = CASE WHEN _decisao = 'nao_se_aplica' THEN 'nao_se_aplica'::public.dp_ocorrencia_tratativa_status
                            ELSE 'concluida'::public.dp_ocorrencia_tratativa_status END,
    tratativa_decisao = CASE WHEN _decisao = 'nao_se_aplica' THEN NULL ELSE _decisao END,
    tratativa_observacao = NULLIF(btrim(COALESCE(_observacao,'')),'')
  WHERE id = _ocorrencia_id;

  INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, campo, valor_anterior, valor_novo, metadata, autor_id)
  VALUES (o.company_id, _ocorrencia_id, 'tratativa_concluida', 'tratativa_decisao', o.tratativa_decisao, _decisao,
          jsonb_build_object('observacao', NULLIF(btrim(COALESCE(_observacao,'')),'')), auth.uid());
END;
$function$;