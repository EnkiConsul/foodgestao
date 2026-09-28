-- A validação automática de pedidos de folga (gatilho em dp_solicitacoes) roda com
-- os privilégios de quem insere a linha e precisa executar dp_regra_bloqueia_data.
-- Reverter: REVOKE ALL ON FUNCTION public.dp_regra_bloqueia_data(...) FROM authenticated;
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'dp_regra_bloqueia_data'
      AND p.prorettype <> 'trigger'::regtype
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', r.proname, r.args);
  END LOOP;
END
$$;