CREATE OR REPLACE FUNCTION public.dp_expirar_trocas()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_service boolean := COALESCE(auth.role(), '') = 'service_role' OR auth.uid() IS NULL AND current_user IN ('postgres','supabase_admin');
  v_uid uuid := auth.uid();
BEGIN
  IF NOT v_service AND v_uid IS NULL THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE = '42501';
  END IF;

  WITH alvo AS (
    SELECT t.id, LEAST(t.data_original, t.data_proposta) AS limite
    FROM public.dp_trocas t
    WHERE t.status IN ('pendente_colega', 'pendente_gestor')
      AND LEAST(t.data_original, t.data_proposta) < v_hoje
      AND (v_service OR t.company_id IN (SELECT private.get_user_company_ids(v_uid)))
    FOR UPDATE
  )
  UPDATE public.dp_trocas t
  SET status = 'expirada',
      gestor_resposta = COALESCE(
        t.gestor_resposta,
        'expirada: sem resposta até o fim do dia ' || to_char(a.limite, 'DD/MM/YYYY')
      ),
      gestor_respondido_em = COALESCE(t.gestor_respondido_em, now())
  FROM alvo a
  WHERE t.id = a.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
REVOKE ALL ON FUNCTION public.dp_expirar_trocas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_expirar_trocas() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.increment_rule_hit(p_rule_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; v_uid uuid := auth.uid();
BEGIN
  SELECT id, user_id, company_id INTO r FROM public.categorization_rules WHERE id = p_rule_id;
  IF r.id IS NULL THEN RETURN; END IF;
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT (
       r.user_id = v_uid
    OR (r.company_id IS NOT NULL AND COALESCE(private.is_company_member(v_uid, r.company_id), false))
    OR (r.company_id IS NULL AND r.user_id IS NULL AND v_uid IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para esta regra.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.categorization_rules
     SET hit_count = hit_count + 1, last_hit_at = now()
   WHERE id = p_rule_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.increment_rule_hit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_rule_hit(uuid) TO authenticated, service_role;