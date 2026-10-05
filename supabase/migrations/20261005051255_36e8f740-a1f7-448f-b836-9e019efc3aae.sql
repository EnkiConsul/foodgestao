CREATE OR REPLACE FUNCTION public.dp_troca_termo_cpfs(_troca_id uuid)
RETURNS TABLE(solicitante_cpf text, destino_cpf text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  t public.dp_trocas%ROWTYPE;
  v_colab uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'nao_autenticado' USING ERRCODE = '42501'; END IF;
  SELECT * INTO t FROM public.dp_trocas WHERE id = _troca_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'troca_nao_encontrada' USING ERRCODE = '22023'; END IF;
  IF t.status <> 'aprovada' THEN RAISE EXCEPTION 'termo_indisponivel' USING ERRCODE = 'check_violation'; END IF;

  v_colab := public.dp_colaborador_ativo_of(_uid);
  IF NOT (
       v_colab IN (t.solicitante_id, t.destino_id)
    OR private.is_company_admin_or_owner(_uid, t.company_id)
    OR public.tem_permissao(t.company_id, 'dp.folgas', 'consulta')
    OR public.is_super_admin(_uid)
  ) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT (SELECT c.cpf FROM public.dp_colaboradores c WHERE c.id = t.solicitante_id),
         (SELECT c.cpf FROM public.dp_colaboradores c WHERE c.id = t.destino_id);
END $function$;