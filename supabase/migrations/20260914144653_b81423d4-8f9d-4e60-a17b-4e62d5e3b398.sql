DO $mig$
DECLARE
  r record;
  v_pos int;
  v_head text;
  v_tail text;
  v_new text;
BEGIN
  SELECT p.oid, p.proname, pg_get_function_arguments(p.oid) AS args,
         pg_get_function_result(p.oid) AS res, p.prosrc
    INTO r
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'dp_folga_limite_dia';

  v_pos := position(E'r.vigencia_inicio DESC NULLS LAST\n  LOOP' in r.prosrc);
  IF v_pos = 0 THEN
    RAISE EXCEPTION 'laco nao localizado';
  END IF;
  v_pos := v_pos + length(E'r.vigencia_inicio DESC NULLS LAST\n  LOOP');

  v_head := left(r.prosrc, v_pos);
  v_tail := substr(r.prosrc, v_pos + 1);

  v_head := replace(v_head, E'  r record;', E'  rec record;');
  v_head := replace(v_head, '  FOR r IN', '  FOR rec IN');
  IF position('FOR rec IN' in v_head) = 0 OR position('rec record;' in v_head) = 0 THEN
    RAISE EXCEPTION 'renomeacao do laco falhou';
  END IF;

  v_tail := replace(v_tail, 'r.tipo', 'rec.tipo');
  v_tail := replace(v_tail, 'r.id', 'rec.id');
  v_tail := replace(v_tail, 'r.maximo', 'rec.maximo');
  v_tail := replace(v_tail, 'r.nome', 'rec.nome');

  v_new := v_head || v_tail;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS %s',
    r.proname, r.args, r.res, quote_literal(v_new));
END $mig$;

DROP FUNCTION IF EXISTS public.dp_folga_solicitar(date, text);