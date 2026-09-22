CREATE OR REPLACE FUNCTION public.dp_convocacoes_remuneracao_atual(p_ids uuid[])
RETURNS TABLE(convocacao_id uuid, snapshot jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_meu uuid;
  v_uid uuid := auth.uid();
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  v_meu := public.dp_meu_colaborador();

  RETURN QUERY
  SELECT c.id,
         public.dp_convocacao_remuneracao_snapshot(c.colaborador_id, c.carga_prevista_horas)
    FROM public.dp_convocacoes c
   WHERE c.id = ANY(p_ids)
     AND c.status::text IN ('pendente', 'aceita')
     AND (
       (v_meu IS NOT NULL AND c.colaborador_id = v_meu)
       OR EXISTS (
         SELECT 1 FROM public.company_members m
          WHERE m.company_id = c.company_id AND m.user_id = v_uid
       )
       OR EXISTS (
         SELECT 1 FROM public.companies e
          WHERE e.id = c.company_id AND e.user_id = v_uid
       )
     );
END;
$function$;