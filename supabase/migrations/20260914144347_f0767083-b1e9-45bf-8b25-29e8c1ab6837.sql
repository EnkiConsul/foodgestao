CREATE OR REPLACE FUNCTION public.dp_folga_escopo_empresa_ok(_company uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NULL
      OR EXISTS (SELECT 1 FROM public.company_members m
                  WHERE m.company_id = _company AND m.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.companies c
                  WHERE c.id = _company AND c.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.dp_colaboradores k
                  WHERE k.company_id = _company AND k.user_id = auth.uid()
                    AND k.deleted_at IS NULL);
$$;

REVOKE ALL ON FUNCTION public.dp_folga_escopo_empresa_ok(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_folga_escopo_empresa_ok(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.dp_folga_escopo_empresa_ok(uuid) TO authenticated, service_role;

DO $mig$
DECLARE
  r record;
  v_new text;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           pg_get_function_arguments(p.oid) AS args,
           pg_get_function_result(p.oid) AS res,
           p.prosrc
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('dp_folga_limite_dia', 'dp_folga_reserva_indisponibilidade')
       AND position('owner_id' in p.prosrc) > 0
  LOOP
    v_new := replace(
      r.prosrc,
      'IF v_uid IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.company_members m
                       WHERE m.company_id = p_company AND m.user_id = v_uid)
     AND NOT EXISTS (SELECT 1 FROM public.companies c
                       WHERE c.id = p_company AND c.owner_id = v_uid) THEN',
      'IF NOT public.dp_folga_escopo_empresa_ok(p_company) THEN');
    IF v_new = r.prosrc THEN
      RAISE EXCEPTION 'guard nao localizado em %', r.proname;
    END IF;
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS %s',
      r.proname, r.args, r.res, quote_literal(v_new));
  END LOOP;
END $mig$;